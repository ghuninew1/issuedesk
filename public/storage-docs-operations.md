# Operations and Troubleshooting

## Project Location

Run commands on the QNAP from:

`/share/VHD/garage`

## Inspect Services

\`\`\`sh
cd /share/VHD/garage
docker compose ps
docker compose logs --tail=100 garage storage-api
\`\`\`

Do not share output that contains secrets.

## Health Check

From a machine that can reach the QNAP:

\`\`\`sh
curl -i http://192.168.11.32:3000/health
\`\`\`

A successful response includes:

\`\`\`json
{
  "success": true,
  "service": "storage-api"
}
\`\`\`

This checks HTTP responsiveness only.

## Verify Legacy API Is Disabled

\`\`\`sh
curl -i http://192.168.11.32:3000/api/files
\`\`\`

When `ENABLE_LEGACY_API=false`, the expected status is `404`.

Do not enable the legacy API simply to make a test succeed.

## Update Storage API

1. Back up Garage data and SQLite metadata.
2. Review code and configuration changes.
3. Confirm that no secret files are staged in Git.
4. Rebuild the Storage API container:

   \`\`\`sh
   docker compose up -d --build storage-api
   \`\`\`

5. Inspect service status and logs.
6. Test health and authenticated V2 file operations.

For Garage upgrades, review the upgrade instructions for the deployed
Garage version first. Keep a rollback plan.

## Backups

Back up both:

- Garage persistent data under `./data`.
- SQLite metadata under `./storage/data`.

The two sets of data are related. Restoring only one side can leave
missing objects or orphaned metadata.

SQLite uses WAL mode and may create:

- `storage.db-wal`
- `storage.db-shm`

Do not delete these files while Storage API is running.

Use SQLite's online backup API or another WAL-aware backup method.
If copying database files directly, stop the API cleanly first and
verify the backup before restarting.

Garage backup and restore must follow the procedure appropriate to
the deployed Garage topology and version.

Periodically test restoring backups.

## Troubleshooting

### Storage API exits during startup

- Check container logs for missing required environment variables.
- Confirm `storage/.env` exists.
- Check `PORT` and `MAX_FILE_SIZE_MB`.
- Never disclose secret values while sharing logs.

### Health works, but uploads fail

- Check Storage API logs.
- Confirm Garage is running and reachable on `storage-network`.
- Verify the S3 endpoint, bucket, and credentials.
- Check available disk space and file size limits.

### V2 returns `401`

- Check the Bearer authorization header.
- Verify the credential is active and unexpired.
- Verify that its application is active.
- If revoked, issue a new credential and store it securely.

### V2 returns `404 Project not found`

- Verify the project ID.
- Confirm that the project belongs to the credential's application.
- Confirm that the project status is active.

The response may intentionally hide projects belonging to other apps.

### Upload or delete leaves inconsistent data

Upload cleanup is best-effort if metadata insertion fails.
Delete removes the Garage object before removing SQLite metadata.

Inspect logs and verify both Garage objects and metadata before retrying.

### Cloudflare Pages cannot reach QNAP

A Cloudflare Pages Function normally cannot route directly to
`192.168.11.32`.

A user's browser may reach the QNAP over VPN while a Pages Function
cannot. Configure a secure HTTPS tunnel/access layer or another
intentional network connection before integrating a public deployment.

Do not solve this by exposing Garage publicly or embedding credentials
in frontend code.