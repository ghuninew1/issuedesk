import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const databasePath =
  process.env.DATABASE_PATH || join(process.cwd(), 'data', 'storage.db')

mkdirSync(dirname(databasePath), { recursive: true })

export const db = new Database(databasePath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_credentials (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    secret_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'revoked')),
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id)
      REFERENCES apps(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bucket TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id)
      REFERENCES apps(id)
      ON DELETE CASCADE,
    UNIQUE (app_id, name)
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)
      REFERENCES projects(id)
      ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_credentials_app
    ON app_credentials(app_id);

  CREATE INDEX IF NOT EXISTS idx_projects_app
    ON projects(app_id);

  CREATE INDEX IF NOT EXISTS idx_files_project
    ON files(project_id);

  CREATE INDEX IF NOT EXISTS idx_files_project_created
    ON files(project_id, created_at DESC, id DESC);
`)

console.log(`SQLite database initialized: ${databasePath}`)
