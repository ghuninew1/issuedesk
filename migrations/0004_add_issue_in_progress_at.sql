ALTER TABLE issues ADD COLUMN in_progress_at TEXT;

UPDATE issues
SET in_progress_at = updated_at
WHERE status = 'In Progress';
