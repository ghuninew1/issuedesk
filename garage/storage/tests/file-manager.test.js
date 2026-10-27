import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { createApp } from '../src/app.js'
import { createStorageManager } from '../src/storage/manager.js'
import { createProviderRegistry } from '../src/storage/providers/index.js'
import { createGarageProvider } from '../src/storage/providers/garage.js'
import { applyMigrations } from '../src/storage/migrations.js'
import { createFileManager, MAX_SYNCHRONOUS_OBJECTS } from '../src/storage/file-manager.js'
import { backfillLegacyFiles } from '../src/storage/legacy-backfill.js'

process.env.DATABASE_PATH = ':memory:'
const { db } = await import('../src/db.js')
const secret = 's2-app-secret'
const appId = 's2-app'
const projectId = 's2-project'
const foreignProjectId = 's2-foreign-project'
db.prepare('INSERT INTO apps (id,name) VALUES (?,?)').run(appId, 'S2 test')
db.prepare('INSERT INTO apps (id,name) VALUES (?,?)').run('s2-other-app', 'other')
db.prepare('INSERT INTO app_credentials (id,app_id,secret_hash) VALUES (?,?,?)').run('s2-credential', appId, createHash('sha256').update(secret).digest('hex'))
db.prepare('INSERT INTO projects (id,app_id,name,bucket) VALUES (?,?,?,?)').run(projectId, appId, 'S2 files', 's2-bucket')
db.prepare('INSERT INTO projects (id,app_id,name,bucket) VALUES (?,?,?,?)').run(foreignProjectId, 's2-other-app', 'Foreign', 'foreign-bucket')
const legacyId = randomUUID()
const legacyRef = randomUUID()
db.prepare('INSERT INTO files (id, project_id, object_key, original_name, content_type, size) VALUES (?, ?, ?, ?, ?, ?)').run(legacyId, projectId, legacyRef, 'Legacy.txt', 'text/plain', 6)
await applyMigrations(db)
after(() => db.close())

