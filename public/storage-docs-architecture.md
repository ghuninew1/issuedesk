# Architecture

## Components

```text
Client / Application
        |
        | HTTP + Bearer credential
        v
Storage API (Hono / Node.js)
        |
        +--------------------+
        |                    |
        v                    v
SQLite metadata         Garage S3 API
                             |
                             v
                        File objects
```

Storage API runs in Docker alongside Garage on the `storage-network`
bridge network.

The internal Garage endpoint is `http://garage:3900`.

## Persistent Data

| Host path | Container path | Purpose |
|---|---|---|
| `./data` | `/var/lib/garage` | Garage persistent data |
| `./storage/data` | `/app/data` | SQLite metadata |
| `./garage.toml` | `/etc/garage.toml` | Garage configuration |
| `./storage/.env` | Environment variables | Storage API configuration |

The database path is configured by Compose as `/app/data/storage.db`.

## SQLite Tables

### `apps`

Stores application IDs, names, status, and creation time.

### `app_credentials`

Stores credential IDs, owning application IDs, SHA-256 secret hashes,
status, optional expiry, and creation time.

Plaintext app credential secrets are not stored in this table.

### `projects`

Stores project IDs, owning application IDs, names, bucket names,
status, and creation time.

Project names must be unique within each application.

### `files`

Stores file IDs, project IDs, Garage object keys, original names,
content types, file sizes, and creation times.

File contents are stored in Garage, not SQLite.

## Upload Flow

1. Authenticate the app credential.
2. Verify that the project is active and belongs to the authenticated app.
3. Parse multipart form data.
4. Validate the `file` field and file size.
5. Generate a file metadata ID and Garage object key.
6. Upload the object to Garage.
7. Insert metadata into SQLite.
8. If metadata insertion fails, attempt to delete the uploaded object.

Object cleanup is best-effort. If cleanup fails, an orphaned object
may remain and should be investigated through logs and storage checks.

## Download Flow

1. Authenticate the app credential.
2. Look up the file by file ID and project ID.
3. Verify that the project belongs to the authenticated app and is active.
4. Retrieve the object from Garage.
5. Return the bytes with attachment and cache-control headers.

## Delete Flow

1. Authenticate the app credential.
2. Verify file, project, and application ownership.
3. Delete the Garage object.
4. Delete the SQLite metadata row.

If object deletion succeeds but metadata deletion fails, the system
can temporarily contain inconsistent metadata. Check logs before retrying.

## Request Limits

The default maximum file size is 25 MiB.

The request body limit is configured as the file limit plus 1 MiB
to allow for multipart overhead. Any reverse proxy or tunnel may impose
additional limits.