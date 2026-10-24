CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    work_date TEXT NOT NULL,
    check_in_at TEXT,
    check_out_at TEXT,
    status TEXT NOT NULL DEFAULT 'working'
        CHECK (status IN ('working', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_work_date
    ON attendance_records(work_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date
    ON attendance_records(user_id, work_date);