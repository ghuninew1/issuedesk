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

```json
{
  "success": true,
  "service": "storage-api"
}
```

This endpoint does not test Garage writes or downloads.

## Admin API

All endpoints require the admin Bearer token.

### `GET /admin/apps`

Lists applications with status, creation time, credential count,
and project count.

### `POST /admin/apps`

Creates an application.

Request:

```json
{
  "name": "IssueDesk"
}
```

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

```json
{
  "name": "attachments"
}
```

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

## IssueDesk Image Management API

These endpoints are Cloudflare Pages Functions in the IssueDesk application. They proxy the Storage API for the Admin image management page at `/storage/images`; they are distinct from the Storage service's `/v2/*` routes documented above.

All routes require an active IssueDesk session with the `admin` role. The browser must call these same-origin endpoints with its session cookie. Storage app credentials and Cloudflare Access service credentials are read only by Pages Functions and must not be sent by the browser.

### `GET /api/storage/files`

Lists images from the configured Storage project. The response is limited to the first 100 Storage API results and includes `isTruncated`; the API does not currently provide pagination. Only JPEG, PNG, WebP, GIF, and AVIF files are returned.

```json
{
  "success": true,
  "files": [
    {
      "id": "<file-id>",
      "file_name": "screen.png",
      "mime_type": "image/png",
      "file_size": 24576,
      "uploaded_at": "2026-10-21T09:30:00.000Z"
    }
  ],
  "isTruncated": false
}
```

### `POST /api/storage/files`

Uploads a single image as `multipart/form-data` with required field `file`. Accepted content types are `image/jpeg`, `image/png`, `image/webp`, `image/gif`, and `image/avif`. Empty files are rejected; maximum size is 10 MiB. Returns HTTP `201` and the normalized file metadata on success.

```json
{
  "success": true,
  "file": {
    "id": "<file-id>",
    "file_name": "screen.png",
    "mime_type": "image/png",
    "file_size": 24576,
    "uploaded_at": "2026-10-21T09:30:00.000Z"
  }
}
```

### `GET /api/storage/files/:fileId`

Streams the image through the authenticated IssueDesk proxy for inline preview. Only the allowed raster image MIME types can be previewed. Responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

To download instead, request:

`GET /api/storage/files/:fileId?download=1&name=screen.png`

The response uses `Content-Disposition: attachment`; filename path separators, NUL, and line breaks are sanitized. The resulting URL is not public: opening it requires a valid Admin session.

### `DELETE /api/storage/files/:fileId`

Deletes the file from Storage and removes matching `issue_attachments` rows by `storage_file_id` from IssueDesk D1. If Storage already returns `404`, the route treats the object as absent and still attempts D1 cleanup.

```json
{
  "success": true,
  "message": "Image deleted successfully"
}
```

If the Storage deletion succeeds but D1 cleanup fails, the route returns HTTP `500` and reports that the image was removed but linked IssueDesk records could not be cleaned.

IssueDesk proxy routes commonly return `400` for invalid input, `401` for a missing/expired session, `403` for a non-Admin user, `404` for an absent image, `413` for files over 10 MiB, `415` for unsupported image types, and `502` for Storage API failures.

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