const objects = new Map([[legacyRef, { bytes: Buffer.from('legacy'), type: 'text/plain' }]])
const deletedKeys = new Set()
const failDelete = new Set()
let failGet = new Set()
let failAnyDelete = false
const s3 = { async send(command) {
  const { Bucket, Key, Body, ContentType } = command.input
  if (Bucket === 'foreign-bucket') throw new Error('scope leak')
  switch (command.constructor.name) {
    case 'PutObjectCommand': {
      let bytes
      if (Buffer.isBuffer(Body) || Body instanceof Uint8Array) bytes = Buffer.from(Body)
      else { const chunks = []; for await (const chunk of Body) chunks.push(Buffer.from(chunk)); bytes = Buffer.concat(chunks) }
      objects.set(Key, { bytes, type: ContentType })
      return {}
    }
    case 'GetObjectCommand': {
      if (failGet.has(Key)) throw new Error('secret source network failure')
      const item = objects.get(Key)
      if (!item) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
      return { Body: Readable.from([item.bytes]), ContentLength: item.bytes.length, ContentType: item.type }
    }
    case 'HeadObjectCommand': {
      const item = objects.get(Key)
      if (!item) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
      return { ContentLength: item.bytes.length, ContentType: item.type }
    }
    case 'DeleteObjectCommand':
      if (failAnyDelete || failDelete.has(Key)) throw new Error('secret delete failure')
      objects.delete(Key); deletedKeys.add(Key); return {}
    default: throw new Error(`unexpected command ${command.constructor.name}`)
  }
} }
const provider = createGarageProvider({ s3, timeoutMs: 1000 })
const storage = createStorageManager(createProviderRegistry(provider))
const copyLogs = []
const app = createApp({ db, storage, bucket: 's2-bucket', apiToken: 'legacy-token', maxFileSize: 100, logger: { warn: (message) => copyLogs.push(message) } })
const filesUrl = `/v3/projects/${projectId}`
async function api(path, init = {}) {
  return app.request(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...init.headers } })
}
async function json(path, init = {}) {
  const response = await api(path, init)
  return { response, data: await response.json() }
}
async function createFolder(name, parentId = null) {
  const { response, data } = await json(`${filesUrl}/objects/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parentId }) })
  assert.equal(response.status, 201, JSON.stringify(data))
  return data.object
}
async function upload(name, parentId = null, value = 'data') {
  const form = new FormData()
  form.append('file', new File([value], name, { type: 'text/plain' }))
  if (parentId) form.append('parentId', parentId)
  const { response, data } = await json(`${filesUrl}/files`, { method: 'POST', body: form })
  assert.equal(response.status, 201, JSON.stringify(data))
  return data.object
}
async function list(parentId = null, cursor = null, limit = 50) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (parentId !== null) query.set('parentId', parentId)
  if (cursor) query.set('cursor', cursor)
  return json(`${filesUrl}/objects?${query}`)
}
async function trash(id) { return json(`${filesUrl}/objects/${id}`, { method: 'DELETE' }) }
async function operation(id) { return json(`${filesUrl}/operations/${id}`) }

test('additive migration preserves legacy file IDs and maps legacy files to project root', async () => {
  const { response, data } = await list()
  assert.equal(response.status, 200)
  assert.equal(data.items.length, 1)
  assert.deepEqual({ objectId: data.items[0].objectId, parentId: data.items[0].parentId, type: data.items[0].type, name: data.items[0].name }, { objectId: legacyId, parentId: null, type: 'file', name: 'Legacy.txt' })
  const v2 = await api(`/v2/projects/${projectId}/files`)
  assert.equal(v2.status, 200)
  assert.equal((await v2.json()).files[0].id, legacyId)
  await applyMigrations(db)
  assert.equal(db.prepare('SELECT count(*) AS count FROM storage_objects WHERE object_id=?').get(legacyId).count, 1)
  const newLegacyId = randomUUID()
  db.prepare('INSERT INTO files (id, project_id, object_key, original_name, content_type, size) VALUES (?, ?, ?, ?, ?, ?)').run(newLegacyId, projectId, randomUUID(), 'Created by v2.txt', 'text/plain', 3)
  assert.equal(backfillLegacyFiles(db), 1)
  assert.equal(backfillLegacyFiles(db), 0)
  const backfilled = db.prepare('SELECT parent_id, type FROM storage_objects WHERE object_id=?').get(newLegacyId)
  assert.deepEqual(backfilled, { parent_id: null, type: 'file' })
})

test('creates nested folders, enforces normalized duplicate policy and rejects unsafe names', async () => {
  const root = await createFolder(' Projects ')
  const nested = await createFolder('資料', root.objectId)
  assert.equal(nested.parentId, root.objectId)
  for (const value of ['projects', 'Projects']) {
    const { response, data } = await json(`${filesUrl}/objects/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value }) })
    assert.equal(response.status, 409)
    assert.equal(data.error.code, 'NAME_CONFLICT')
  }
  for (const name of ['', '.', '..', 'a/b', 'a\\b', 'CON', 'trailing.', 'bad\u0001name', '  ']) {
    const { response, data } = await json(`${filesUrl}/objects/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    assert.equal(response.status, 400, JSON.stringify({ name, data }))
    assert.equal(data.error.code, 'INVALID_INPUT')
  }
  const composed = await createFolder('café')
  const duplicateUnicode = await json(`${filesUrl}/objects/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'cafe\u0301' }) })
  assert.equal(duplicateUnicode.response.status, 409)
  assert.notEqual(composed.objectId, undefined)
})

