import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationPattern = /^(\d{4})_[a-z0-9_]+\.sql$/

export async function applyMigrations(db, directory = new URL('../../migrations/', import.meta.url)) {
  const migrationDirectory = directory instanceof URL ? fileURLToPath(directory) : directory
  const names = (await readdir(migrationDirectory)).filter((name) => migrationPattern.test(name)).sort()
  db.exec(`CREATE TABLE IF NOT EXISTS storage_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  const applied = new Set(db.prepare('SELECT version FROM storage_schema_migrations').all().map(({ version }) => version))
  const runMigration = db.transaction((version, name, sql) => {
    db.exec(sql)
    db.prepare('INSERT INTO storage_schema_migrations (version, name) VALUES (?, ?)').run(version, name)
  })
  for (const name of names) {
    const version = Number(name.slice(0, 4))
    if (applied.has(version)) continue
    runMigration.immediate(version, name, await readFile(join(migrationDirectory, name), 'utf8'))
  }
}
