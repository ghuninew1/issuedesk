import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { createApp } from '../src/app.js'
import { createStorageManager } from '../src/storage/manager.js'
import { createProviderRegistry } from '../src/storage/providers/index.js'
import { createGarageProvider } from '../src/storage/providers/garage.js'
import { ERROR_CODES } from '../src/storage/errors.js'
import { applyMigrations } from '../src/storage/migrations.js'

// Import the real schema with an explicit in-memory DB; never import production data.
process.env.DATABASE_PATH = ':memory:'
const { db } = await import('../src/db.js')
await applyMigrations(db)
after(() => db.close())
const secret = 'test-app-secret'
const appId = 'app-test'
const projectId = 'project-test'
const foreignProject = 'project-foreign'
db.prepare('INSERT INTO apps (id,name) VALUES (?,?)').run(appId, 'test')
db.prepare('INSERT INTO apps (id,name) VALUES (?,?)').run('foreign-app', 'foreign')
db.prepare('INSERT INTO app_credentials (id,app_id,secret_hash) VALUES (?,?,?)').run('credential-test', appId, createHash('sha256').update(secret).digest('hex'))
db.prepare('INSERT INTO projects (id,app_id,name,bucket) VALUES (?,?,?,?)').run(projectId, appId, 'test project', 'private-bucket')
db.prepare('INSERT INTO projects (id,app_id,name,bucket) VALUES (?,?,?,?)').run(foreignProject, 'foreign-app', 'foreign', 'foreign-bucket')
const mount = { provider: 'garage', bucket: 'private-bucket' }
const providerRef = randomUUID()
const objects = new Map()
const calls = []
let unavailable = false
const s3 = { async send(command, options) {
  calls.push({ command, options })
  if (unavailable) throw new Error('secret host bucket credential SQL private details')
  const input = command.input
  switch (command.constructor.name) {
    case 'PutObjectCommand': objects.set(input.Key, { bytes: input.Body, type: input.ContentType }); return {}
    case 'DeleteObjectCommand': objects.delete(input.Key); return {}
    case 'GetObjectCommand': {
      const object = objects.get(input.Key)
      if (!object) throw Object.assign(new Error('private missing key'), { name: 'NoSuchKey' })
      return { Body: Readable.from([object.bytes]), ContentLength: object.bytes.length, ContentType: object.type }
    }
    case 'ListObjectsV2Command': return { Contents: [{ Key: providerRef, Size: 3 }], IsTruncated: true, NextContinuationToken: 'cursor' }
    case 'HeadObjectCommand': return { ContentLength: 3, ContentType: 'text/plain' }
    default: throw new Error('unexpected command')
  }
} }
const storage = createStorageManager(createProviderRegistry(createGarageProvider({ s3, timeoutMs: 2000 })))
const app = createApp({ db, storage, bucket: mount.bucket, apiToken: 'legacy', maxFileSize: 100 })
const url = `/v2/projects/${projectId}/files`
function request(path = url, init = {}) {
  return app.request(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...init.headers } })
}
function upload(name = 'hello.txt', size = 3) {
  const body = new FormData()
  body.append('file', new File(['x'.repeat(size)], name, { type: 'text/plain' }))
  return request(url, { method: 'POST', body })
}

test('v2 list/upload/download/delete preserve JSON, identity, metadata and headers', async () => {
  const response = await upload("hello'ภาษาไทย.txt")
  assert.equal(response.status, 201)
  const { file } = await response.json()
  assert.deepEqual(Object.keys(file).sort(), ['id','projectId','name','contentType','size','createdAt'].sort())
  assert.equal(file.projectId, projectId)
  const row = db.prepare('SELECT * FROM files WHERE id=?').get(file.id)
  assert.notEqual(row.id, row.object_key)
  assert.equal(calls.at(-1).command.input.Bucket, mount.bucket)
  const list = await request()
  assert.deepEqual(await list.json(), { success: true, project: { id: projectId, name: 'test project' }, files: [{ id: row.id, original_name: row.original_name, content_type: row.content_type, size: row.size, created_at: row.created_at }] })
  const download = await request(`${url}/${file.id}`)
  assert.equal(download.status, 200)
  assert.equal(download.headers.get('content-length'), '3')
  assert.equal(download.headers.get('content-type'), 'text/plain')
  assert.match(download.headers.get('content-disposition'), /hello%27/)
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await download.text(), 'xxx')
  const deleted = await request(`${url}/${file.id}`, { method: 'DELETE' })
  assert.deepEqual(await deleted.json(), { success: true, fileId: file.id, projectId, message: 'File deleted successfully' })
  assert.equal(db.prepare('SELECT * FROM files WHERE id=?').get(file.id), undefined)
  assert.equal(objects.has(row.object_key), false)
})