test('rename and move preserve identity, update v2 filename, and prevent folder cycles', async () => {
  const source = await createFolder('Source')
  const renamedFolder = await json(`${filesUrl}/objects/${source.objectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Renamed source' }) })
  assert.equal(renamedFolder.data.object.objectId, source.objectId)
  assert.equal(renamedFolder.data.object.name, 'Renamed source')
  const child = await createFolder('Child', source.objectId)
  const leaf = await upload('report.txt', child.objectId, 'report')
  const renamed = await json(`${filesUrl}/objects/${leaf.objectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'renamed.txt' }) })
  assert.equal(renamed.data.object.objectId, leaf.objectId)
  assert.equal(renamed.data.object.name, 'renamed.txt')
  const v2 = await api(`/v2/projects/${projectId}/files`)
  assert.equal((await v2.json()).files.find((file) => file.id === leaf.objectId).original_name, 'renamed.txt')
  const moved = await json(`${filesUrl}/objects/${child.objectId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: null }) })
  assert.equal(moved.data.object.objectId, child.objectId)
  assert.equal(moved.data.object.parentId, null)
  const movedFile = await json(`${filesUrl}/objects/${leaf.objectId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: null }) })
  assert.equal(movedFile.data.object.objectId, leaf.objectId)
  assert.equal(movedFile.data.object.parentId, null)
  const cycle = await json(`${filesUrl}/objects/${source.objectId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: leaf.objectId }) })
  assert.equal(cycle.response.status, 404)
  assert.equal(cycle.data.error.code, 'NOT_FOUND')
  const makeCycle = await json(`${filesUrl}/objects/${child.objectId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: leaf.objectId }) })
  assert.equal(makeCycle.response.status, 404)
})

test('move into a descendant is rejected without modifying the subtree', async () => {
  const top = await createFolder('Tree')
  const middle = await createFolder('Middle', top.objectId)
  const bottom = await createFolder('Bottom', middle.objectId)
  const result = await json(`${filesUrl}/objects/${top.objectId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: bottom.objectId }) })
  assert.equal(result.response.status, 400)
  assert.equal(result.data.error.code, 'INVALID_INPUT')
  assert.equal((await list()).data.items.find((item) => item.objectId === top.objectId).parentId, null)
})

test('copies files and folder trees to new logical IDs and verifies Garage bytes', async () => {
  const source = await createFolder('Copy source')
  const nested = await createFolder('Nested', source.objectId)
  const first = await upload('one.txt', source.objectId, 'one')
  const second = await upload('two.txt', nested.objectId, 'two')
  const destination = await createFolder('Copy destination')
  copyLogs.length = 0
  const result = await json(`${filesUrl}/objects/${source.objectId}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: destination.objectId }) })
  assert.equal(result.response.status, 201, JSON.stringify(result.data))
  const copiedRoot = result.data.object
  assert.notEqual(copiedRoot.objectId, source.objectId)
  const copiedChildren = (await list(copiedRoot.objectId)).data.items
  assert.deepEqual(copiedChildren.map((item) => item.name).sort(), ['Nested', 'one.txt'])
  const copiedFile = copiedChildren.find((item) => item.type === 'file')
  assert.notEqual(copiedFile.objectId, first.objectId)
  const nestedCopy = copiedChildren.find((item) => item.type === 'folder')
  const nestedFiles = (await list(nestedCopy.objectId)).data.items
  assert.equal(nestedFiles[0].name, 'two.txt')
  assert.notEqual(nestedFiles[0].objectId, second.objectId)
  const copiedBytes = await api(`${filesUrl}/objects/${copiedFile.objectId}/download`)
  assert.equal(await copiedBytes.text(), 'one')
  const op = await operation(result.data.operationId)
  assert.equal(op.data.operation.status, 'completed')
  const stages = copyLogs.map((line) => line.match(/ stage=([a-z-]+)/)?.[1]).filter(Boolean)
  let previous = -1
  for (const expected of ['request', 'source-metadata', 'destination-reservation', 'provider-copy', 'provider-read', 'provider-write', 'verify-size', 'verify-checksum', 'metadata-commit']) {
    const next = stages.indexOf(expected, previous + 1)
    assert.ok(next > previous, `missing or out-of-order diagnostic stage ${expected}: ${stages.join(', ')}`)
    previous = next
  }
  assert.ok(copyLogs.some((line) => line === '[storage-copy] operation=copy result=success'))
})

