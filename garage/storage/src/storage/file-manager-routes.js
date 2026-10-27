import { appAuth } from '../app-auth.js'
import { StorageError } from './errors.js'
import { createFileManager } from './file-manager.js'
import { attachmentName, safeContentType } from './validation.js'

const errorStatuses = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  NAME_CONFLICT: 409,
  OPERATION_TOO_LARGE: 413,
  CAPABILITY_UNAVAILABLE: 422,
  PROVIDER_UNAVAILABLE: 502,
  TRANSFER_INCOMPLETE: 502,
  INTERNAL_ERROR: 500,
}
const errorMessages = {
  INVALID_INPUT: 'The request is invalid.',
  NOT_FOUND: 'The object was not found.',
  NAME_CONFLICT: 'An item with that name already exists.',
  OPERATION_TOO_LARGE: 'This operation exceeds the synchronous item limit.',
  CAPABILITY_UNAVAILABLE: 'The storage provider cannot perform this operation.',
  PROVIDER_UNAVAILABLE: 'The storage provider is unavailable.',
  TRANSFER_INCOMPLETE: 'The storage transfer did not complete.',
  INTERNAL_ERROR: 'The operation could not be completed.',
}

function sendError(c, error) {
  const mapped = error instanceof StorageError ? error : new StorageError('INTERNAL_ERROR')
  const code = mapped.code
  return c.json({ success: false, error: {
    code,
    message: errorMessages[code] || errorMessages.INTERNAL_ERROR,
    retryable: ['PROVIDER_UNAVAILABLE', 'TRANSFER_INCOMPLETE', 'INTERNAL_ERROR'].includes(code),
    ...(mapped.operationId ? { operationId: mapped.operationId } : {}),
  } }, errorStatuses[code] || 500)
}

