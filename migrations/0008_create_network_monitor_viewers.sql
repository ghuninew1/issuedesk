CREATE TABLE IF NOT EXISTS network_monitor_viewers (
    viewer_id TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_network_monitor_viewers_expires_at
    ON network_monitor_viewers(expires_at);