test('invalid credentials and wrong project/file scope fail without provider calls', async () => {
  const { file } = await (await upload()).json()
  const before = calls.length
  for (const method of ['GET','POST','DELETE']) {
    const path = method === 'POST' ? url : `${url}/${file.id}`
    assert.equal((await request(path, { method, headers: { Authorization: 'Bearer invalid' } })).status, 401)
  }
  for (const project of [foreignProject, 'missing', "bad' OR 1=1--"]) {
    const base = `/v2/projects/${encodeURIComponent(project)}/files`
    assert.equal((await request(base)).status, 404)
    assert.equal((await request(base, { method: 'POST' })).status, 404)
    for (const method of ['GET', 'DELETE']) assert.equal((await request(`${base}/${file.id}`, { method })).status, 404)
  }
  assert.equal((await request(`${url}/malformed`)).status, 404)
  assert.equal(calls.length, before)
})

test('upload validations preserve 400/413 and do not contact provider', async () => {
  const before = calls.length
  assert.equal((await request(url, { method: 'POST', body: 'not multipart' })).status, 400)
  assert.equal((await request(url, { method: 'POST', body: new FormData() })).status, 400)
  assert.equal((await upload('empty', 0)).status, 400)
  assert.equal((await upload('large', 101)).status, 413)
  assert.equal((await request(url, { method: 'POST', body: 'x', headers: { 'Content-Length': String(1024 * 1024 + 101) } })).status, 413)
  assert.equal(calls.length, before)
})

test('provider failures retain v2 envelopes and hide details; missing object stays 404', async () => {
  const { file } = await (await upload()).json()
  const row = db.prepare('SELECT * FROM files WHERE id=?').get(file.id)
  unavailable = true
  try {
    for (const [path, method] of [[url,'POST'],[`${url}/${file.id}`,'GET'],[`${url}/${file.id}`,'DELETE']]) {
      const response = method === 'POST' ? await upload() : await request(path, { method })
      assert.equal(response.status, 502)
      const text = await response.text()
      assert.equal(JSON.parse(text).success, false)
      assert.doesNotMatch(text, /secret|bucket|credential|SQL|host/)
    }
  } finally { unavailable = false }
  objects.delete(row.object_key)
  const response = await request(`${url}/${file.id}`)
  assert.equal(response.status, 404)
  assert.equal((await response.json()).message, 'File object not found in storage')
})

test('registry, capabilities and normalized provider mapping fail closed', async () => {
  const caps = storage.getCapabilities({ mount })
  for (const name of ['upload','download','list','stat','permanentDelete']) assert.equal(caps[name], true)
  for (const name of ['preview','rangeRead','share','trash','restore','rename','move','createFolder']) assert.equal(caps[name], false)
  assert.equal(caps.copy, true)
  for (const operation of ['createFolder','rename','move','restore']) await assert.rejects(storage[operation]({ mount }), { code: 'CAPABILITY_UNAVAILABLE' })
  await assert.rejects(storage.list({ mount: { provider: 'smb' } }), { code: 'CAPABILITY_UNAVAILABLE' })
  await assert.rejects(storage.download({ mount, providerRef: '../secret' }), { code: 'INVALID_INPUT' })
  assert.deepEqual(await storage.stat({ mount, providerRef }), { size: 3, mimeType: 'text/plain', modifiedAt: undefined })
  const result = await storage.list({ mount })
  assert.equal(result.items[0].providerRef, providerRef)
  assert.equal(result.nextCursor, 'cursor')
  assert.equal(ERROR_CODES.length, 9)
})

test('legacy default gate and opt-in list/download remain compatible', async () => {
  assert.equal((await app.request('/api/files')).status, 404)
  const legacy = createApp({ db, storage, bucket: mount.bucket, apiToken: 'legacy', enableLegacyApi: true, maxFileSize: 100 })
  const response = await legacy.request('/api/files', { headers: { Authorization: 'Bearer legacy' } })
  assert.deepEqual(await response.json(), { success: true, files: [{ key: providerRef, size: 3 }], isTruncated: true, nextContinuationToken: 'cursor' })
})