async function bodyJson(c) {
  try {
    const body = await c.req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch {
    throw new StorageError('INVALID_INPUT')
  }
}

export function registerFileManagerRoutes(app, { db, storage, maxFileSize, logger = console }) {
  const manager = createFileManager({ db, storage, logger })
  app.use('/v3/*', async (c, next) => { c.set('db', db); c.header('Cache-Control', 'no-store'); await next() })

  const run = async (c, action, status = 200) => {
    try { return c.json({ success: true, ...await action() }, status) }
    catch (error) { return sendError(c, error) }
  }
  const scope = (c) => ({ projectId: c.req.param('projectId'), appId: c.get('app').id })

  app.get('/v3/projects/:projectId/capabilities', appAuth, (c) => run(c, () => {
    const { projectId, appId } = scope(c)
    const project = db.prepare("SELECT bucket FROM projects WHERE id = ? AND app_id = ? AND status = 'active'").get(projectId, appId)
    if (!project) throw new StorageError('NOT_FOUND')
    const capabilities = storage.getCapabilities({ mount: { provider: 'garage', bucket: project.bucket } })
    return { capabilities: { ...capabilities, createFolder: true, rename: true, move: true, trash: true, restore: true } }
  }))

  app.get('/v3/projects/:projectId/objects', appAuth, (c) => run(c, () => manager.list({
    ...scope(c),
    parentId: c.req.query('parentId') || null,
    cursor: c.req.query('cursor') || null,
    limit: c.req.query('limit') === undefined ? 50 : Number(c.req.query('limit')),
  })))

  app.get('/v3/projects/:projectId/objects/:objectId', appAuth, (c) => run(c, () => ({ object: manager.stat({ ...scope(c), objectId: c.req.param('objectId') }) })))

  app.get('/v3/projects/:projectId/objects/:objectId/download', appAuth, async (c) => {
    try {
      const args = { ...scope(c), objectId: c.req.param('objectId') }
      const metadata = manager.stat(args)
      if (metadata.type !== 'file') throw new StorageError('INVALID_INPUT')
      const row = db.prepare('SELECT provider_reference FROM storage_objects WHERE project_id = ? AND object_id = ? AND deleted_at IS NULL').get(args.projectId, args.objectId)
      const project = db.prepare("SELECT bucket FROM projects WHERE id = ? AND app_id = ? AND status = 'active'").get(args.projectId, args.appId)
      if (!row || !project) throw new StorageError('NOT_FOUND')
      const result = await storage.download({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: row.provider_reference, signal: c.req.raw.signal })
      if (!result.body) throw new StorageError('NOT_FOUND')
      c.header('Content-Type', safeContentType(metadata.mimeType))
      c.header('Content-Length', String(Number.isSafeInteger(result.size) ? result.size : metadata.sizeBytes))
      c.header('Content-Disposition', `attachment; filename*=UTF-8''${attachmentName(metadata.name)}`)
      c.header('Cache-Control', 'private, no-store')
      c.header('X-Content-Type-Options', 'nosniff')
      return c.body(result.body)
    } catch (error) { return sendError(c, error) }
  })

  app.post('/v3/projects/:projectId/objects/folders', appAuth, async (c) => run(c, async () => {
    const body = await bodyJson(c)
    return { object: manager.createFolder({ ...scope(c), parentId: body.parentId ?? null, name: body.name }) }
  }, 201))

  app.post('/v3/projects/:projectId/files', appAuth, async (c) => {
    try {
      const form = await c.req.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') throw new StorageError('INVALID_INPUT')
      if (file.size === 0) throw new StorageError('INVALID_INPUT')
      if (file.size > maxFileSize) return c.json({ success: false, error: { code: 'UPLOAD_TOO_LARGE', message: 'The file exceeds the upload limit.', retryable: false } }, 413)
      const parentId = form.get('parentId') || null
      const body = Buffer.from(await file.arrayBuffer())
      return c.json({ success: true, ...await manager.createFile({ ...scope(c), parentId, name: file.name, contentType: file.type || 'application/octet-stream', body, size: body.length, signal: c.req.raw.signal }) }, 201)
    } catch (error) { return sendError(c, error) }
  })

  app.patch('/v3/projects/:projectId/objects/:objectId', appAuth, async (c) => run(c, async () => {
    const body = await bodyJson(c)
    return { object: manager.rename({ ...scope(c), objectId: c.req.param('objectId'), name: body.name }) }
  }))

  app.post('/v3/projects/:projectId/objects/:objectId/move', appAuth, async (c) => run(c, async () => {
    const body = await bodyJson(c)
    if (!Object.hasOwn(body, 'parentId')) throw new StorageError('INVALID_INPUT')
    return { object: manager.move({ ...scope(c), objectId: c.req.param('objectId'), parentId: body.parentId }) }
  }))

  app.post('/v3/projects/:projectId/objects/:objectId/copy', appAuth, async (c) => run(c, async () => {
    const body = await bodyJson(c)
    return await manager.copy({ ...scope(c), objectId: c.req.param('objectId'), parentId: body.parentId ?? null, signal: c.req.raw.signal })
  }, 201))

  app.delete('/v3/projects/:projectId/objects/:objectId', appAuth, (c) => run(c, () => ({ object: manager.trash({ ...scope(c), objectId: c.req.param('objectId') }) })))

  app.get('/v3/projects/:projectId/trash', appAuth, (c) => run(c, () => manager.list({
    ...scope(c), trash: true,
    cursor: c.req.query('cursor') || null,
    limit: c.req.query('limit') === undefined ? 50 : Number(c.req.query('limit')),
  })))

  app.post('/v3/projects/:projectId/trash/:objectId/restore', appAuth, async (c) => run(c, async () => {
    const body = await bodyJson(c)
    return { object: manager.restore({ ...scope(c), objectId: c.req.param('objectId'), ...(Object.hasOwn(body, 'parentId') ? { parentId: body.parentId } : {}) }) }
  }))

  app.delete('/v3/projects/:projectId/trash/:objectId/permanent', appAuth, (c) => run(c, () => manager.permanentDelete({ ...scope(c), objectId: c.req.param('objectId'), signal: c.req.raw.signal })))

  app.get('/v3/projects/:projectId/operations/:operationId', appAuth, (c) => run(c, () => ({ operation: manager.getOperation({ ...scope(c), operationId: c.req.param('operationId') }) })))
}
