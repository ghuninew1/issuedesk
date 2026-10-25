CREATE TABLE IF NOT EXISTS network_ping_checks (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed')),
    requested_by TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS network_ping_results (
    id TEXT PRIMARY KEY,
    check_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'online', 'offline', 'error')),
    latency_ms REAL CHECK (latency_ms IS NULL OR (latency_ms >= 0 AND latency_ms <= 60000)),
    checked_at TEXT,
    UNIQUE (check_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_network_ping_checks_status_requested
    ON network_ping_checks(status, requested_at);

CREATE INDEX IF NOT EXISTS idx_network_ping_results_check
    ON network_ping_results(check_id);
