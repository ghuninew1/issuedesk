PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user')),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,
    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    email_normalized TEXT NOT NULL,
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success INTEGER NOT NULL
        CHECK (success IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
    ON login_attempts(email_normalized, attempted_at);