function streamedProvider(source, length, timeoutMs = 2000) {
  let signal
  const provider = createGarageProvider({ timeoutMs, s3: { async send(command, options) {
    signal = options.abortSignal
    return { Body: source, ContentLength: length, ContentType: 'text/plain' }
  } } })
  return { provider, signal: () => signal }
}

test('download streams first chunk before EOF, without byte-array buffering', async () => {
  let finish
  const source = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([65])); finish = () => { c.enqueue(new Uint8Array([66])); c.close() } } })
  const { provider } = streamedProvider(source, 2)
  const result = await provider.download({ mount, providerRef })
  const reader = result.body.getReader()
  assert.equal((await reader.read()).value[0], 65)
  finish()
  assert.equal((await reader.read()).value[0], 66)
  assert.equal((await reader.read()).done, true)
})

test('consumer cancel and caller abort cancel upstream; timeout and truncation fail safely', async () => {
  for (const mode of ['cancel','abort','timeout']) {
    let cancelled = false
    const source = new ReadableStream({ cancel() { cancelled = true } })
    const { provider, signal } = streamedProvider(source, 5, mode === 'timeout' ? 20 : 2000)
    const caller = new AbortController()
    const result = await provider.download({ mount, providerRef, signal: caller.signal })
    if (mode === 'cancel') await result.body.cancel()
    else {
      const read = result.body.getReader().read()
      if (mode === 'abort') caller.abort()
      await assert.rejects(read, { code: 'TRANSFER_INCOMPLETE' })
    }
    assert.equal(cancelled, true)
    assert.equal(signal().aborted, true)
  }
  const { provider } = streamedProvider(Readable.from([Buffer.from('x')]), 5)
  const result = await provider.download({ mount, providerRef })
  await assert.rejects(new Response(result.body).text(), { code: 'TRANSFER_INCOMPLETE' })
})

test('upstream request timeout passes abort signal and normalizes errors', async () => {
  const provider = createGarageProvider({ timeoutMs: 20, s3: { send(command, { abortSignal }) {
    return new Promise((resolve, reject) => abortSignal.addEventListener('abort', () => reject(new Error('private endpoint')), { once: true }))
  } } })
  await assert.rejects(provider.download({ mount, providerRef }), { code: 'PROVIDER_UNAVAILABLE', message: 'PROVIDER_UNAVAILABLE' })
})

test('wrong relationship within same app is denied and SQLite errors do not leak', async () => {
  db.prepare('INSERT INTO projects (id,app_id,name,bucket) VALUES (?,?,?,?)').run('other-owned-project', appId, 'other', mount.bucket)
  const { file } = await (await upload()).json()
  const before = calls.length
  for (const method of ['GET', 'DELETE']) assert.equal((await request(`/v2/projects/other-owned-project/files/${file.id}`, { method })).status, 404)
  assert.equal(calls.length, before)
  db.exec("CREATE TRIGGER reject_upload BEFORE INSERT ON files BEGIN SELECT RAISE(ABORT, 'private SQL error'); END")
  try {
    const response = await upload()
    assert.equal(response.status, 502)
    assert.doesNotMatch(await response.text(), /private|SQL|bucket/)
    assert.equal(calls.at(-1).command.constructor.name, 'DeleteObjectCommand')
    assert.equal(objects.has(calls.at(-1).command.input.Key), false)
  } finally { db.exec('DROP TRIGGER reject_upload') }
})

test('stream errors, missing bodies, safe headers and completed deadline cleanup', async () => {
  const { safeContentType, attachmentName } = await import('../src/storage/validation.js')
  assert.equal(safeContentType('text/plain\n'), 'application/octet-stream')
  assert.equal(safeContentType('text/plain\r\nX-Injected: yes'), 'application/octet-stream')
  assert.equal(safeContentType('text/plain; charset=utf-8'), 'text/plain; charset=utf-8')
  assert.doesNotMatch(attachmentName("x\r\n'y"), /[\r\n']/)
  const missing = createGarageProvider({ s3: { async send() { return {} } } })
  assert.deepEqual(await missing.download({ mount, providerRef }), { body: null })
  const broken = streamedProvider(new ReadableStream({ pull(c) { c.error(new Error('private upstream')) } }), 1)
  await assert.rejects(new Response((await broken.provider.download({ mount, providerRef })).body).text(), { code: 'TRANSFER_INCOMPLETE' })
  const completed = streamedProvider(Readable.from([Buffer.from('x')]), 1, 20)
  assert.equal(await new Response((await completed.provider.download({ mount, providerRef })).body).text(), 'x')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(completed.signal().aborted, false)
})
