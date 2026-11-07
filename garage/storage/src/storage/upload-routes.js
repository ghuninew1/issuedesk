import { appAuth } from '../app-auth.js'
import { createUploads, UPLOAD_LIMITS } from './uploads.js'

const statuses = { NOT_FOUND: 404, INVALID_INPUT: 400, NAME_CONFLICT: 409, UPLOAD_CONFLICT: 409,
  UPLOAD_EXPIRED: 410, UPLOAD_TOO_LARGE: 413, UPLOAD_CHECKSUM_MISMATCH: 422, UPLOAD_BUSY: 429,
  TRANSFER_INCOMPLETE: 502, PROVIDER_UNAVAILABLE: 503 }

export function registerUploadRoutes(app, { db, storage, enabled }) {
  const migrated = db.prepare("SELECT 1 FROM storage_schema_migrations WHERE version = 2").get()
  if (!enabled && !migrated) return
  if (!migrated) throw new Error('Storage migration 0002 is required for resumable uploads')
  const uploads = createUploads({ db, provider: storage.multipart })
  const base = '/v3/projects/:projectId/uploads'
  const run = (action, status = 200) => async c => {
    try {
      if (!enabled && c.req.method !== 'DELETE') return c.json({ success: false, error: { code: 'CAPABILITY_UNAVAILABLE' } }, 422)
      const value = await action(c, { projectId: c.req.param('projectId'), appId: c.get('app').id, id: c.req.param('uploadId') })
      return c.json({ success: true, ...value }, status)
    } catch (error) {
      const code = Object.hasOwn(statuses, error?.code) ? error.code : 'PROVIDER_UNAVAILABLE'
      return c.json({ success: false, error: { code, message: 'The upload request could not be completed.', retryable: [429,502,503].includes(statuses[code]) } }, statuses[code])
    }
  }
  async function json(c) {
    if (!/^application\/json(?:;|$)/i.test(c.req.header('Content-Type') || '')) throw { code: 'INVALID_INPUT' }
    const reader = c.req.raw.body?.getReader()
    if (!reader) throw { code: 'INVALID_INPUT' }
    const chunks = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > 8192) throw { code: 'INVALID_INPUT' }
        chunks.push(Buffer.from(value))
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw { code: 'INVALID_INPUT' }
      return body
    } finally { await reader.cancel().catch(() => {}) }
  }
  app.post(base, appAuth, run(async (c, args) => uploads.create({ ...args, key: c.req.header('Idempotency-Key'), body: await json(c) }), 201))
  app.get(`${base}/:uploadId`, appAuth, run((c, args) => uploads.status({ ...args, cursor: c.req.query('partsCursor'), limit: c.req.query('limit') })))
  app.put(`${base}/:uploadId/parts/:partNumber`, appAuth, run((c, args) => {
    if (c.req.header('Content-Type') !== 'application/octet-stream') throw { code: 'INVALID_INPUT' }
    return uploads.part({ ...args, number: c.req.param('partNumber'), digest: c.req.header('X-Part-SHA256'), body: c.req.raw.body, signal: c.req.raw.signal })
  }))
  for (const action of ['complete','pause','resume']) app.post(`${base}/:uploadId/${action}`, appAuth, run(async (c, args) => {
    const body = await json(c)
    if (Object.keys(body).some(k => k !== 'version') || !Number.isInteger(body.version) || body.version < 0) throw { code: 'INVALID_INPUT' }
    return uploads.action({ ...args, action, version: body.version })
  }))
  app.delete(`${base}/by-key/:requestKey`, appAuth, run((c, args) => uploads.cancelByKey({ ...args, key: c.req.param('requestKey') })))
  app.delete(`${base}/:uploadId`, appAuth, run((c, args) => uploads.action({ ...args, action: 'cancel' })))
  return uploads
}

export function resumableCapabilities(enabled) {
  return enabled ? { resumableUpload: true, ...UPLOAD_LIMITS } : { resumableUpload: false }
}