test('Trash hides an entire subtree from list, stat, download and v2; restore reports conflict and supports fallback', async () => {
  const folder = await createFolder('Trash me')
  const nested = await createFolder('Inside', folder.objectId)
  const file = await upload('trash.txt', nested.objectId, 'trash')
  const trashed = await trash(folder.objectId)
  assert.equal(trashed.response.status, 200)
  assert.ok(trashed.data.object.deletedAt)
  assert.equal((await list()).data.items.some((item) => item.objectId === folder.objectId), false)
  assert.equal((await json(`${filesUrl}/objects/${file.objectId}`)).response.status, 404)
  assert.equal((await api(`${filesUrl}/objects/${file.objectId}/download`)).status, 404)
  const v2 = await api(`/v2/projects/${projectId}/files`)
  assert.equal((await v2.json()).files.some((item) => item.id === file.objectId), false)
  const trashList = await json(`${filesUrl}/trash`)
  assert.equal(trashList.data.items.length, 1)
  const conflictFolder = await createFolder('Trash me')
  const conflict = await json(`${filesUrl}/trash/${folder.objectId}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(conflict.response.status, 409)
  assert.equal(conflict.data.error.code, 'NAME_CONFLICT')
  await trash(conflictFolder.objectId)
  const restored = await json(`${filesUrl}/trash/${folder.objectId}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: null }) })
  assert.equal(restored.response.status, 200)
  assert.equal(restored.data.object.objectId, folder.objectId)
  assert.equal((await list(nested.objectId)).data.items.some((item) => item.objectId === file.objectId), true)
})

