# Garage Storage Stack

Private S3-compatible object storage running on QNAP NAS with Garage
and a Node.js Storage API.

## Architecture

The stack contains two Docker services:

- **Garage** — stores file objects through an S3-compatible API.
- **Storage API** — provides HTTP endpoints for uploading, downloading,
  listing, and deleting files, with SQLite metadata and app-level access
  control.

## Deployment Location

QNAP project root:

`/share/VHD/garage/`

Directory structure:

\`\`\`text
/share/VHD/garage/
├── docker-compose.yml
├── garage.toml
├── data/
└── storage/
    ├── .env
    ├── .env.example
    ├── Dockerfile
    ├── package.json
    ├── src/
    │   ├── index.js
    │   ├── admin.js
    │   ├── app-auth.js
    │   └── db.js
    └── data/
        └── storage.db
\`\`\`

The actual `.env` file contains secrets and must never be committed to Git.

## Services

| Service | Container | Host Address | Purpose |
|---|---|---|---|
| Garage | `garage` | `192.168.11.32:3900` | S3-compatible object storage |
| Storage API | `storage-api` | `192.168.11.32:3000` | HTTP API and metadata management |

Both containers use the Docker bridge network `storage-network`.

Storage API connects to Garage through the internal Docker address:

`http://garage:3900`

The host ports are bound to `192.168.11.32`. Verify QNAP firewall,
VPN, and router settings separately; interface binding alone does not
guarantee complete network isolation.

## Data Persistence

- `./data` stores Garage persistent data.
- `./storage/data` stores SQLite metadata.
- `./storage/.env` supplies runtime environment variables.
- `./garage.toml` is mounted read-only into the Garage container.

Garage stores the file contents. SQLite stores application, credential,
project, and file metadata.

Both Garage data and SQLite metadata must be backed up.

## Start and Inspect Services

Run on the QNAP:

\`\`\`sh
cd /share/VHD/garage
docker compose ps
docker compose logs --tail=100 garage storage-api
\`\`\`

## Storage API Health Check

From a machine that can access the QNAP LAN or VPN:

\`\`\`sh
curl -i http://192.168.11.32:3000/health
\`\`\`

A successful response contains:

\`\`\`json
{
  "success": true,
  "service": "storage-api"
}
\`\`\`

This checks whether the HTTP service responds. It does not verify
the complete Garage upload/download path.

## Legacy API

Legacy `/api/*` routes are disabled by default when:

`ENABLE_LEGACY_API=false`

Keep this setting unless there is a specific reason to enable the legacy
API. New integrations should use the project-scoped `/v2/` endpoints.

## Security

- Never commit `storage/.env`.
- Never expose admin tokens or app credentials in frontend JavaScript.
- Do not expose Garage's S3 port directly to the public internet.
- Use separate app credentials for separate integrations.
- Keep `STORAGE_ADMIN_TOKEN` restricted to trusted operators.
- Use HTTPS when traffic crosses an untrusted network.

## Cloudflare Pages Connectivity

A Cloudflare Pages Function normally cannot connect directly to a private
QNAP address such as `192.168.11.32`.

A browser on a computer connected to the VPN may reach the QNAP, but a
Pages Function runs on Cloudflare infrastructure and does not inherit
the computer's VPN connection.

Before integrating a public IssueDesk deployment, establish a secure
connectivity design, such as a properly configured HTTPS tunnel with
access controls or a private deployment reachable over the VPN.

Do not embed storage credentials in the browser or publish the Garage
S3 endpoint as a workaround.

## Updates

Before updating either service:

1. Back up Garage data and SQLite metadata.
2. Review configuration and code changes.
3. Confirm that no secrets are staged for Git.
4. Rebuild only the service that needs updating.
5. Inspect service logs and run health and authenticated API tests.
6. Keep a rollback plan.

For a Storage API code update:

\`\`\`sh
docker compose up -d --build storage-api
\`\`\`

Do not delete data directories as a routine troubleshooting step.

## Storage API Documentation

See `storage/README.md` for Storage API usage.

Additional documentation:

- `storage/docs/architecture.md`
- `storage/docs/api-reference.md`
- `storage/docs/security.md`
- `storage/docs/operations.md`