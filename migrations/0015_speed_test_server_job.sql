CREATE TABLE IF NOT EXISTS speed_test_server_job (
    slot INTEGER PRIMARY KEY CHECK (slot = 1),
    id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'cancelling', 'complete', 'cancelled', 'failed', 'expired')),
    expires_at INTEGER NOT NULL,
    lease TEXT,
    result TEXT,
    error TEXT
);
