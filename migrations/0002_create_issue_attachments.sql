CREATE TABLE IF NOT EXISTS issue_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    issue_id TEXT NOT NULL,
    storage_file_id TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (issue_id)
        REFERENCES issues(id)
        ON DELETE CASCADE,

    CHECK (file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue_id
ON issue_attachments(issue_id);