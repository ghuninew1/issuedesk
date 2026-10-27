import { registerAdminRoutes } from './admin.js'
import { appAuth } from './app-auth.js'
import { randomUUID } from 'node:crypto'
import { bodyLimit } from 'hono/body-limit'
import { Hono } from 'hono'
import { safeContentType, attachmentName } from './storage/validation.js'
import { legacyNameKey } from './storage/names.js'
import { registerFileManagerRoutes } from './storage/file-manager-routes.js'

export function createApp({ db, storage, bucket, apiToken, enableLegacyApi = false, maxFileSize, logger = console }) {
  const app = new Hono()

  const maxRequestSize = maxFileSize + 1024 * 1024

  app.use('/api/*', async (c, next) => {
    if (!enableLegacyApi) {
      return c.json({
        success: false,
        message: 'Legacy API is disabled',
      }, 404)
    }

    await next()
  })

  app.use(
    '/api/files',
    bodyLimit({
      maxSize: maxRequestSize,
      onError: (c) => {
        return c.json(
          {
            success: false,
            message: 'Request body exceeds the size limit',
            maxRequestSize,
          },
          413,
        )
      },
    }),
  )

  app.use(
    '/v3/projects/:projectId/files',
    bodyLimit({ maxSize: maxRequestSize, onError: (c) => c.json({ success: false, error: { code: 'UPLOAD_TOO_LARGE', message: 'Request body exceeds the size limit.', retryable: false } }, 413) }),
  )

  app.use(
    '/v2/projects/:projectId/files',
    bodyLimit({
      maxSize: maxRequestSize,
      onError: (c) => {
        return c.json(
          {
            success: false,
            message: 'Request body exceeds the size limit',
            maxRequestSize,
          },
          413,
        )
      },
    }),
  )

  app.use('/api/*', async (c, next) => {
    c.set('db', db)
    await next()
  })

  app.use('/v3/*', async (c, next) => { c.set('db', db); await next() })

  app.use('/v2/*', async (c, next) => {
    c.set('db', db)
    await next()
  })

  registerAdminRoutes(app, db)

  app.get('/health', (c) => {
    return c.json({
      success: true,
      service: 'storage-api',
    })
  })

  app.use('/api/*', async (c, next) => {
    const authorization = c.req.header('Authorization')
    const expected = `Bearer ${apiToken}`

    if (authorization !== expected) {
      return c.json(
        {
          success: false,
          message: 'Unauthorized',
        },
        401,
      )
    }

    await next()
  })

  app.get('/api/files', async (c) => {
    try {
      const result = await storage.list({ mount: { provider: 'garage', bucket }, signal: c.req.raw.signal })

      return c.json({
        success: true,
        files: result.items.map((file) => ({
          key: file.providerRef,
          size: file.size,
          lastModified: file.modifiedAt,
        })),
        isTruncated: result.isTruncated || false,
        nextContinuationToken: result.nextCursor || null,
      })
    } catch (error) {
      console.error('List files failed:', error)

      return c.json(
        {
          success: false,
          message: 'Unable to list files',
        },
        502,
      )
    }
  })

  app.post('/api/files', async (c) => {
    try {
      const form = await c.req.formData()
      const file = form.get('file')

      if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
        return c.json(
          {
            success: false,
            message: 'A file field is required',
          },
          400,
        )
      }

      if (file.size === 0) {
        return c.json(
          {
            success: false,
            message: 'Empty files are not allowed',
          },
          400,
        )
      }

      if (file.size > maxFileSize) {
        return c.json(
          {
            success: false,
            message: 'File exceeds the upload size limit',
            maxFileSize,
          },
          413,
        )
      }

      const key = randomUUID()
      const body = Buffer.from(await file.arrayBuffer())

      await storage.upload({ mount: { provider: 'garage', bucket }, providerRef: key, body, size: body.length, mimeType: file.type || 'application/octet-stream', signal: c.req.raw.signal })

      return c.json(
        {
          success: true,
          file: {
            key,
            name: file.name,
            size: body.length,
            contentType: file.type || 'application/octet-stream',
          },
        },
        201,
      )
    } catch (error) {
      console.error('Upload failed:', error)

      return c.json(
        {
          success: false,
          message: 'Unable to upload file',
        },
        502,
      )
    }
  })

  app.get('/api/files/:key', async (c) => {
    const key = c.req.param('key')

    // This initial API only accepts UUID-based object keys.
    if (!/^[0-9a-f-]{36}$/i.test(key)) {
      return c.json(
        {
          success: false,
          message: 'Invalid file key',
        },
        400,
      )
    }

    try {
      const result = await storage.download({ mount: { provider: 'garage', bucket }, providerRef: key, signal: c.req.raw.signal })

      if (!result.body) {
        return c.json(
          {
            success: false,
            message: 'File has no content',
          },
          404,
        )
      }

      const body = result.body

      c.header(
        'Content-Type',
        safeContentType(result.mimeType),
      )
      if (Number.isSafeInteger(result.size)) c.header('Content-Length', String(result.size))
      c.header('Cache-Control', 'private, no-store')
      c.header('X-Content-Type-Options', 'nosniff')

      return c.body(body)
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        return c.json(
          {
            success: false,
            message: 'File not found',
          },
          404,
        )
      }

      console.error('Download failed:', error)

      return c.json(
        {
          success: false,
          message: 'Unable to download file',
        },
        502,
      )
    }
  })

  app.delete('/api/files/:key', async (c) => {
    const key = c.req.param('key')

    if (!/^[0-9a-f-]{36}$/i.test(key)) {
      return c.json(
        {
          success: false,
          message: 'Invalid file key',
        },
        400,
      )
    }

    try {
      await storage.delete({ mount: { provider: 'garage', bucket }, providerRef: key, signal: c.req.raw.signal })

      return c.json({
        success: true,
        key,
      })
    } catch (error) {
      console.error('Delete failed:', error)

      return c.json(
        {
          success: false,
          message: 'Unable to delete file',
        },
        502,
      )
    }
  })

  app.get('/v2/projects/:projectId/files', appAuth, (c) => {
    const db = c.get('db')
    const authenticatedApp = c.get('app')
    const projectId = c.req.param('projectId')

    try {
      const project = db.prepare(`
        SELECT id, name
        FROM projects
        WHERE id = ?
          AND app_id = ?
          AND status = 'active'
      `).get(projectId, authenticatedApp.id)

      if (!project) {
        return c.json(
          {
            success: false,
            message: 'Project not found',
          },
          404,
        )
      }

      const results = db.prepare(`
        SELECT
          f.id,
          f.original_name,
          f.content_type,
          f.size,
          f.created_at
        FROM files f
        INNER JOIN storage_objects o ON o.object_id = f.id AND o.project_id = f.project_id
        WHERE f.project_id = ?
          AND o.deleted_at IS NULL
        ORDER BY f.created_at DESC, f.id DESC
      `).all(projectId)

      return c.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
        },
        files: results,
      })
    } catch (error) {
      console.error('List project files failed:', error)

      return c.json(
        {
          success: false,
          message: 'Unable to list project files',
        },
        500,
      )
    }
  })

  app.post('/v2/projects/:projectId/files', appAuth, async (c) => {
    const db = c.get('db')
    const authenticatedApp = c.get('app')
    const projectId = c.req.param('projectId')

    try {
      const project = db.prepare(`
        SELECT id, name, bucket
        FROM projects
        WHERE id = ?
          AND app_id = ?
          AND status = 'active'
      `).get(projectId, authenticatedApp.id)

      if (!project) {
        return c.json(
          {
            success: false,
            message: 'Project not found',
          },
          404,
        )
      }

      let form

      try {
        form = await c.req.formData()
      } catch {
        return c.json(
          {
            success: false,
            message: 'Invalid multipart form data',
          },
          400,
        )
      }

      const file = form.get('file')

      if (
        !file ||
        typeof file === 'string' ||
        typeof file.arrayBuffer !== 'function'
      ) {
        return c.json(
          {
            success: false,
            message: 'A file field is required',
          },
          400,
        )
      }

      if (file.size === 0) {
        return c.json(
          {
            success: false,
            message: 'Empty files are not allowed',
          },
          400,
        )
      }

      if (file.size > maxFileSize) {
        return c.json(
          {
            success: false,
            message: 'File exceeds the upload size limit',
            maxFileSize,
          },
          413,
        )
      }

      const id = randomUUID()
      const objectKey = randomUUID()
      const originalName = file.name || 'unnamed-file'
      const contentType = file.type || 'application/octet-stream'
      const body = Buffer.from(await file.arrayBuffer())

      await storage.upload({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: objectKey, body, size: body.length, mimeType: contentType, signal: c.req.raw.signal })

      try {
        db.transaction(() => {
          db.prepare(`
            INSERT INTO files (id, project_id, object_key, original_name, content_type, size)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, projectId, objectKey, originalName, contentType, body.length)
          db.prepare(`
          INSERT INTO storage_objects (object_id, project_id, parent_id, type, name, normalized_name, provider_reference, content_type, size_bytes)
          VALUES (?, ?, NULL, 'file', ?, ?, ?, ?, ?)
        `).run(id, projectId, originalName, legacyNameKey(originalName, id), objectKey, contentType, body.length)
        }).immediate()
      } catch (error) {
        try {
          await storage.delete({ mount: { provider: 'garage', bucket: project.bucket }, providerRef: objectKey })
        } catch (cleanupError) {
          console.error(
            'Failed to clean up uploaded object:',
            cleanupError,
          )
        }

        throw error
      }

      return c.json(
        {
          success: true,
          file: {
            id,
            projectId,
            name: originalName,
            contentType,
            size: body.length,
            createdAt: new Date().toISOString(),
          },
        },
        201,
      )
    } catch (error) {
      console.error('Upload project file failed:', error)

      return c.json(
        {
          success: false,
          message: 'Unable to upload file',
        },
        502,
      )
    }
  })

  app.get(
    '/v2/projects/:projectId/files/:fileId',
    appAuth,
    async (c) => {
      const db = c.get('db')
      const authenticatedApp = c.get('app')
      const projectId = c.req.param('projectId')
      const fileId = c.req.param('fileId')

      try {
        const file = db.prepare(`
          SELECT
            f.id,
            f.object_key,
            f.original_name,
            f.content_type,
            f.size,
            p.bucket
          FROM files f
          INNER JOIN storage_objects o ON o.object_id = f.id AND o.project_id = f.project_id AND o.deleted_at IS NULL
          INNER JOIN projects p ON p.id = f.project_id
          WHERE f.id = ?
            AND f.project_id = ?
            AND p.app_id = ?
            AND p.status = 'active'
        `).get(
          fileId,
          projectId,
          authenticatedApp.id,
        )

        if (!file) {
          return c.json(
            {
              success: false,
              message: 'File not found',
            },
            404,
          )
        }

        const result = await storage.download({ mount: { provider: 'garage', bucket: file.bucket }, providerRef: file.object_key, signal: c.req.raw.signal })

        if (!result.body) {
          return c.json(
            {
              success: false,
              message: 'File has no content',
            },
            404,
          )
        }

        const body = result.body

        c.header(
          'Content-Type',
          safeContentType(file.content_type),
        )
        if (Number.isSafeInteger(result.size)) c.header('Content-Length', String(result.size))
        c.header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${attachmentName(file.original_name)}`,
        )
        c.header('Cache-Control', 'private, no-store')
        c.header('X-Content-Type-Options', 'nosniff')

        return c.body(body)
      } catch (error) {
        if (
          error.code === 'NOT_FOUND'
        ) {
          return c.json(
            {
              success: false,
              message: 'File object not found in storage',
            },
            404,
          )
        }

        console.error('Download project file failed:', error)

        return c.json(
          {
            success: false,
            message: 'Unable to download file',
          },
          502,
        )
      }
    },
  )

  app.delete(
    '/v2/projects/:projectId/files/:fileId',
    appAuth,
    async (c) => {
      const db = c.get('db')
      const authenticatedApp = c.get('app')
      const projectId = c.req.param('projectId')
      const fileId = c.req.param('fileId')

      try {
        const file = db.prepare(`
          SELECT
            f.id,
            f.object_key,
            p.bucket
          FROM files f
          INNER JOIN storage_objects o ON o.object_id = f.id AND o.project_id = f.project_id AND o.deleted_at IS NULL
          INNER JOIN projects p ON p.id = f.project_id
          WHERE f.id = ?
            AND f.project_id = ?
            AND p.app_id = ?
            AND p.status = 'active'
        `).get(
          fileId,
          projectId,
          authenticatedApp.id,
        )

        if (!file) {
          return c.json(
            {
              success: false,
              message: 'File not found',
            },
            404,
          )
        }

        await storage.delete({ mount: { provider: 'garage', bucket: file.bucket }, providerRef: file.object_key, signal: c.req.raw.signal })

        const result = db.transaction(() => {
          db.prepare('DELETE FROM files WHERE id = ? AND project_id = ?').run(fileId, projectId)
          db.prepare('DELETE FROM storage_objects WHERE object_id = ? AND project_id = ?').run(fileId, projectId)
          return { changes: 1 }
        }).immediate()

        if (result.changes !== 1) {
          console.error(
            'File object deleted but metadata was not removed:',
            fileId,
          )

          return c.json(
            {
              success: false,
              message: 'File was removed from storage but metadata cleanup failed',
            },
            500,
          )
        }

        return c.json({
          success: true,
          fileId,
          projectId,
          message: 'File deleted successfully',
        })
      } catch (error) {
        console.error('Delete project file failed:', error)

        return c.json(
          {
            success: false,
            message: 'Unable to delete file',
          },
          502,
        )
      }
    },
  )

  registerFileManagerRoutes(app, { db, storage, maxFileSize, logger })

  app.onError((error, c) => {
    console.error('Unhandled API error:', error)

    return c.json(
      {
        success: false,
        message: 'Internal server error',
      },
      500,
    )
  })


  return app
}
