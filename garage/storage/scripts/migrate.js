import { db } from '../src/db.js'
import { applyMigrations } from '../src/storage/migrations.js'

try {
  await applyMigrations(db)
  console.log('Storage Service migrations applied.')
} finally {
  db.close()
}
