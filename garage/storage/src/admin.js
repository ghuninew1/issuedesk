import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'

function hashSecret(secret) {
  return createHash('sha256').update(secret).digest('hex')
}

function safeCompare(actual, expected) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

function adminAuth(c, next) {
  const token = process.env.STORAGE_ADMIN_TOKEN

  if (!token) {
    return c.json(
      { success: false, message: 'Admin authentication is not configured' },
      503,
    )
  }

  const authorization = c.req.header('Authorization')
  const prefix = 'Bearer '

  if (!authorization?.startsWith(prefix)) {
    return c.json(
      { success: false, message: 'Unauthorized' },
      401,
    )
  }

  const suppliedToken = authorization.slice(prefix.length)

  if (!safeCompare(suppliedToken, token)) {
    return c.json(
      { success: false, message: 'Unauthorized' },
      401,
    )
  }

  return next()
}

export function registerAdminRoutes(app, db) {
  const admin = new Hono()

  admin.use('*', adminAuth)

  // List applications
  admin.get('/apps', (c) => {
    const apps = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.status,
        a.created_at,
        COUNT(DISTINCT cr.id) AS credential_count,
        COUNT(DISTINCT p.id) AS project_count
      FROM apps a
      LEFT JOIN app_credentials cr ON cr.app_id = a.id
      LEFT JOIN projects p ON p.app_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all()

    return c.json({
      success: true,
      apps,
    })
  })

  // Create an application
  admin.post('/apps', async (c) => {
    let body

    try {
      body = await c.req.json()
    } catch {
      return c.json(
        { success: false, message: 'Invalid JSON body' },
        400,
      )
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!name || name.length > 100) {
      return c.json(
        {
          success: false,
          message: 'Name is required and must not exceed 100 characters',
        },
        400,
      )
    }

    const id = randomUUID()

    try {
      db.prepare(`
        INSERT INTO apps (id, name)
        VALUES (?, ?)
      `).run(id, name)

      return c.json(
        {
          success: true,
          app: {
            id,
            name,
            status: 'active',
          },
        },
        201,
      )
    } catch (error) {
      console.error('Create app failed:', error)

      return c.json(
        { success: false, message: 'Unable to create app' },
        500,
      )
    }
  })

  // Issue a credential for an application
  admin.post('/apps/:appId/credentials', (c) => {
    const appId = c.req.param('appId')

    const application = db.prepare(`
      SELECT id, name, status
      FROM apps
      WHERE id = ?
    `).get(appId)

    if (!application) {
      return c.json(
        { success: false, message: 'Application not found' },
        404,
      )
    }

    if (application.status !== 'active') {
      return c.json(
        { success: false, message: 'Application is disabled' },
        409,
      )
    }

    const credentialId = randomUUID()
    const secret = randomBytes(32).toString('base64url')
    const secretHash = hashSecret(secret)

    db.prepare(`
      INSERT INTO app_credentials (id, app_id, secret_hash)
      VALUES (?, ?, ?)
    `).run(credentialId, appId, secretHash)

    return c.json(
      {
        success: true,
        credential: {
          id: credentialId,
          appId,
          appName: application.name,
          secret,
          warning: 'Save this secret now. It cannot be retrieved later.',
        },
      },
      201,
    )
  })

  // Revoke a credential without deleting its audit record
  admin.delete('/credentials/:credentialId', (c) => {
    const credentialId = c.req.param('credentialId')

    const result = db.prepare(`
      UPDATE app_credentials
      SET status = 'revoked'
      WHERE id = ? AND status = 'active'
    `).run(credentialId)

    if (result.changes === 0) {
      return c.json(
        {
          success: false,
          message: 'Active credential not found',
        },
        404,
      )
    }

    return c.json({
      success: true,
      credentialId,
      status: 'revoked',
    })
  })

  // List projects for an application
  admin.get('/apps/:appId/projects', (c) => {
    const appId = c.req.param('appId')

    const application = db.prepare(`
      SELECT id, name, status
      FROM apps
      WHERE id = ?
    `).get(appId)

    if (!application) {
      return c.json(
        { success: false, message: 'Application not found' },
        404,
      )
    }

    const projects = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.bucket,
        p.status,
        p.created_at,
        COUNT(f.id) AS file_count
      FROM projects p
      LEFT JOIN files f ON f.project_id = p.id
      WHERE p.app_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(appId)

    return c.json({
      success: true,
      app: {
        id: application.id,
        name: application.name,
      },
      projects,
    })
  })

  // Create a project for an application
  admin.post('/apps/:appId/projects', async (c) => {
    const appId = c.req.param('appId')
    let body

    try {
      body = await c.req.json()
    } catch {
      return c.json(
        { success: false, message: 'Invalid JSON body' },
        400,
      )
    }

    const name = typeof body?.name === 'string'
      ? body.name.trim()
      : ''

    if (!name || name.length > 100) {
      return c.json(
        {
          success: false,
          message: 'Name is required and must not exceed 100 characters',
        },
        400,
      )
    }

    const application = db.prepare(`
      SELECT id, name, status
      FROM apps
      WHERE id = ?
    `).get(appId)

    if (!application) {
      return c.json(
        { success: false, message: 'Application not found' },
        404,
      )
    }

    if (application.status !== 'active') {
      return c.json(
        { success: false, message: 'Application is disabled' },
        409,
      )
    }

    const id = randomUUID()
    const bucket = process.env.S3_BUCKET

    try {
      db.prepare(`
        INSERT INTO projects (id, app_id, name, bucket)
        VALUES (?, ?, ?, ?)
      `).run(id, appId, name, bucket)

      return c.json(
        {
          success: true,
          project: {
            id,
            appId,
            name,
            bucket,
            status: 'active',
          },
        },
        201,
      )
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return c.json(
          {
            success: false,
            message: 'A project with this name already exists for this app',
          },
          409,
        )
      }

      console.error('Create project failed:', error)

      return c.json(
        { success: false, message: 'Unable to create project' },
        500,
      )
    }
  })
  app.route('/admin', admin)
}
