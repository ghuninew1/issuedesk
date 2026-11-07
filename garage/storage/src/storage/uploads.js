import { createHash, randomUUID } from 'node:crypto'
import { StorageError } from './errors.js'
import { legacyNameKey, normalizeObjectName } from './names.js'
import { safeContentType } from './validation.js'

export const UPLOAD_LIMITS = Object.freeze({ maxFileBytes: 10 * 1024 ** 3, partSizeBytes: 8 * 1024 ** 2,
  maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 7 * 86400 })
const LEASE_MS = 15 * 60 * 1000
const OPERATION_MS = 4 * 60 * 1000
const idPattern = /^[A-Za-z0-9_-]{1,128}$/u
const fail = code => { throw new StorageError(code) }
const hash = value => createHash('sha256').update(value).digest('base64')

export function createUploads({ db, provider, now = Date.now }) {
  const session = id => db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(id)
  const parts = id => db.prepare('SELECT * FROM upload_parts WHERE session_id = ? ORDER BY part_number').all(id)
  function scope(projectId, appId) {
    const project = db.prepare("SELECT * FROM projects WHERE id = ? AND app_id = ? AND status = 'active'").get(projectId, appId)
    if (!project) fail('NOT_FOUND')
    return project
  }
  function owned({ id, projectId, appId }) {
    scope(projectId, appId)
    const row = idPattern.test(id || '') && session(id)
    if (!row || row.project_id !== projectId) fail('NOT_FOUND')
    return row
  }
  function parent(row) {
    if (row.parent_id !== null && !db.prepare("SELECT 1 FROM storage_objects WHERE project_id = ? AND object_id = ? AND type = 'folder' AND deleted_at IS NULL").get(row.project_id, row.parent_id)) fail('NOT_FOUND')
  }
  function nameAvailable(row) {
    const entries = db.prepare('SELECT object_id, name FROM storage_objects WHERE project_id = ? AND parent_id IS ? AND deleted_at IS NULL').all(row.project_id, row.parent_id)
    if (entries.some(e => legacyNameKey(e.name, e.object_id) === row.normalized_name)) fail('NAME_CONFLICT')
    const reservation = db.prepare('SELECT reservation_id FROM storage_name_reservations WHERE project_id = ? AND parent_id IS ? AND normalized_name = ?').get(row.project_id, row.parent_id, row.normalized_name)
    if (reservation && reservation.reservation_id !== row.id) fail('NAME_CONFLICT')
  }
  function result(row, cursor = 0, limit = 100) {
    const receipts = parts(row.id).filter(p => p.etag)
    const selected = receipts.filter(p => p.part_number > cursor).slice(0, limit)
    return { uploadSessionId: row.id, state: row.state, version: row.version, sizeBytes: row.size_bytes,
      partSizeBytes: row.part_size, partCount: row.part_count, expiresAt: row.expires_at,
      acknowledgedBytes: receipts.reduce((n, p) => n + p.size_bytes, 0),
      parts: selected.map(p => ({ partNumber: p.part_number, sizeBytes: p.size_bytes, sha256: p.sha256 })),
      nextCursor: receipts.some(p => p.part_number > (selected.at(-1)?.part_number ?? cursor)) ? String(selected.at(-1).part_number) : null,
      ...(row.state === 'completed' ? { object: { objectId: row.object_id, parentId: row.parent_id, type: 'file', name: row.name,
        mimeType: row.mime_type, sizeBytes: row.size_bytes } } : {}) }
  }
  async function locked(row, action, cleanupOnly = false) {
    const token = randomUUID()
    const acquired = db.prepare('UPDATE upload_sessions SET lock_token = ?, lock_until = ? WHERE id = ? AND lock_until < ?')
      .run(token, now() + LEASE_MS, row.id, now()).changes
    if (!acquired) fail('UPLOAD_CONFLICT')
    // A whole operation is bounded well below the lease. Completed/cancelling states
    // fence incompatible operations even after a process crash and lease expiry.
    const signal = AbortSignal.timeout(OPERATION_MS)
    const project = cleanupOnly ? db.prepare('SELECT bucket FROM projects WHERE id = ? AND app_id = ?').get(row.project_id, row.appId) : scope(row.project_id, row.appId)
    const input = { mount: { provider: 'garage', bucket: project.bucket },
      providerRef: row.provider_reference, sessionId: row.id, uploadId: row.provider_upload_id, signal,
      assertLease() {
        const lease = session(row.id)
        if (signal.aborted || lease.lock_token !== token || lease.lock_until <= now()) fail('UPLOAD_CONFLICT')
      } }
    try { return await action(session(row.id), input) }
    finally { db.prepare('UPDATE upload_sessions SET lock_token = NULL, lock_until = 0 WHERE id = ? AND lock_token = ?').run(row.id, token) }
  }
  function advance(id, state) {
    db.prepare('UPDATE upload_sessions SET state = ?, version = version + 1 WHERE id = ?').run(state, id)
    return session(id)
  }
  async function ensureCreated(row, input) {
    if (!row.provider_upload_id) {
      // Reconcile a create response lost between S3 and the SQLite receipt.
      const existing = await provider.discover(input)
      const uploadId = existing[0] || await provider.create({ ...input, mimeType: row.mime_type })
      input.assertLease()
      db.prepare('UPDATE upload_sessions SET provider_upload_id = ? WHERE id = ?').run(uploadId, row.id)
      for (const duplicate of existing.slice(1)) await provider.abort({ ...input, uploadId: duplicate })
      row = advance(row.id, 'active')
    }
    return row
  }
  function live(row) {
    if (row.expires_at <= now()) fail('UPLOAD_EXPIRED')
    if (!['creating','active','paused'].includes(row.state)) fail('UPLOAD_CONFLICT')
  }
  async function reconcile(row, input) {
    const remote = await provider.parts({ ...input, uploadId: row.provider_upload_id })
    input.assertLease()
    if (remote === null) fail('TRANSFER_INCOMPLETE')
    const byNumber = new Map(remote.map(p => [p.number, p]))
    for (const receipt of parts(row.id)) {
      const actual = byNumber.get(receipt.part_number)
      if (receipt.etag && (!actual || actual.etag !== receipt.etag || actual.size !== receipt.size_bytes)) {
        db.prepare('UPDATE upload_parts SET etag = NULL WHERE session_id = ? AND part_number = ?').run(row.id, receipt.part_number)
      }
    }
    return remote
  }
  async function cleanup(row, input, expired = false) {
    input.assertLease()
    if (row.state === 'completed') fail('UPLOAD_CONFLICT')
    // Durable cancellation intent; no publication is allowed after this transition.
    if (!['cancelled','expired'].includes(row.state)) advance(row.id, 'cancelling')
    const ids = new Set(await provider.discover(input))
    if (row.provider_upload_id) ids.add(row.provider_upload_id)
    for (const uploadId of ids) await provider.abort({ ...input, uploadId })
    if ((await provider.discover(input)).length) fail('TRANSFER_INCOMPLETE')
    const object = await provider.head(input)
    if (object) {
      if (object.sessionId !== row.id) fail('TRANSFER_INCOMPLETE')
      await provider.delete(input)
    }
    input.assertLease()
    db.prepare('DELETE FROM storage_name_reservations WHERE reservation_id = ?').run(row.id)
    const target = expired || row.state === 'expired' || row.expires_at <= now() ? 'expired' : 'cancelled'
    if (session(row.id).state !== target) advance(row.id, target)
    return result(session(row.id))
  }
  async function finish(row, input) {
    input.assertLease()
    parent(row)
    nameAvailable(row)
    let head = await provider.head(input)
    if (!head) {
      await reconcile(row, input)
      const receipts = parts(row.id)
      if (receipts.length !== row.part_count || receipts.some((p, i) => !p.etag || p.part_number !== i + 1)) fail('TRANSFER_INCOMPLETE')
      await provider.complete({ ...input, uploadId: row.provider_upload_id, parts: receipts })
      head = await provider.head(input)
    }
    if (!head || head.sessionId !== row.id || head.size !== row.size_bytes) fail('TRANSFER_INCOMPLETE')
    // Same object ID on every retry. A failed commit leaves 'completing', recoverable
    // via HEAD, rather than attempting a second object or deleting uncertain bytes.
    db.transaction(() => {
      input.assertLease()
      parent(row)
      nameAvailable(row)
      db.prepare('INSERT INTO files (id,project_id,object_key,original_name,content_type,size) VALUES (?,?,?,?,?,?)')
        .run(row.object_id, row.project_id, row.provider_reference, row.name, row.mime_type, row.size_bytes)
      db.prepare("INSERT INTO storage_objects (object_id,project_id,parent_id,type,name,normalized_name,provider_reference,content_type,size_bytes) VALUES (?,?,?,'file',?,?,?,?,?)")
        .run(row.object_id, row.project_id, row.parent_id, row.name, row.normalized_name, row.provider_reference, row.mime_type, row.size_bytes)
      db.prepare('DELETE FROM storage_name_reservations WHERE reservation_id = ?').run(row.id)
      advance(row.id, 'completed')
    }).immediate()
    return result(session(row.id))
  }
  return {
    async create({ projectId, appId, key, body }) {
      scope(projectId, appId)
      if (!idPattern.test(key || '') || !body || Object.keys(body).some(k => !['name','parentId','sizeBytes','mimeType','expiresAt'].includes(k))) fail('INVALID_INPUT')
      if (db.prepare('SELECT 1 FROM upload_cancellations WHERE project_id = ? AND request_key = ?').get(projectId, key)) fail('UPLOAD_CONFLICT')
      const { name, normalizedName } = normalizeObjectName(body.name)
      const parentId = body.parentId ?? null
      if (parentId !== null && !idPattern.test(parentId)) fail('INVALID_INPUT')
      if (!Number.isSafeInteger(body.sizeBytes) || body.sizeBytes <= 0) fail('INVALID_INPUT')
      if (body.sizeBytes > UPLOAD_LIMITS.maxFileBytes) fail('UPLOAD_TOO_LARGE')
      const mimeType = safeContentType(body.mimeType || 'application/octet-stream')
      const fingerprint = hash(JSON.stringify([name, parentId, body.sizeBytes, mimeType]))
      let row = db.prepare('SELECT * FROM upload_sessions WHERE project_id = ? AND request_key = ?').get(projectId, key)
      if (row && row.fingerprint !== fingerprint) fail('UPLOAD_CONFLICT')
      if (!row) db.transaction(() => {
        const budget = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(size_bytes),0) bytes FROM upload_sessions WHERE project_id = ? AND state NOT IN ('completed','cancelled','expired')").get(projectId)
        if (budget.n >= 20 || budget.bytes + body.sizeBytes > 100 * 1024 ** 3) fail('UPLOAD_BUSY')
        row = { id: randomUUID(), project_id: projectId, parent_id: parentId, normalized_name: normalizedName }
        parent(row)
        db.prepare('DELETE FROM storage_name_reservations WHERE expires_at <= CURRENT_TIMESTAMP').run()
        nameAvailable(row)
        const expiry = body.expiresAt ?? now() + UPLOAD_LIMITS.sessionTtlSeconds * 1000
        if (!Number.isSafeInteger(expiry) || expiry <= now() || expiry > now() + UPLOAD_LIMITS.sessionTtlSeconds * 1000) fail('INVALID_INPUT')
        db.prepare("INSERT INTO upload_sessions (id,project_id,request_key,fingerprint,object_id,provider_reference,name,normalized_name,parent_id,mime_type,size_bytes,part_size,part_count,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'creating',?,?)")
          .run(row.id, projectId, key, fingerprint, randomUUID(), randomUUID(), name, normalizedName, parentId, mimeType, body.sizeBytes, UPLOAD_LIMITS.partSizeBytes, Math.ceil(body.sizeBytes / UPLOAD_LIMITS.partSizeBytes), now(), expiry)
        db.prepare('INSERT INTO storage_name_reservations VALUES (?,?,?,?,?)').run(row.id, projectId, parentId, normalizedName, new Date(expiry).toISOString().replace('T',' ').slice(0,19))
        row = session(row.id)
      }).immediate()
      if (row.state !== 'creating') return result(row)
      live(row)
      return locked({ ...row, appId }, async (current, input) => result(await ensureCreated(current, input)))
    },
    async cancelByKey({ projectId, appId, key }) {
      scope(projectId, appId)
      if (!idPattern.test(key || '')) fail('INVALID_INPUT')
      db.prepare('INSERT OR IGNORE INTO upload_cancellations VALUES (?,?)').run(projectId, key)
      const row = db.prepare('SELECT * FROM upload_sessions WHERE project_id = ? AND request_key = ?').get(projectId, key)
      if (!row) return { state: 'cancelled' }
      if (row.state === 'completed' || row.state === 'completing') fail('UPLOAD_CONFLICT')
      return locked({ ...row, appId }, (current, input) => cleanup(current, input))
    },
    async status(args) {
      const row = owned(args)
      const cursor = Number(args.cursor || 0), limit = Number(args.limit || 100)
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > row.part_count || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('INVALID_INPUT')
      if (['creating','active','paused'].includes(row.state) && row.expires_at > now()) {
        return locked({ ...row, appId: args.appId }, async (current, input) => {
          current = await ensureCreated(current, input)
          await reconcile(current, input)
          return result(current, cursor, limit)
        })
      }
      return result(row, cursor, limit)
    },
    async part(args) {
      const row = owned(args)
      live(row)
      if (row.state !== 'active') fail('UPLOAD_CONFLICT')
      const number = Number(args.number)
      if (!Number.isInteger(number) || number < 1 || number > row.part_count || !/^[A-Za-z0-9+/]{43}=$/u.test(args.digest || '')) fail('INVALID_INPUT')
      const expected = number === row.part_count ? row.size_bytes - (number - 1) * row.part_size : row.part_size
      return locked({ ...row, appId: args.appId }, async (current, input) => {
        live(current)
        if (current.state !== 'active') fail('UPLOAD_CONFLICT')
        // Bounded to one negotiated part, independent of total file size.
        const resourceToken = randomUUID()
        db.transaction(() => {
          db.prepare('DELETE FROM upload_part_leases WHERE expires_at < ?').run(now())
          if (db.prepare('SELECT COUNT(*) n FROM upload_part_leases').get().n >= 4) fail('UPLOAD_BUSY')
          db.prepare('INSERT INTO upload_part_leases VALUES (?,?)').run(resourceToken, now() + LEASE_MS)
        }).immediate()
        try {
          const bytes = Buffer.allocUnsafe(expected)
          const reader = args.body?.getReader()
          if (!reader) fail('INVALID_INPUT')
          let offset = 0
          const abortRead = () => { void reader.cancel().catch(() => {}) }
          input.signal.addEventListener('abort', abortRead, { once: true })
          args.signal?.addEventListener('abort', abortRead, { once: true })
          try {
            while (true) {
              if (input.signal.aborted || args.signal?.aborted) fail('TRANSFER_INCOMPLETE')
              const { done, value } = await reader.read()
              if (done) break
              if (offset + value.byteLength > expected) fail('UPLOAD_TOO_LARGE')
              bytes.set(value, offset)
              offset += value.byteLength
            }
            if (offset !== expected || input.signal.aborted || args.signal?.aborted) fail('TRANSFER_INCOMPLETE')
          } finally {
            input.signal.removeEventListener('abort', abortRead)
            args.signal?.removeEventListener('abort', abortRead)
            await reader.cancel().catch(() => {})
          }
          if (hash(bytes) !== args.digest) fail('UPLOAD_CHECKSUM_MISMATCH')
          const previous = db.prepare('SELECT * FROM upload_parts WHERE session_id = ? AND part_number = ?').get(row.id, number)
          if (previous && previous.sha256 !== args.digest) fail('UPLOAD_CONFLICT')
          // An immutable digest journal precedes provider writes. Retrying an unknown
          // outcome can only write identical bytes, including after lease recovery.
          db.prepare('INSERT OR IGNORE INTO upload_parts (session_id,part_number,size_bytes,sha256) VALUES (?,?,?,?)').run(row.id, number, expected, args.digest)
          if (!previous?.etag) {
            const etag = await provider.part({ ...input, uploadId: current.provider_upload_id, number, bytes })
            input.assertLease()
            db.prepare('UPDATE upload_parts SET etag = ? WHERE session_id = ? AND part_number = ?').run(etag, row.id, number)
          }
          return { partNumber: number, sizeBytes: expected, sha256: args.digest }
        } finally { db.prepare('DELETE FROM upload_part_leases WHERE token = ?').run(resourceToken) }
      })
    },
    async action(args) {
      const row = owned(args)
      if (row.state === 'completed') {
        if (args.action !== 'complete') fail('UPLOAD_CONFLICT')
        return result(row)
      }
      return locked({ ...row, appId: args.appId }, async (current, input) => {
        input.assertLease()
        if (args.action === 'cancel') {
          if (current.state === 'completing') fail('UPLOAD_CONFLICT')
          return cleanup(current, input)
        }
        if (current.expires_at <= now()) fail('UPLOAD_EXPIRED')
        if (args.action === 'complete' && current.state === 'completing') return finish(current, input)
        live(current)
        if (args.action === 'complete') {
          if (current.state !== 'active' || current.version !== args.version) fail('UPLOAD_CONFLICT')
          await reconcile(current, input)
          const receipts = parts(row.id)
          if (receipts.length !== row.part_count || receipts.some(p => !p.etag)) fail('TRANSFER_INCOMPLETE')
          input.assertLease()
          return finish(advance(current.id, 'completing'), input)
        }
        const target = args.action === 'pause' ? 'paused' : 'active'
        if (current.state === target) return result(current)
        if (current.version !== args.version || !['active','paused'].includes(current.state)) fail('UPLOAD_CONFLICT')
        return result(advance(current.id, target))
      })
    },
    async sweep(limit = 20) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('INVALID_INPUT')
      const rows = db.prepare("SELECT u.*, p.app_id FROM upload_sessions u JOIN projects p ON p.id = u.project_id WHERE (u.expires_at <= ? OR u.state IN ('cancelling','cancelled','expired')) AND u.state != 'completed' AND u.cleanup_after <= ? AND u.lock_until < ? ORDER BY CASE WHEN u.state IN ('cancelled','expired') THEN 1 ELSE 0 END, u.cleanup_after, u.expires_at LIMIT ?").all(now(), now(), now(), limit)
      let cleaned = 0, pending = 0
      for (const row of rows) {
        try { await locked({ ...row, appId: row.app_id }, (current, input) => cleanup(current, input, current.expires_at <= now()), true); cleaned++ }
        catch { pending++ }
        finally { db.prepare('UPDATE upload_sessions SET cleanup_after = ? WHERE id = ?').run(now() + 60 * 60 * 1000, row.id) }
      }
      return { cleaned, pending }
    },
  }
}