test('file Trash restore retains logical and physical IDs; moved restore validates fallback parent', async () => {
  const folder = await createFolder('Restore target')
  const file = await upload('restore.txt', folder.objectId, 'recover')
  const objectBefore = db.prepare('SELECT provider_reference FROM storage_objects WHERE object_id=?').get(file.objectId).provider_reference
  await trash(file.objectId)
  const restored = await json(`${filesUrl}/trash/${file.objectId}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(restored.response.status, 200)
  assert.equal(restored.data.object.objectId, file.objectId)
  assert.equal(restored.data.object.parentId, folder.objectId)
  assert.equal(db.prepare('SELECT provider_reference FROM storage_objects WHERE object_id=?').get(file.objectId).provider_reference, objectBefore)
})

test('permanent delete records partial provider failure, retains metadata, and is safely retryable', async () => {
  const folder = await createFolder('Purge tree')
  const first = await upload('first.txt', folder.objectId, 'first')
  const second = await upload('second.txt', folder.objectId, 'second')
  const refs = [first, second].map((item) => db.prepare('SELECT provider_reference FROM storage_objects WHERE object_id=?').get(item.objectId).provider_reference)
  await trash(folder.objectId)
  failDelete.add(refs[1])
  const partial = await json(`${filesUrl}/trash/${folder.objectId}/permanent`, { method: 'DELETE' })
  assert.equal(partial.response.status, 502)
  const partialOp = await operation(partial.data.error.operationId)
  assert.equal(partialOp.data.operation.status, 'partial')
  assert.equal(db.prepare('SELECT count(*) AS count FROM storage_objects WHERE trash_root_id=?').get(folder.objectId).count, 3)
  assert.equal(objects.has(refs[0]), false)
  assert.equal(objects.has(refs[1]), true)
  failDelete.clear()
  const complete = await json(`${filesUrl}/trash/${folder.objectId}/permanent`, { method: 'DELETE' })
  assert.equal(complete.response.status, 200, JSON.stringify(complete.data))
  assert.equal(db.prepare('SELECT count(*) AS count FROM storage_objects WHERE trash_root_id=?').get(folder.objectId).count, 0)
  assert.equal(db.prepare('SELECT count(*) AS count FROM files WHERE id IN (?,?)').get(first.objectId, second.objectId).count, 0)
  assert.equal((await operation(complete.data.operationId)).data.operation.status, 'completed')
})

test('provider failure and SQLite finalize failure leave clean, inspectable operations', async () => {
  const source = await upload('source-failure.txt', null, 'source')
  const sourceRef = db.prepare('SELECT provider_reference FROM storage_objects WHERE object_id=?').get(source.objectId).provider_reference
  failGet.add(sourceRef)
  const copyTarget = await createFolder('Failure copy target')
  copyLogs.length = 0
  const failedCopy = await json(`${filesUrl}/objects/${source.objectId}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: copyTarget.objectId }) })
  assert.equal(failedCopy.response.status, 502)
  assert.ok(copyLogs.some((line) => line === '[storage-copy] operation=copy result=error stage=provider-read errorType=Error providerOperation=GetObject'))
  assert.ok(copyLogs.every((line) => !line.includes('secret source network failure') && !line.includes(sourceRef) && !line.includes(projectId)))
  assert.equal((await operation(failedCopy.data.error.operationId)).data.operation.status, 'failed')
  failGet.clear()
  const filesBeforeCopy = db.prepare('SELECT count(*) AS count FROM files WHERE project_id=?').get(projectId).count
  db.exec("CREATE TRIGGER reject_manager_copy BEFORE INSERT ON storage_objects WHEN NEW.name = 'source-failure.txt' BEGIN SELECT RAISE(ABORT, 'private SQL failure'); END")
  try {
    const copied = await json(`${filesUrl}/objects/${source.objectId}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: copyTarget.objectId }) })
    assert.equal(copied.response.status, 500)
    assert.equal(copied.data.error.code, 'INTERNAL_ERROR')
    assert.equal(db.prepare("SELECT count(*) AS count FROM storage_objects WHERE name = 'source-failure.txt'").get().count, 1)
    assert.equal(db.prepare('SELECT count(*) AS count FROM files WHERE project_id=?').get(projectId).count, filesBeforeCopy)
    assert.equal((await operation(copied.data.error.operationId)).data.operation.status, 'failed')
  } finally { db.exec('DROP TRIGGER reject_manager_copy') }
})

test('pagination is capped and opaque cursor stays scoped; foreign IDs remain 404', async () => {
  for (const name of ['page-a','page-b','page-c']) await createFolder(name)
  const first = await list(null, null, 2)
  assert.equal(first.response.status, 200)
  assert.equal(first.data.items.length, 2)
  assert.ok(first.data.nextCursor)
  const second = await list(null, first.data.nextCursor, 2)
  assert.equal(second.data.items.length, 2)
  assert.equal(second.data.items.some((item) => first.data.items.some((prev) => prev.objectId === item.objectId)), false)
  const invalid = await list(null, 'not+opaque')
  assert.equal(invalid.response.status, 400)
  const foreign = await api(`/v3/projects/${foreignProjectId}/objects`)
  assert.equal(foreign.status, 404)
  const invalidCredential = await app.request(`${filesUrl}/objects`, { headers: { Authorization: 'Bearer invalid' } })
  assert.equal(invalidCredential.status, 401)
  const invalidParent = await list('foreign-parent-id')
  assert.equal(invalidParent.response.status, 404)
  const huge = await list(null, null, 101)
  assert.equal(huge.response.status, 400)
})

test('capability endpoint advertises only implemented File Manager operations', async () => {
  const { response, data } = await json(`${filesUrl}/capabilities`)
  assert.equal(response.status, 200)
  for (const name of ['list','stat','upload','download','createFolder','rename','move','copy','trash','restore','permanentDelete']) assert.equal(data.capabilities[name], true)
  for (const name of ['preview','share','rangeRead','readOnly']) assert.equal(data.capabilities[name], false)
})


test('bounded synchronous operations refuse oversized trees without fake async work', async () => {
  const manager = createFileManager({ db, storage, maxSynchronousObjects: 2 })
  const folder = manager.createFolder({ projectId, appId, name: 'bounded-root' })
  manager.createFolder({ projectId, appId, parentId: folder.objectId, name: 'bounded-child-a' })
  manager.createFolder({ projectId, appId, parentId: folder.objectId, name: 'bounded-child-b' })
  let tooLarge
  try { await manager.copy({ projectId, appId, objectId: folder.objectId }) } catch (error) { tooLarge = error }
  assert.equal(tooLarge.code, 'OPERATION_TOO_LARGE')
  assert.equal(MAX_SYNCHRONOUS_OBJECTS, 100)
  assert.equal(db.prepare("SELECT count(*) AS count FROM storage_objects WHERE project_id=? AND name LIKE 'bounded-%'").get(projectId).count, 3)
  assert.equal((await operation(tooLarge.operationId)).data.operation.status, 'failed')
})

test('partial folder copy records orphan references for later reconciliation', async () => {
  const folder = await createFolder('Partial copy source')
  const first = await upload('alpha.txt', folder.objectId, 'alpha')
  const last = await upload('beta.txt', folder.objectId, 'beta')
  const betaRef = db.prepare('SELECT provider_reference FROM storage_objects WHERE object_id=?').get(last.objectId).provider_reference
  const target = await createFolder('Partial copy target')
  failGet.add(betaRef)
  failAnyDelete = true
  let result
  try {
    result = await json(`${filesUrl}/objects/${folder.objectId}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: target.objectId }) })
  } finally { failGet.clear(); failAnyDelete = false }
  assert.equal(result.response.status, 502)
  const op = await operation(result.data.error.operationId)
  assert.equal(op.data.operation.status, 'partial')
  const row = db.prepare('SELECT details_json FROM storage_operations WHERE operation_id=?').get(result.data.error.operationId)
  const details = JSON.parse(row.details_json)
  assert.ok(details.orphanedProviderReferences.length >= 1)
  assert.equal(db.prepare("SELECT count(*) AS count FROM storage_objects WHERE parent_id=? AND name IN ('alpha.txt','beta.txt')").get(target.objectId).count, 0)
  assert.equal(typeof first.objectId, 'string')
})


