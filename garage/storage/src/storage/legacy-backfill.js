import { legacyNameKey } from './names.js'

export function backfillLegacyFiles(db) {
  const missing = db.prepare(`
    SELECT f.id, f.project_id, f.original_name, f.object_key, f.content_type, f.size, f.created_at
    FROM files f LEFT JOIN storage_objects o ON o.object_id = f.id
    WHERE o.object_id IS NULL
    ORDER BY f.created_at, f.id
  `).all()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO storage_objects (
      object_id, project_id, parent_id, type, name, normalized_name, provider_reference,
      content_type, size_bytes, created_at, updated_at
    ) VALUES (?, ?, NULL, 'file', ?, ?, ?, ?, ?, ?, ?)
  `)
  const run = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.id, row.project_id, row.original_name, legacyNameKey(row.original_name, row.id), row.object_key, row.content_type, row.size, row.created_at, row.created_at)
    }
  })
  run.immediate(missing)
  return missing.length
}
