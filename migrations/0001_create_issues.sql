CREATE TABLE issues (
    id TEXT PRIMARY KEY NOT NULL,
    ticket_number TEXT NOT NULL UNIQUE,
    reporter_name TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Medium',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);