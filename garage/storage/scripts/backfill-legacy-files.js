import { db } from '../src/db.js'
import { backfillLegacyFiles } from '../src/storage/legacy-backfill.js'

try {
  const count = backfillLegacyFiles(db)
  console.log(`Backfilled ${count} legacy file record(s).`)
} finally {
  db.close()
}
