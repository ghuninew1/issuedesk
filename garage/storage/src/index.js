import { db } from './db.js'
import { serve } from '@hono/node-server'
import { S3Client } from '@aws-sdk/client-s3'
import { createApp } from './app.js'
import { createStorageManager } from './storage/manager.js'
import { createProviderRegistry } from './storage/providers/index.js'
import { createGarageProvider } from './storage/providers/garage.js'

const migrationTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'storage_schema_migrations'").get()
if (!migrationTable || !db.prepare('SELECT 1 FROM storage_schema_migrations WHERE version = 1').get()) {
  throw new Error('Storage migration 0001 is required. Run pnpm migrate before starting this service version.')
}

const requiredEnv = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'STORAGE_API_TOKEN',
]

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
}

const port = Number(process.env.PORT || 3000)
const maxFileSize = Number(process.env.MAX_FILE_SIZE_MB || 25) * 1024 * 1024
const bucket = process.env.S3_BUCKET

const apiToken = process.env.STORAGE_API_TOKEN
const enableLegacyApi = process.env.ENABLE_LEGACY_API === 'true'

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port')
}

if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0) {
  throw new Error('MAX_FILE_SIZE_MB must be a positive number')
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})


const timeoutMs = Number(process.env.STORAGE_PROVIDER_TIMEOUT_MS || 60000)
const storage = createStorageManager(createProviderRegistry(createGarageProvider({ s3, timeoutMs })))
const app = createApp({ db, storage, bucket, apiToken, enableLegacyApi, maxFileSize })
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`Storage API listening on port ${port}`)
