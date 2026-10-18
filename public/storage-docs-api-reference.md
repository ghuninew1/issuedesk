# API Reference

Base URL on the QNAP LAN/VPN:

`http://192.168.11.32:3000`

Use HTTPS when communicating across untrusted networks.

## Authentication

| API | Authentication |
|---|---|
| `/health` | None |
| `/admin/*` | `STORAGE_ADMIN_TOKEN` |
| `/v2/*` | Per-app credential |
| `/api/*` | `STORAGE_API_TOKEN`; disabled by default |

Authenticated requests use:

`Authorization: Bearer <token>`

Never place credentials in query parameters or frontend bundles.

## Health

### `GET /health`

Returns a basic service health response.

\`\`\`json
{
  "success": true,
  "service": "storage-api"
}
\`\`\`

This endpoint does not test Garage writes or downloads.

## Admin API

All endpoints require the admin Bearer token.

### `GET /admin/apps`

Lists applications with status, creation time, credential count,
and project count.

### `POST /admin/apps`

Creates an application.

Request:

\`\`\`json
{
  "name": "IssueDesk"
}
\`\`\`

The name is required and must not exceed 100 characters.

### `POST /admin/apps/:appId/credentials`

Creates an app credential for an active application.

The plaintext secret is returned only once. Save it securely.

### `DELETE /admin/credentials/:credentialId`

Revokes an active credential. The database record is retained.

### `GET /admin/apps/:appId/projects`

Lists projects belonging to the specified application.

### `POST /admin/apps/:appId/projects`

Creates a project for an active application.

Request:

\`\`\`json
{
  "name": "attachments"
}
\`\`\`

The bucket is taken from `S3_BUCKET`.

Project names must be unique within an application.

## V2 File API

All V2 endpoints require an app credential. The requested project
must be active and belong to the authenticated application.

### `GET /v2/projects/:projectId/files`

Lists up to 100 files, newest first.

The response includes `isTruncated`. The current endpoint does not
provide a continuation cursor.

### `POST /v2/projects/:projectId/files`

Uploads one file using multipart form data.

Required field:

`file`

Rejects empty files and files exceeding `MAX_FILE_SIZE_MB`.

Returns HTTP `201` when the object and metadata have been created.

### `GET /v2/projects/:projectId/files/:fileId`

Downloads a file as an attachment.

The response uses private/no-store caching and `X-Content-Type-Options: nosniff`.

### `DELETE /v2/projects/:projectId/files/:fileId`

Deletes the Garage object and corresponding metadata.

## Legacy API

Legacy routes are disabled unless `ENABLE_LEGACY_API=true`.

When enabled, they require the legacy Bearer token.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/files` | Lists objects from the default bucket |
| POST | `/api/files` | Uploads a file |
| GET | `/api/files/:key` | Downloads an object by UUID-shaped key |
| DELETE | `/api/files/:key` | Deletes an object by UUID-shaped key |

Legacy routes operate on the default bucket and do not use V2 project
metadata or per-app project isolation.

Keep them disabled for new integrations.

## Common HTTP Status Codes

| Status | Meaning |
|---|---|
| `400` | Invalid input or missing file field |
| `401` | Missing, invalid, expired, or revoked credential |
| `404` | Resource not found; also used when legacy routes are disabled |
| `409` | Conflict, such as a duplicate project name |
| `413` | Request or file size limit exceeded |
| `500` | Internal or metadata operation error |
| `502` | Storage operation failed |
| `503` | Admin authentication is not configured |