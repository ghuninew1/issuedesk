CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  object_id TEXT NOT NULL UNIQUE,
  provider_reference TEXT NOT NULL UNIQUE,
  provider_upload_id TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  parent_id TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  part_size INTEGER NOT NULL,
  part_count INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('creating','active','paused','completing','completed','cancelling','cancelled','expired')),
  version INTEGER NOT NULL DEFAULT 0,
  lock_token TEXT,
  lock_until INTEGER NOT NULL DEFAULT 0,
  cleanup_after INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(project_id, request_key)
);
CREATE INDEX upload_sessions_cleanup ON upload_sessions(state, expires_at, lock_until);
CREATE TABLE upload_parts (
  session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK(part_number > 0),
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  etag TEXT,
  PRIMARY KEY(session_id, part_number)
);

-- Prevent a delayed create request from resurrecting a cancelled broker intent.
CREATE TABLE upload_cancellations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  PRIMARY KEY(project_id, request_key)
);

-- Service-wide bound for part buffers, shared across Node instances on this DB.
CREATE TABLE upload_part_leases (token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
