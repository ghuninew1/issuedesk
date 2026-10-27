import { randomUUID } from 'node:crypto'
import { StorageError } from './errors.js'
import { decodeCursor, encodeCursor, legacyNameKey, normalizeObjectName } from './names.js'

export const MAX_SYNCHRONOUS_OBJECTS = 100
const OBJECT_COLUMNS = `object_id, project_id, parent_id, type, name, content_type, size_bytes,
  created_at, updated_at, deleted_at`

function notFound() { throw new StorageError('NOT_FOUND') }
function normalizeError(error) {
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return new StorageError('NAME_CONFLICT')
  throw error
}

const SAFE_ERROR_TYPES = new Set(['StorageError', 'Error', 'TypeError', 'AbortError', 'TimeoutError', 'NoSuchKey', 'NotFound'])

function safeErrorType(error) {
  return SAFE_ERROR_TYPES.has(error?.name) ? error.name : 'Other'
}

function copyDiagnostic(logger, fields) {
  try {
    const message = ['[storage-copy]', ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(' ')
    logger?.warn?.(message)
  } catch {
    // Diagnostics must not affect Copy behavior.
  }
}

function serialize(row) {
  return {
    objectId: row.object_id,
    projectId: row.project_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    mimeType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    modifiedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function createFileManager({ db, storage, maxSynchronousObjects = MAX_SYNCHRONOUS_OBJECTS, logger = console }) {
  if (!Number.isSafeInteger(maxSynchronousObjects) || maxSynchronousObjects < 1) throw new TypeError('Invalid synchronous operation limit')

  const activeProject = (projectId, appId) => db.prepare(`
    SELECT id, name, bucket FROM projects
    WHERE id = ? AND app_id = ? AND status = 'active'
  `).get(projectId, appId)

  const object = (projectId, objectId, includeTrash = false) => db.prepare(`
    SELECT ${OBJECT_COLUMNS}, provider_reference, normalized_name, trash_root_id
    FROM storage_objects
    WHERE project_id = ? AND object_id = ? ${includeTrash ? '' : 'AND deleted_at IS NULL'}
  `).get(projectId, objectId)

  const parentFolder = (projectId, parentId) => {
    if (parentId === null) return null
    if (typeof parentId !== 'string' || !parentId) notFound()
    const parent = object(projectId, parentId)
    if (!parent || parent.type !== 'folder') notFound()
    return parent
  }

  const assertNameAvailable = (projectId, parentId, name, excludeId = null) => {
    db.prepare('DELETE FROM storage_name_reservations WHERE expires_at <= CURRENT_TIMESTAMP').run()
    const candidates = db.prepare(`
      SELECT object_id, name FROM storage_objects
      WHERE project_id = ? AND parent_id IS ? AND deleted_at IS NULL AND object_id != ?
    `).all(projectId, parentId, excludeId || '')
    const nameKey = normalizeObjectName(name).normalizedName
    if (candidates.some((candidate) => legacyNameKey(candidate.name, candidate.object_id) === nameKey)) throw new StorageError('NAME_CONFLICT')
    if (db.prepare('SELECT 1 FROM storage_name_reservations WHERE project_id = ? AND parent_id IS ? AND normalized_name = ?').get(projectId, parentId, nameKey)) throw new StorageError('NAME_CONFLICT')
  }

  const tree = (projectId, rootId, includeTrash = false, limit = maxSynchronousObjects + 1) => {
    const root = object(projectId, rootId, includeTrash)
    if (!root) return []
    const rows = [root]
    const seen = new Set([rootId])
    let frontier = [rootId]
    while (frontier.length && rows.length < limit) {
      const next = []
      for (const parentId of frontier) {
        const children = db.prepare(`
          SELECT ${OBJECT_COLUMNS}, provider_reference, normalized_name, trash_root_id
          FROM storage_objects WHERE project_id = ? AND parent_id = ? ${includeTrash ? '' : 'AND deleted_at IS NULL'}
          ORDER BY normalized_name, object_id LIMIT ?
        `).all(projectId, parentId, limit - rows.length)
        for (const child of children) {
          if (seen.has(child.object_id)) continue
          seen.add(child.object_id)
          rows.push(child)
          next.push(child.object_id)
          if (rows.length >= limit) break
        }
        if (rows.length >= limit) break
      }
      frontier = next
    }
    return rows
  }

  const beginOperation = (projectId, type, sourceId, targetParentId, totalItems = 0) => {
    const operationId = randomUUID()
    db.prepare(`
      INSERT INTO storage_operations (operation_id, project_id, type, status, source_object_id, target_parent_id, total_items)
      VALUES (?, ?, ?, 'running', ?, ?, ?)
    `).run(operationId, projectId, type, sourceId, targetParentId, totalItems)
    return operationId
  }

  const finishOperation = (operationId, status, errorCode = null, completedItems = 0, details = null) => {
    db.prepare(`
      UPDATE storage_operations SET status = ?, error_code = ?, completed_items = ?, details_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE operation_id = ?
    `).run(status, errorCode, completedItems, details ? JSON.stringify(details) : null, operationId)
  }

  const setOperationDetails = (operationId, details) => db.prepare('UPDATE storage_operations SET details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE operation_id = ?').run(JSON.stringify(details), operationId)

  const failOperation = (operationId, errorCode, completedItems = 0, details = null, status = 'failed') => {
    finishOperation(operationId, status, errorCode, completedItems, details)
    const error = new StorageError(errorCode)
    error.operationId = operationId
    throw error
  }

  const insertLegacyFile = (tx, projectId, row, providerReference = row.provider_reference) => {
    tx.prepare(`
      INSERT INTO files (id, project_id, object_key, original_name, content_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(row.object_id, projectId, providerReference, row.name, row.content_type || 'application/octet-stream', row.size_bytes ?? 0, row.created_at)
  }

  const touchLegacyFile = (tx, row, name) => {
    if (row.type === 'file' && tx.prepare('SELECT 1 FROM files WHERE id = ?').get(row.object_id)) {
      tx.prepare('UPDATE files SET original_name = ? WHERE id = ? AND project_id = ?').run(name, row.object_id, row.project_id)
    }
  }

  const list = ({ projectId, appId, parentId = null, cursor = null, limit = 50, trash = false }) => {
    const project = activeProject(projectId, appId)
    if (!project) notFound()
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new StorageError('INVALID_INPUT')
    let after = null
    if (cursor) after = decodeCursor(cursor)
    if (trash) {
      if (parentId !== null) throw new StorageError('INVALID_INPUT')
      const rows = db.prepare(`
        SELECT ${OBJECT_COLUMNS}, provider_reference, normalized_name, trash_root_id
        FROM storage_objects WHERE project_id = ? AND deleted_at IS NOT NULL AND trash_root_id = object_id
        ${after ? 'AND (normalized_name > ? OR (normalized_name = ? AND object_id > ?))' : ''}
        ORDER BY normalized_name, object_id LIMIT ?
      `).all(...(after ? [projectId, after.name, after.name, after.id, limit + 1] : [projectId, limit + 1]))
      const page = rows.slice(0, limit)
      return { items: page.map(serialize), nextCursor: rows.length > limit ? encodeCursor({ name: page.at(-1).normalized_name, id: page.at(-1).object_id }) : null }
    }
    parentFolder(projectId, parentId)
    const rows = db.prepare(`
      SELECT ${OBJECT_COLUMNS}, provider_reference, normalized_name, trash_root_id
      FROM storage_objects WHERE project_id = ? AND parent_id IS ? AND deleted_at IS NULL
      ${after ? 'AND (normalized_name > ? OR (normalized_name = ? AND object_id > ?))' : ''}
      ORDER BY normalized_name, object_id LIMIT ?
    `).all(...(after ? [projectId, parentId, after.name, after.name, after.id, limit + 1] : [projectId, parentId, limit + 1]))
    const page = rows.slice(0, limit)
    return { items: page.map(serialize), nextCursor: rows.length > limit ? encodeCursor({ name: page.at(-1).normalized_name, id: page.at(-1).object_id }) : null }
  }

  const stat = ({ projectId, appId, objectId }) => {
    if (!activeProject(projectId, appId)) notFound()
    const row = object(projectId, objectId)
    if (!row) notFound()
    return serialize(row)
  }

  const createFolder = ({ projectId, appId, parentId = null, name }) => {
    if (!activeProject(projectId, appId)) notFound()
    const { name: cleanName, normalizedName } = normalizeObjectName(name)
    try {
      const create = db.transaction(() => {
        parentFolder(projectId, parentId)
        assertNameAvailable(projectId, parentId, cleanName)
        const objectId = randomUUID()
        db.prepare(`
          INSERT INTO storage_objects (object_id, project_id, parent_id, type, name, normalized_name, created_at, updated_at)
          VALUES (?, ?, ?, 'folder', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(objectId, projectId, parentId, cleanName, normalizedName)
        return serialize(object(projectId, objectId))
      })
      return create.immediate()
    } catch (error) { return normalizeError(error) }
  }

  const rename = ({ projectId, appId, objectId, name }) => {
    if (!activeProject(projectId, appId)) notFound()
    const { name: cleanName, normalizedName } = normalizeObjectName(name)
    try {
      const update = db.transaction(() => {
        const row = object(projectId, objectId)
        if (!row) notFound()
        assertNameAvailable(projectId, row.parent_id, cleanName, objectId)
        db.prepare('UPDATE storage_objects SET name = ?, normalized_name = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND object_id = ?')
          .run(cleanName, normalizedName, projectId, objectId)
        touchLegacyFile(db, row, cleanName)
        return serialize(object(projectId, objectId))
      })
      return update.immediate()
    } catch (error) { return normalizeError(error) }
  }

  const move = ({ projectId, appId, objectId, parentId }) => {
    if (!activeProject(projectId, appId)) notFound()
    if (parentId !== null && typeof parentId !== 'string') throw new StorageError('INVALID_INPUT')
    try {
      const update = db.transaction(() => {
        const row = object(projectId, objectId)
        if (!row) notFound()
        const target = parentFolder(projectId, parentId)
        if (target?.object_id === objectId) throw new StorageError('INVALID_INPUT')
        const subtree = row.type === 'folder' ? tree(projectId, objectId) : [row]
        if (subtree.length > maxSynchronousObjects) throw new StorageError('OPERATION_TOO_LARGE')
        const descendants = subtree.map((entry) => entry.object_id)
        if (parentId && descendants.includes(parentId)) throw new StorageError('INVALID_INPUT')
        if (row.parent_id === parentId) return serialize(row)
        assertNameAvailable(projectId, parentId, row.name, objectId)
        db.prepare('UPDATE storage_objects SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND object_id = ?').run(parentId, projectId, objectId)
        return serialize(object(projectId, objectId))
      })
      return update.immediate()
    } catch (error) { return normalizeError(error) }
  }

  const copy = async ({ projectId, appId, objectId, parentId = null, signal }) => {
    let diagnosticStage = 'request'
    let providerOperation = 'none'
    let failureLogged = false
    const stage = (name, operation = 'none') => {
      diagnosticStage = name
      providerOperation = operation
      copyDiagnostic(logger, { operation: 'copy', stage: name })
    }
    const logFailure = (error) => {
      if (failureLogged) return
      failureLogged = true
      const status = error?.$metadata?.httpStatusCode ?? error?.statusCode
      copyDiagnostic(logger, {
        operation: 'copy', result: 'error', stage: diagnosticStage,
        errorType: safeErrorType(error), providerOperation,
        ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
      })
    }

    stage('request')
    stage('source-metadata')
    let project
    let source
    let items
    try {
      project = activeProject(projectId, appId)
      if (!project) notFound()
      source = object(projectId, objectId)
      if (!source) notFound()
      parentFolder(projectId, parentId)
      items = tree(projectId, objectId)
      if (!items.length) notFound()
      if (items.length > maxSynchronousObjects) {
        const opId = beginOperation(projectId, 'copy', objectId, parentId, items.length)
        failOperation(opId, 'OPERATION_TOO_LARGE', 0, { maxSynchronousObjects })
      }
    } catch (error) { logFailure(error); throw error }
    stage('destination-reservation')
    try { assertNameAvailable(projectId, parentId, source.name) }
    catch (error) { logFailure(error); throw error }
    const siblingKeys = new Set()
    for (const item of items) {
      const parentKey = item.object_id === source.object_id ? (parentId || 'project-root') : item.parent_id
      const nameKey = normalizeObjectName(item.name).normalizedName
      const key = `${parentKey}:${nameKey}`
      if (siblingKeys.has(key)) { const error = new StorageError('NAME_CONFLICT'); logFailure(error); throw error }
      siblingKeys.add(key)
    }
    let operationId
    let reservation
    try {
      operationId = beginOperation(projectId, 'copy', objectId, parentId, items.length)
      reservation = db.transaction(() => db.prepare(`INSERT INTO storage_name_reservations (reservation_id, project_id, parent_id, normalized_name, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+15 minutes'))`).run(operationId, projectId, parentId, normalizeObjectName(source.name).normalizedName))
    } catch (error) { logFailure(error); throw error }
    try { reservation.immediate() } catch (error) {
      finishOperation(operationId, 'failed', 'NAME_CONFLICT')
      const normalized = normalizeError(error)
      logFailure(normalized)
      throw normalized
    }
    const ids = new Map()
    const copies = []
    try {
      for (const item of items) {
        const newId = randomUUID()
        const newParentId = item.object_id === source.object_id ? parentId : ids.get(item.parent_id)
        if (item.type === 'folder') {
          copies.push({ ...item, object_id: newId, parent_id: newParentId, provider_reference: null, created_at: new Date().toISOString() })
        } else {
          const providerReference = randomUUID()
          setOperationDetails(operationId, { plannedProviderReferences: [...copies.filter((entry) => entry.type === 'file').map((entry) => entry.provider_reference), providerReference] })
          stage('provider-copy')
          try { await storage.copy({
            mount: { provider: 'garage', bucket: project.bucket },
            providerRef: item.provider_reference,
            targetRef: providerReference,
            size: item.size_bytes,
            mimeType: item.content_type,
            signal,
            onCopyStage: (name, operation) => stage(name, operation),
            onCopyFailure: (error, operation) => {
              providerOperation = operation
              logFailure(error)
            },
          }) } catch (error) {
            logFailure(error)
            if (error.cleanupFailed) copies.push({ ...item, provider_reference: providerReference })
            throw error
          }
          copies.push({ ...item, object_id: newId, parent_id: newParentId, provider_reference: providerReference, created_at: new Date().toISOString() })
        }
        ids.set(item.object_id, newId)
      }
      stage('metadata-commit')
      const commit = db.transaction(() => {
        const currentTree = tree(projectId, objectId)
        if (currentTree.length !== items.length || currentTree.some((entry, index) => entry.object_id !== items[index].object_id || entry.provider_reference !== items[index].provider_reference || entry.parent_id !== items[index].parent_id)) throw new StorageError('TRANSFER_INCOMPLETE')
        parentFolder(projectId, parentId)
        for (const item of copies) {
          const { normalizedName } = normalizeObjectName(item.name)
          db.prepare(`
            INSERT INTO storage_objects (object_id, project_id, parent_id, type, name, normalized_name, provider_reference, content_type, size_bytes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(item.object_id, projectId, item.parent_id, item.type, item.name, normalizedName, item.provider_reference, item.content_type, item.size_bytes)
          if (item.type === 'file') insertLegacyFile(db, projectId, item)
        }
        db.prepare('DELETE FROM storage_name_reservations WHERE reservation_id = ?').run(operationId)
        finishOperation(operationId, 'completed', null, copies.length)
      })
      commit.immediate()
      copyDiagnostic(logger, { operation: 'copy', result: 'success' })
      return { object: serialize(object(projectId, ids.get(objectId))), operationId }
    } catch (error) {
      logFailure(error)
      const orphans = []
      for (const item of copies) {
        if (item.type !== 'file') continue
        try { await storage.delete({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: item.provider_reference }) }
        catch { orphans.push(item.provider_reference) }
      }
      const code = error instanceof StorageError ? error.code : error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'NAME_CONFLICT' : error?.code?.startsWith('SQLITE_') ? 'INTERNAL_ERROR' : 'PROVIDER_UNAVAILABLE'
      db.prepare('DELETE FROM storage_name_reservations WHERE reservation_id = ?').run(operationId)
      finishOperation(operationId, orphans.length ? 'partial' : 'failed', code, orphans.length, orphans.length ? { orphanedProviderReferences: orphans } : null)
      const mapped = error instanceof StorageError ? error : new StorageError(code)
      mapped.operationId = operationId
      throw mapped
    }
  }

  const createFile = async ({ projectId, appId, parentId = null, name, contentType, body, size, signal }) => {
    const project = activeProject(projectId, appId)
    if (!project) notFound()
    const { name: cleanName, normalizedName } = normalizeObjectName(name)
    if (!Number.isSafeInteger(size) || size <= 0 || !body) throw new StorageError('INVALID_INPUT')
    parentFolder(projectId, parentId)
    const objectId = randomUUID()
    const providerReference = randomUUID()
    const operationId = beginOperation(projectId, 'upload', objectId, parentId, 1)
    const reserve = db.transaction(() => {
      parentFolder(projectId, parentId)
      assertNameAvailable(projectId, parentId, cleanName)
      db.prepare(`INSERT INTO storage_name_reservations (reservation_id, project_id, parent_id, normalized_name, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+15 minutes'))`)
        .run(operationId, projectId, parentId, normalizedName)
    })
    try { reserve.immediate() }
    catch (error) {
      finishOperation(operationId, 'failed', error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'NAME_CONFLICT' : 'INVALID_INPUT')
      return normalizeError(error)
    }
    setOperationDetails(operationId, { plannedProviderReferences: [providerReference] })
    try {
      await storage.upload({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: providerReference, body, size, mimeType: contentType, signal })
      const commit = db.transaction(() => {
        db.prepare('INSERT INTO files (id, project_id, object_key, original_name, content_type, size) VALUES (?, ?, ?, ?, ?, ?)')
          .run(objectId, projectId, providerReference, cleanName, contentType || 'application/octet-stream', size)
        db.prepare(`INSERT INTO storage_objects (object_id, project_id, parent_id, type, name, normalized_name, provider_reference, content_type, size_bytes) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`)
          .run(objectId, projectId, parentId, cleanName, normalizedName, providerReference, contentType || 'application/octet-stream', size)
        db.prepare('DELETE FROM storage_name_reservations WHERE reservation_id = ?').run(operationId)
        finishOperation(operationId, 'completed', null, 1)
      })
      commit.immediate()
      return { object: serialize(object(projectId, objectId)), operationId }
    } catch (error) {
      let cleanupFailed = false
      {
        try { await storage.delete({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: providerReference }) }
        catch { cleanupFailed = true }
      }
      db.prepare('DELETE FROM storage_name_reservations WHERE reservation_id = ?').run(operationId)
      const code = error instanceof StorageError ? error.code : error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'NAME_CONFLICT' : 'INTERNAL_ERROR'
      finishOperation(operationId, cleanupFailed ? 'partial' : 'failed', code, cleanupFailed ? 1 : 0, cleanupFailed ? { orphanedProviderReferences: [providerReference] } : null)
      const mapped = error instanceof StorageError ? error : new StorageError(code)
      mapped.operationId = operationId
      throw mapped
    }
  }

  const trash = ({ projectId, appId, objectId }) => {
    if (!activeProject(projectId, appId)) notFound()
    const operationId = randomUUID()
    try {
      const update = db.transaction(() => {
        const root = object(projectId, objectId)
        if (!root) notFound()
        const items = tree(projectId, objectId, true)
        if (items.length > maxSynchronousObjects) throw new StorageError('OPERATION_TOO_LARGE')
        const ids = items.map((item) => item.object_id)
        const deletedAt = new Date().toISOString()
        const placeholders = ids.map(() => '?').join(',')
        db.prepare(`UPDATE storage_objects SET deleted_at = ?, trash_root_id = ?, updated_at = ? WHERE project_id = ? AND object_id IN (${placeholders})`)
          .run(deletedAt, objectId, deletedAt, projectId, ...ids)
        db.prepare(`INSERT INTO storage_operations (operation_id, project_id, type, status, source_object_id, total_items, completed_items) VALUES (?, ?, 'trash', 'completed', ?, ?, ?)`)
          .run(operationId, projectId, objectId, ids.length, ids.length)
        return serialize(object(projectId, objectId, true))
      })
      return update.immediate()
    } catch (error) { return normalizeError(error) }
  }

  const restore = ({ projectId, appId, objectId, parentId }) => {
    if (!activeProject(projectId, appId)) notFound()
    try {
      const update = db.transaction(() => {
        const root = object(projectId, objectId, true)
        if (!root || !root.deleted_at || root.trash_root_id !== objectId) notFound()
        const items = db.prepare(`SELECT ${OBJECT_COLUMNS}, provider_reference, normalized_name, trash_root_id FROM storage_objects WHERE project_id = ? AND trash_root_id = ? AND deleted_at IS NOT NULL LIMIT ?`).all(projectId, objectId, maxSynchronousObjects + 1)
        if (!items.length || items.length > maxSynchronousObjects) throw new StorageError(items.length ? 'OPERATION_TOO_LARGE' : 'NOT_FOUND')
        const destination = parentId === undefined ? root.parent_id : parentId
        if (destination !== null && typeof destination !== 'string') throw new StorageError('INVALID_INPUT')
        parentFolder(projectId, destination)
        assertNameAvailable(projectId, destination, root.name, objectId)
        const now = new Date().toISOString()
        db.prepare('UPDATE storage_objects SET parent_id = ?, deleted_at = NULL, trash_root_id = NULL, updated_at = ? WHERE project_id = ? AND object_id = ?')
          .run(destination, now, projectId, objectId)
        db.prepare('UPDATE storage_objects SET deleted_at = NULL, trash_root_id = NULL, updated_at = ? WHERE project_id = ? AND trash_root_id = ? AND object_id != ?')
          .run(now, projectId, objectId, objectId)
        return serialize(object(projectId, objectId))
      })
      return update.immediate()
    } catch (error) { return normalizeError(error) }
  }

  const permanentDelete = async ({ projectId, appId, objectId, signal }) => {
    const project = activeProject(projectId, appId)
    if (!project) notFound()
    const root = object(projectId, objectId, true)
    if (!root || !root.deleted_at || root.trash_root_id !== objectId) notFound()
    const items = db.prepare(`SELECT ${OBJECT_COLUMNS}, provider_reference, normalized_name, trash_root_id FROM storage_objects WHERE project_id = ? AND trash_root_id = ? AND deleted_at IS NOT NULL ORDER BY type DESC, object_id LIMIT ?`).all(projectId, objectId, maxSynchronousObjects + 1)
    if (!items.length) notFound()
    if (items.length > maxSynchronousObjects) throw new StorageError('OPERATION_TOO_LARGE')
    const operationId = beginOperation(projectId, 'permanent_delete', objectId, null, items.length)
    const completed = []
    const failures = []
    for (const item of items) {
      if (item.type !== 'file') continue
      try {
        await storage.delete({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: item.provider_reference, signal })
        completed.push(item.provider_reference)
      } catch (error) {
        if (error?.code === 'NOT_FOUND') completed.push(item.provider_reference)
        else failures.push(item.provider_reference)
      }
      setOperationDetails(operationId, { deletedProviderReferences: completed, retryProviderReferences: failures.concat(items.filter((entry) => entry.type === 'file' && !completed.includes(entry.provider_reference) && !failures.includes(entry.provider_reference)).map((entry) => entry.provider_reference)) })
    }
    if (failures.length) {
      finishOperation(operationId, completed.length ? 'partial' : 'failed', 'PROVIDER_UNAVAILABLE', completed.length, { deletedProviderReferences: completed, retryProviderReferences: failures })
      const error = new StorageError('PROVIDER_UNAVAILABLE')
      error.operationId = operationId
      throw error
    }
    try {
      const remove = db.transaction(() => {
        for (const item of items) {
          if (item.type === 'file') db.prepare('DELETE FROM files WHERE id = ? AND project_id = ?').run(item.object_id, projectId)
        }
        db.prepare('DELETE FROM storage_objects WHERE project_id = ? AND trash_root_id = ?').run(projectId, objectId)
        finishOperation(operationId, 'completed', null, items.length)
      })
      remove.immediate()
    } catch {
      finishOperation(operationId, 'partial', 'INTERNAL_ERROR', completed.length, { deletedProviderReferences: completed, metadataPending: true })
      const error = new StorageError('INTERNAL_ERROR')
      error.operationId = operationId
      throw error
    }
    return { success: true, operationId, deletedItems: items.length }
  }

  const getOperation = ({ projectId, appId, operationId }) => {
    if (!activeProject(projectId, appId)) notFound()
    const row = db.prepare(`SELECT operation_id, project_id, type, status, source_object_id, target_parent_id, created_at, updated_at, error_code, completed_items, total_items FROM storage_operations WHERE project_id = ? AND operation_id = ?`).get(projectId, operationId)
    if (!row) notFound()
    return { operationId: row.operation_id, projectId: row.project_id, type: row.type, status: row.status, sourceObjectId: row.source_object_id, targetParentId: row.target_parent_id, createdAt: row.created_at, updatedAt: row.updated_at, errorCode: row.error_code, completedItems: row.completed_items, totalItems: row.total_items }
  }

  return { list, stat, createFolder, createFile, rename, move, copy, trash, restore, permanentDelete, getOperation }
}
