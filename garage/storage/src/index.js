import { db } from './db.js'
import { registerAdminRoutes } from './admin.js'
import { appAuth } from './app-auth.js'
import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { bodyLimit } from 'hono/body-limit'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Hono } from 'hono'

const requiredEnv = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'STORAGE_API_TOKEN',
]

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
}

const port = Number(process.env.PORT || 3000)
const maxFileSize = Number(process.env.MAX_FILE_SIZE_MB || 25) * 1024 * 1024
const bucket = process.env.S3_BUCKET

const apiToken = process.env.STORAGE_API_TOKEN
const enableLegacyApi = process.env.ENABLE_LEGACY_API === 'true'

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port')
}

if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0) {
  throw new Error('MAX_FILE_SIZE_MB must be a positive number')
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

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
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 100,
      }),
    )

    return c.json({
      success: true,
      files: (result.Contents || []).map((file) => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
      })),
      isTruncated: result.IsTruncated || false,
      nextContinuationToken: result.NextContinuationToken || null,
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

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: file.type || 'application/octet-stream',
      }),
    )

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
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    )

    if (!result.Body) {
      return c.json(
        {
          success: false,
          message: 'File has no content',
        },
        404,
      )
    }

    const body = await result.Body.transformToByteArray()

    c.header(
      'Content-Type',
      result.ContentType || 'application/octet-stream',
    )
    c.header('Content-Length', String(body.byteLength))
    c.header('Cache-Control', 'private, no-store')
    c.header('X-Content-Type-Options', 'nosniff')

    return c.body(body)
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
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
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    )

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
        id,
        original_name,
        content_type,
        size,
        created_at
      FROM files
      WHERE project_id = ?
      ORDER BY created_at DESC, id DESC
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

    await s3.send(
      new PutObjectCommand({
        Bucket: project.bucket,
        Key: objectKey,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
      }),
    )

    try {
      db.prepare(`
        INSERT INTO files (
          id,
          project_id,
          object_key,
          original_name,
          content_type,
          size
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        projectId,
        objectKey,
        originalName,
        contentType,
        body.length,
      )
    } catch (error) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: project.bucket,
            Key: objectKey,
          }),
        )
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

      const result = await s3.send(
        new GetObjectCommand({
          Bucket: file.bucket,
          Key: file.object_key,
        }),
      )

      if (!result.Body) {
        return c.json(
          {
            success: false,
            message: 'File has no content',
          },
          404,
        )
      }

      const body = await result.Body.transformToByteArray()

      c.header(
        'Content-Type',
        file.content_type || 'application/octet-stream',
      )
      c.header(
        'Content-Length',
        String(body.byteLength),
      )
      c.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      )
      c.header('Cache-Control', 'private, no-store')
      c.header('X-Content-Type-Options', 'nosniff')

      return c.body(body)
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
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

      await s3.send(
        new DeleteObjectCommand({
          Bucket: file.bucket,
          Key: file.object_key,
        }),
      )

      const result = db.prepare(`
        DELETE FROM files
        WHERE id = ?
          AND project_id = ?
      `).run(fileId, projectId)

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

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
})

console.log(`Storage API listening on port ${port}`)
