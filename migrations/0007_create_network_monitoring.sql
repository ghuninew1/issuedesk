CREATE TABLE IF NOT EXISTS network_snapshots (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    router_identity TEXT NOT NULL,
    router_uptime TEXT NOT NULL,
    cpu_load REAL NOT NULL CHECK (cpu_load >= 0 AND cpu_load <= 100),
    memory_total_bytes INTEGER NOT NULL CHECK (memory_total_bytes > 0),
    memory_free_bytes INTEGER NOT NULL CHECK (memory_free_bytes >= 0),
    temperature_c REAL,
    ais_interface TEXT NOT NULL,
    ais_running INTEGER NOT NULL CHECK (ais_running IN (0, 1)),
    ais_ip_address TEXT,
    ais_rx_bytes INTEGER NOT NULL CHECK (ais_rx_bytes >= 0),
    ais_tx_bytes INTEGER NOT NULL CHECK (ais_tx_bytes >= 0),
    true_interface TEXT NOT NULL,
    true_running INTEGER NOT NULL CHECK (true_running IN (0, 1)),
    true_ip_address TEXT,
    true_rx_bytes INTEGER NOT NULL CHECK (true_rx_bytes >= 0),
    true_tx_bytes INTEGER NOT NULL CHECK (true_tx_bytes >= 0),
    UNIQUE (agent_id, collected_at)
);

CREATE INDEX IF NOT EXISTS idx_network_snapshots_collected_at
    ON network_snapshots(collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_network_snapshots_agent_collected
    ON network_snapshots(agent_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS network_events (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    description TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    wan_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_network_events_occurred_at
    ON network_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS network_agent_state (
    agent_id TEXT PRIMARY KEY,
    latest_snapshot_id TEXT,
    latest_snapshot_at TEXT,
    last_heartbeat_at TEXT NOT NULL,
    last_retention_at TEXT
);
