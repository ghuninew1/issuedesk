import { createHash } from 'node:crypto'

function hashSecret(secret) {
  return createHash('sha256')
    .update(secret)
    .digest('hex')
}

export async function appAuth(c, next) {
  const authorization = c.req.header('Authorization')
  const prefix = 'Bearer '

  if (!authorization?.startsWith(prefix)) {
    return c.json(
      {
        success: false,
        message: 'Unauthorized',
      },
      401,
    )
  }

  const secret = authorization.slice(prefix.length).trim()

  if (!secret) {
    return c.json(
      {
        success: false,
        message: 'Unauthorized',
      },
      401,
    )
  }

  try {
    const secretHash = hashSecret(secret)

    const credential = c.get('db').prepare(`
      SELECT
        cr.id AS credential_id,
        cr.app_id,
        cr.expires_at,
        a.status AS app_status
      FROM app_credentials cr
      INNER JOIN apps a ON a.id = cr.app_id
      WHERE cr.secret_hash = ?
        AND cr.status = 'active'
      LIMIT 1
    `).get(secretHash)

    if (!credential || credential.app_status !== 'active') {
      return c.json(
        {
          success: false,
          message: 'Unauthorized',
        },
        401,
      )
    }

    if (
      credential.expires_at &&
      Date.parse(`${credential.expires_at.replace(' ', 'T')}Z`) <= Date.now()
    ) {
      return c.json(
        {
          success: false,
          message: 'Credential has expired',
        },
        401,
      )
    }

    c.set('app', {
      id: credential.app_id,
      credentialId: credential.credential_id,
    })

    await next()
  } catch (error) {
    console.error('App authentication failed:', error)

    return c.json(
      {
        success: false,
        message: 'Authentication service unavailable',
      },
      500,
    )
  }
}
