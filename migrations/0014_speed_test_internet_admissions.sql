CREATE TABLE IF NOT EXISTS speed_test_internet_admissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    issued_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_speed_test_internet_admissions_issued
    ON speed_test_internet_admissions (issued_at);

CREATE INDEX IF NOT EXISTS idx_speed_test_internet_admissions_user_issued
    ON speed_test_internet_admissions (user_id, issued_at);
