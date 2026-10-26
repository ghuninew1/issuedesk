# Storage API

Private S3-compatible Storage API powered by Hono, Node.js, SQLite,
and Garage.

## Responsibilities

Storage API provides:

- Application and project management through an admin API.
- Per-application Bearer credentials.
- Project-scoped file access.
- Upload, list, download, and delete operations.
- SQLite metadata management.
- Garage S3 object storage integration.

## Runtime

- Node.js with ES modules.
- Hono HTTP framework.
- `@aws-sdk/client-s3` for Garage S3 operations.
- `better-sqlite3` for metadata.
- `@hono/node-server` for the HTTP server.

## Configuration

Runtime environment variables are supplied through `storage/.env`.

Use `.env.example` as a reference. Never commit the real `.env` file.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP listening port; default `3000` |
| `STORAGE_API_TOKEN` | Legacy API token; required at startup |
| `STORAGE_ADMIN_TOKEN` | Admin API authentication |
| `S3_ENDPOINT` | S3 endpoint; normally `http://garage:3900` |
| `S3_REGION` | S3 signing region |
| `S3_BUCKET` | Default bucket for legacy routes and new projects |
| `AWS_ACCESS_KEY_ID` | Garage S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Garage S3 secret key |
| `MAX_FILE_SIZE_MB` | Maximum file size in MiB; default `25` |
| `ENABLE_LEGACY_API` | Enables legacy `/api/*` routes only when `true` |
| `DATABASE_PATH` | SQLite path; Compose sets `/app/data/storage.db` |

The API validates its required S3 and legacy token variables during startup.
The admin API returns `503` if `STORAGE_ADMIN_TOKEN` is not configured.

## Start and Inspect

Run from `/share/VHD/garage` on the QNAP:

```sh
docker compose ps
docker compose logs --tail=100 storage-api
```

Health check:

```sh
curl -i http://192.168.11.32:3000/health
```

## API Overview

- `GET /health`
- `/admin/*` — application, credential, and project administration
- `/v2/projects/:projectId/files` — project-scoped file operations
- `/api/*` — legacy routes, disabled by default

See `docs/api-reference.md` for endpoint details.

## Security

V2 credentials are associated with an application. Requests can access
only projects belonging to that application.

Do not expose any of the following in browser code:

- `STORAGE_ADMIN_TOKEN`
- `STORAGE_API_TOKEN`
- App credential secrets
- Garage S3 credentials

See `docs/security.md`.

## Persistence and Backups

SQLite metadata is stored at:

`/app/data/storage.db`

The Compose volume maps this to:

`/share/VHD/garage/storage/data/`

Garage data is persisted separately in the root `data/` directory.

Back up both object data and metadata. SQLite uses WAL mode, so use a
WAL-aware backup procedure. Do not delete `storage.db-wal` or
`storage.db-shm` while the API is running.

See `docs/operations.md`.

## Documentation

- `docs/architecture.md`
- `docs/api-reference.md`
- `docs/security.md`
- `docs/operations.md`
## Upload returns 502 with SQLITE_READONLY

If `storage-api` logs `Upload project file failed: SqliteError: attempt to write a readonly database`, the upload handler cannot insert file metadata into its own SQLite database. This database is separate from Cloudflare D1. Both Storage Images and QR logo saves can fail because they share this upload service.

The image runs as `node`; Compose bind-mounts `./storage/data` over `/app/data`. Image-build ownership does not set ownership on the host bind mount. Verify the actual runtime UID/GID, mount write mode, host permissions/ACLs, and access to the database directory, DB, and existing WAL/SHM files. Do not reset the database or broaden permissions on Garage object data.

See [QR Studio Storage documentation](QR_STUDIO_STORAGE_DOCS.md) for integration details, permission checks, and recovery steps. The user confirmed that correcting the Storage data ownership restored uploads in both Storage Images and QR Studio; this documentation update did not repeat host operations.

### Confirmed bind-mount permission mismatch (2026-10-26)

The storage-api ran as UID/GID `1000:1000`, while `/app/data` and `/app/data/storage.db` were owned by `0:0`; the directory was mode `755` and database `644`. This prevents the runtime user from writing SQLite metadata and its WAL files. Docker Compose mounts host `./storage/data` over `/app/data`, so build-time ownership does not override host ownership. After verifying the actual Docker mount source and `rw=true`, stop `storage-api`, change only the confirmed Storage data directory, database, and any existing WAL/SHM files to the runtime UID/GID, and restart it. Do not delete or recreate the database. See the Storage documentation linked above for the exact commands and verification steps.
