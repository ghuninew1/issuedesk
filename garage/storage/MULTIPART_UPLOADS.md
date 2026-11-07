# Resumable multipart backend (disabled by default)

This service adds authenticated provider-neutral `/v3/projects/:projectId/uploads` endpoints for Nexora. The IssueDesk application UI is unchanged. Browser clients must continue through Nexora authorization; never call this service or Garage directly from the browser.

## Prerequisites and rollout boundary

Source implementation only. No production migration, deployment, Garage probe or 10 GiB verification is implied. Apply additive `migrations/0002_resumable_uploads.sql` only to an explicitly approved target before setting `STORAGE_RESUMABLE_UPLOADS_ENABLED=true`. Without this flag, legacy small uploads remain available and new resumable operations are disabled. Existing cancellation routes remain available when the schema exists; cleanup runs at startup and hourly even if creation is disabled.

No dependencies or package versions changed. Multipart uses the existing AWS SDK (`CreateMultipartUpload`, `UploadPart`, `ListParts`, `CompleteMultipartUpload`, `AbortMultipartUpload`, `ListMultipartUploads`, `HeadObject`, `DeleteObject`). Existing legacy/v2/v3 `/files` uploads retain their original parsing and size limits.

## Contract

- POST `/uploads`: JSON `{name,parentId,sizeBytes,mimeType,expiresAt?}` and `Idempotency-Key`. The optional absolute expiry is an internal Nexora broker value, bounded to seven days; never trust a browser project/app/owner field.
- GET `/uploads/:id?partsCursor=0&limit=100`: logical session state, version, geometry, acknowledged bytes and verified `{partNumber,sizeBytes,sha256}` receipts, max100/page. Reconciles provider ListParts; internal ETags/upload IDs/keys never leave this contract. A lost provider receipt is retried with identical bytes rather than declared successful from an unverified ListParts entry.
- PUT `/uploads/:id/parts/:n`: raw `application/octet-stream`, `X-Part-SHA256` base64, exact negotiated byte count. At most one8 MiB part is buffered per operation to hash before S3. No full large-file buffer.
- POST `/uploads/:id/{pause,resume,complete}`: `{version}`. Finalize is serialized, validates exact part count/size and current parent/name, uses server-held receipts, and publishes metadata transactionally. Repeated completion returns the same logical object. Lost Garage completion response/failed SQL commit recover using a session marker on the completed object's HEAD.
- DELETE `/uploads/:id`: idempotent durable cancellation; a completing/completed session returns409. Retry after transient cleanup errors. Cleanup never deletes a published object.
- DELETE `/uploads/by-key/:key`: internal broker recovery when creation acknowledgement is lost. Persists a cancellation tombstone before aborting any existing session; never starts a new MPU merely to cancel it.
- App credential/project ownership is checked on every route. Unknown, inactive and foreign projects/sessions fail closed. Background cleanup can clean the original mapping of a disabled project without granting user access.

Limits:10 GiB/file,8 MiB fixed parts,1280 maximum parts,1 concurrent operation/session,4 globally leased part buffers on the shared SQLite DB,20 active sessions and100 GiB declared pending bytes/project. These are admission budgets, not physical quota/usage reporting. Session TTL is fixed7 days; no silent renewal. Per-operation deadline4 minutes, durable lease15 minutes, bounded cleanup20 sessions/batch/hour. Provider pagination caps discovery work; application status pages max100 receipts. HTTP requests can return transient errors instead of fake202 jobs: the client polls status and explicitly retries uncertain completion after reconciliation. A durable unattended finalization worker is not implemented.

## Recovery and cleanup

Session creation intent, immutable per-part digest journal, provider UploadId/ETag and completion state persist in SQLite. Duplicate part data must match its original digest. A crashed process releases no unsafe lease early: recovery waits for the15-minute lease. A paused session retains receipts. Startup/hourly cleanup uses durable locking and original session mappings, retries cancellation, aborts discovered MPUs, removes only matching unpublished completed objects and releases reservations after confirmation. Cancelled/expired tombstones are rechecked hourly for late provider effects; journal/tombstone pruning is intentionally deferred to a reviewed retention policy to preserve idempotency. No data is purged on application startup.

The sweeper is embedded in the existing Node service. If every replica is stopped, cleanup waits for restart. Large abandoned backlogs drain in bounded batches; operators must monitor cleanup counts/failures and add verified platform rate limits, physical capacity admission, retention and alerting before enabling production use. No operator configuration was changed here.

## Validation boundary

Automated tests use in-memory SQLite and an SDK transport mock (plus existing loopback disconnect tests); they exercise actual manager/routes/adapter, not a replacement implementation. See Nexora `docs/LARGE_FILE_TRANSFER_BACKEND.md` and both project handoffs for actual counts/commands. Real Garage compatibility, checksums, metadata marker preservation, conditional behaviors, proxy deadlines, throughput/peak memory, mobile source persistence and10 GiB end-to-end verification remain unverified. Keep the flag off until isolated integration acceptance passes.

## Docker Update storage-api

```sh
docker compose build storage-api
docker compose up -d --no-deps storage-api
docker compose logs -f --tail=100 storage-api
```


## Phase 3A — isolated acceptance suite

The separate Nexora checkout now contains `scripts/acceptance/run.mjs`, a non-secret config template, safety tests, and `docs/LARGE_FILE_TRANSFER_ACCEPTANCE.md` with the resource/failure report and readiness checklist. Default invocation writes a BLOCKED report and performs no network I/O. Real runs require an explicitly confirmed empty `nexora-acceptance-*` bucket and dedicated test-only credentials. The runner creates private SQLite fixtures, exercises the actual Nexora API and this Hono/Node/S3 implementation, verifies full streamed checksums, injects controlled acknowledgement loss, tests socket interruption and process restart, and performs journal-scoped teardown. Production source flags remain off; no production entrypoint, existing DB, deployment or remote migration is used. Clock-advanced expiry tests do not verify the deployed hourly scheduler or seven days of wall time.

Current Phase3A real-provider status: BLOCKED. No isolated Garage endpoint/bucket/key was supplied and no Docker/Podman/Garage executable was available on the workstation. All real-provider100MiB/1GiB/10GiB, resource, orphan and proxy results remain unverified; mock regressions and worker boot tests are separate local evidence. Preserve private cleanup journals outside Git, never recursive-delete unknown bucket contents, and do not change production policies to make acceptance pass.