test('trashing a parent folds already-trashed descendants into one restorable subtree', async () => {
  const parent = await createFolder('Trash parent')
  const child = await createFolder('Trash child', parent.objectId)
  const file = await upload('already-trash.txt', child.objectId, 'saved')
  await trash(child.objectId)
  assert.equal((await json(`${filesUrl}/trash`)).data.items.some((item) => item.objectId === child.objectId), true)
  await trash(parent.objectId)
  const trashItems = (await json(`${filesUrl}/trash`)).data.items
  assert.equal(trashItems.some((item) => item.objectId === parent.objectId), true)
  assert.equal(trashItems.some((item) => item.objectId === child.objectId), false)
  const restored = await json(`${filesUrl}/trash/${parent.objectId}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(restored.response.status, 200)
  assert.equal((await list(child.objectId)).data.items.some((item) => item.objectId === file.objectId), true)
})

test('uploads reserve sibling names across provider writes and clear expired reservations', async () => {
  const uploaded = await upload('reservation.txt', null, 'reserved')
  assert.equal(db.prepare('SELECT count(*) AS count FROM storage_name_reservations WHERE project_id=?').get(projectId).count, 0)
  const operationRow = db.prepare("SELECT operation_id, status FROM storage_operations WHERE project_id=? AND type='upload' AND source_object_id=?").get(projectId, uploaded.objectId)
  assert.equal(operationRow.status, 'completed')
  const conflict = await json(`${filesUrl}/files`, { method: 'POST', body: (() => { const form = new FormData(); form.append('file', new File(['x'], 'RESERVATION.txt', { type: 'text/plain' })); return form })() })
  assert.equal(conflict.response.status, 409)
  assert.equal(conflict.data.error.code, 'NAME_CONFLICT')
  const expiredId = randomUUID()
  db.prepare("INSERT INTO storage_name_reservations (reservation_id, project_id, parent_id, normalized_name, expires_at) VALUES (?, ?, NULL, ?, datetime('now', '-1 minute'))").run(expiredId, projectId, 'expired-name')
  const recovered = await createFolder('Expired-name')
  assert.equal(typeof recovered.objectId, 'string')
  assert.equal(db.prepare('SELECT 1 FROM storage_name_reservations WHERE reservation_id=?').get(expiredId), undefined)
})
