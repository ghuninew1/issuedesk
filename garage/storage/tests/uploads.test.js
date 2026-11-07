import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createApp } from '../src/app.js'
import { createStorageManager } from '../src/storage/manager.js'
import { createProviderRegistry } from '../src/storage/providers/index.js'
import { createGarageProvider } from '../src/storage/providers/garage.js'
import { createUploads, UPLOAD_LIMITS } from '../src/storage/uploads.js'
import { applyMigrations } from '../src/storage/migrations.js'

process.env.DATABASE_PATH = ':memory:'
const { db } = await import('../src/db.js')
await applyMigrations(db)
after(() => db.close())
const secret = 'test-only-secret', projectId = 'multipart-project', appId = 'multipart-app'
db.prepare('INSERT INTO apps(id,name) VALUES (?,?)').run(appId, 'test')
db.prepare('INSERT INTO app_credentials(id,app_id,secret_hash) VALUES (?,?,?)').run('credential', appId, createHash('sha256').update(secret).digest('hex'))
db.prepare('INSERT INTO projects(id,app_id,name,bucket) VALUES (?,?,?,?)').run(projectId, appId, 'multipart', 'test-only-bucket')
const mpus = new Map(), objects = new Map(), calls = []
let failPart = false, loseComplete = false, failAbort = false, loseCreate = false, stealPartLease = false, stealCompleteLease = false
const s3 = { async send(command, { abortSignal }) {
  assert.ok(abortSignal)
  const i = command.input, type = command.constructor.name
  calls.push(type)
  const mpu = mpus.get(i.UploadId)
  const missing = () => { throw Object.assign(new Error('private provider details'), { name: 'NoSuchUpload' }) }
  switch (type) {
    case 'CreateMultipartUploadCommand': {
      const id = randomUUID()
      mpus.set(id, { key: i.Key, metadata: i.Metadata, parts: new Map() })
      if (loseCreate) { loseCreate = false; throw new Error('lost create response') }
      return { UploadId: id }
    }
    case 'ListMultipartUploadsCommand': return { Uploads: [...mpus].filter(([,u]) => u.key.startsWith(i.Prefix)).map(([id,u]) => ({ Key:u.key, UploadId:id })) }
    case 'UploadPartCommand': {
      if (!mpu) return missing()
      if (failPart) { failPart = false; throw new Error('network interruption') }
      const bytes = Buffer.from(i.Body), etag = createHash('sha256').update(bytes).digest('hex')
      mpu.parts.set(i.PartNumber, { bytes, etag })
      if (stealPartLease) { stealPartLease = false; db.prepare('UPDATE upload_sessions SET lock_token = ? WHERE provider_reference = ?').run('replacement-worker',i.Key) }
      return { ETag: etag }
    }
    case 'ListPartsCommand': {
      if (!mpu) return missing()
      return { Parts: [...mpu.parts].map(([n,p]) => ({ PartNumber:n, Size:p.bytes.length, ETag:p.etag })) }
    }
    case 'CompleteMultipartUploadCommand': {
      if (!mpu) return missing()
      const bytes = Buffer.concat(i.MultipartUpload.Parts.map(p => mpu.parts.get(p.PartNumber).bytes))
      objects.set(i.Key, { bytes, metadata:mpu.metadata })
      mpus.delete(i.UploadId)
      if (loseComplete) { loseComplete = false; throw new Error('response lost after complete') }
      if (stealCompleteLease) { stealCompleteLease = false; db.prepare('UPDATE upload_sessions SET lock_token = ? WHERE provider_reference = ?').run('replacement-worker',i.Key) }
      return { ETag: 'final-etag' }
    }
    case 'HeadObjectCommand': {
      const o = objects.get(i.Key)
      if (!o) throw Object.assign(new Error('not found'), { name:'NotFound' })
      return { ContentLength:o.bytes.length, Metadata:o.metadata }
    }
    case 'AbortMultipartUploadCommand': if (failAbort) throw new Error('unavailable'); mpus.delete(i.UploadId); return {}
    case 'DeleteObjectCommand': objects.delete(i.Key); return {}
    default: throw new Error(type)
  }
} }
const storage = createStorageManager(createProviderRegistry(createGarageProvider({ s3 })))
const app = createApp({ db, storage, bucket:'test-only-bucket', apiToken:'test-only-legacy', maxFileSize:25*1024**2, resumableUploads:true })
const base = `/v3/projects/${projectId}/uploads`
const request = (path, init = {}) => app.request(path, { ...init, headers:{ Authorization:`Bearer ${secret}`, ...init.headers } })
const json = body => ({ 'Content-Type':'application/json', ...body })
const digest = bytes => createHash('sha256').update(bytes).digest('base64')
async function create(size = 3, key = randomUUID(), extra = {}) {
  return request(base, { method:'POST', headers:json({ 'Idempotency-Key':key }), body:JSON.stringify({ name:`${key}.bin`, sizeBytes:size, ...extra }) })
}
async function part(id, n, bytes, hash = digest(bytes)) {
  return request(`${base}/${id}/parts/${n}`, { method:'PUT', headers:{ 'Content-Type':'application/octet-stream', 'X-Part-SHA256':hash }, body:bytes })
}
const action = (id, name, version = 1) => request(`${base}/${id}/${name}`, { method:'POST', headers:json(), body:JSON.stringify({ version }) })

test('real multipart commands, exact geometry, discovery, retries and duplicate completion preserve one logical file', async () => {
  const first = Buffer.alloc(UPLOAD_LIMITS.partSizeBytes, 7), last = Buffer.from('end')
  const created = await create(first.length + last.length)
  assert.equal(created.status, 201)
  const s = await created.json(), id = s.uploadSessionId
  assert.equal((await part(id, 1, first)).status, 200)
  failPart = true
  assert.equal((await part(id, 2, last)).status, 503)
  const status = await (await request(`${base}/${id}`)).json()
  assert.equal(status.acknowledgedBytes, first.length)
  assert.equal(status.parts.length, 1)
  assert.equal((await part(id, 2, last)).status, 200)
  const before = calls.filter(c => c === 'UploadPartCommand').length
  assert.equal((await part(id, 2, last)).status, 200)
  assert.equal(calls.filter(c => c === 'UploadPartCommand').length, before)
  const completed = await action(id, 'complete')
  assert.equal(completed.status, 200, await completed.clone().text())
  const receipt = await completed.json()
  assert.equal(receipt.state, 'completed')
  const repeat = await (await action(id, 'complete')).json()
  assert.equal(repeat.object.objectId, receipt.object.objectId)
  assert.equal(calls.filter(c => c === 'CompleteMultipartUploadCommand').length, 1)
  const row = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(id)
  assert.deepEqual(objects.get(row.provider_reference).bytes, Buffer.concat([first,last]))
  assert.equal(db.prepare('SELECT COUNT(*) n FROM storage_objects WHERE object_id = ?').get(receipt.object.objectId).n, 1)
  assert.doesNotMatch(JSON.stringify(receipt), /provider_reference|uploadId|bucket|ETag|test-only/)
})

test('create and completion acknowledgements lost after provider commit are reconciled after manager restart', async () => {
  const key = randomUUID()
  loseCreate = true
  assert.equal((await create(3, key)).status, 503)
  const resumed = await (await create(3, key)).json()
  const id = resumed.uploadSessionId
  assert.equal((await part(id, 1, Buffer.from('abc'))).status, 200)
  loseComplete = true
  assert.equal((await action(id, 'complete')).status, 503)
  const restarted = createUploads({ db, provider:storage.multipart })
  const recovered = await restarted.action({ id, projectId, appId, action:'complete', version:1 })
  assert.equal(recovered.state, 'completed')
})

test('validation, create idempotency and immutable part digests fail closed', async () => {
  const key = randomUUID(), s = await (await create(3, key)).json(), id = s.uploadSessionId
  assert.equal((await (await create(3, key)).json()).uploadSessionId, id)
  assert.equal((await create(4, key)).status, 409)
  for (const size of [0,-1,NaN,10*1024**3+1]) assert.ok([400,413].includes((await create(size)).status))
  assert.equal((await part(id, 1, Buffer.from('abc'), digest(Buffer.from('bad')))).status, 422)
  assert.equal((await part(id, 1, Buffer.from('ab'))).status, 502)
  assert.equal((await part(id, 1, Buffer.from('abcd'))).status, 413)
  assert.equal((await part(id, 2, Buffer.from('abc'))).status, 400)
  assert.equal((await action(id, 'complete')).status, 502)
  assert.equal((await part(id, 1, Buffer.from('abc'))).status, 200)
  assert.equal((await part(id, 1, Buffer.from('xyz'))).status, 409)
  assert.equal((await action(id,'pause')).status,200)
  assert.equal((await part(id,1,Buffer.from('abc'))).status,409)
  const paused = await (await request(`${base}/${id}`)).json()
  assert.equal((await action(id,'resume',paused.version)).status,200)
})

test('cancel, expiration, failed cleanup retry, and cancel-before-create never publish files', async () => {
  const s = await (await create()).json(), id = s.uploadSessionId
  await part(id,1,Buffer.from('abc'))
  failAbort = true
  assert.equal((await request(`${base}/${id}`,{method:'DELETE'})).status,503)
  assert.equal(db.prepare('SELECT state FROM upload_sessions WHERE id = ?').get(id).state,'cancelling')
  failAbort = false
  assert.equal((await request(`${base}/${id}`,{method:'DELETE'})).status,200)
  assert.equal((await request(`${base}/${id}`,{method:'DELETE'})).status,200)
  assert.equal((await action(id,'complete')).status,409)
  const key = randomUUID()
  assert.equal((await request(`${base}/by-key/${key}`,{method:'DELETE'})).status,200)
  assert.equal((await create(3,key)).status,409)
  const expired = await (await create()).json()
  db.prepare('UPDATE upload_sessions SET expires_at = ? WHERE id = ?').run(Date.now()-1,expired.uploadSessionId)
  assert.equal((await part(expired.uploadSessionId,1,Buffer.from('abc'))).status,410)
  const cleanup = createUploads({db,provider:storage.multipart})
  assert.ok((await cleanup.sweep()).cleaned>=1)
  assert.equal(db.prepare('SELECT state FROM upload_sessions WHERE id = ?').get(expired.uploadSessionId).state,'expired')
})

test('unauthenticated/foreign project/session requests have no provider side effects', async () => {
  const s = await (await create()).json(), before = calls.length
  assert.equal((await request(`${base}/${s.uploadSessionId}`,{headers:{Authorization:'Bearer wrong'}})).status,401)
  assert.equal((await request(`/v3/projects/foreign/uploads/${s.uploadSessionId}`)).status,404)
  assert.equal((await request(`${base}/${randomUUID()}`)).status,404)
  assert.equal(calls.length,before)
})

test('finalization SQL failure preserves a durable completing receipt for recovery', async () => {
  const s = await (await create()).json(), id = s.uploadSessionId
  await part(id,1,Buffer.from('abc'))
  db.exec("CREATE TRIGGER fail_final BEFORE INSERT ON files BEGIN SELECT RAISE(ABORT,'test failure'); END")
  try { assert.equal((await action(id,'complete')).status,503) } finally { db.exec('DROP TRIGGER fail_final') }
  assert.equal(db.prepare('SELECT state FROM upload_sessions WHERE id = ?').get(id).state,'completing')
  assert.equal((await action(id,'complete')).status,200)
})

test('service-wide part buffer admission, lease fencing, and remote receipt reconciliation are bounded', async () => {
  const s=await (await create()).json(),id=s.uploadSessionId
  db.prepare('UPDATE upload_sessions SET lock_token=?, lock_until=? WHERE id=?').run('other-process',Date.now()+1000,id)
  assert.equal((await part(id,1,Buffer.from('abc'))).status,409)
  db.prepare('UPDATE upload_sessions SET lock_until=0 WHERE id=?').run(id)
  for(let i=0;i<4;i++)db.prepare('INSERT INTO upload_part_leases VALUES (?,?)').run(`lease-${i}`,Date.now()+1000)
  try{assert.equal((await part(id,1,Buffer.from('abc'))).status,429)}finally{db.prepare('DELETE FROM upload_part_leases').run()}
  assert.equal((await part(id,1,Buffer.from('abc'))).status,200)
  const row=db.prepare('SELECT * FROM upload_sessions WHERE id=?').get(id)
  mpus.get(row.provider_upload_id).parts.clear()
  assert.equal((await (await request(`${base}/${id}`)).json()).acknowledgedBytes,0)
  assert.equal((await action(id,'complete')).status,502)
  assert.equal((await part(id,1,Buffer.from('abc'))).status,200)
})

test('pagination beyond 1000 provider parts is discovered without leaking internal receipts', async () => {
  const {createMultipartProvider}=await import('../src/storage/multipart-provider.js')
  const markers=[]
  const adapter=createMultipartProvider({async send(command){
    markers.push(command.input.PartNumberMarker)
    return command.input.PartNumberMarker===0
      ? {Parts:Array.from({length:1000},(_,i)=>({PartNumber:i+1,Size:8*1024**2,ETag:`internal-${i}`})),IsTruncated:true,NextPartNumberMarker:1000}
      : {Parts:Array.from({length:280},(_,i)=>({PartNumber:i+1001,Size:8*1024**2,ETag:`internal-${i+1000}`}))}
  }})
  const found=await adapter.parts({mount:{provider:'garage',bucket:'test'},providerRef:randomUUID(),uploadId:'private',signal:AbortSignal.timeout(1000)})
  assert.equal(found.length,1280)
  assert.deepEqual(markers,[0,1000])
})

test('expired completing object is never published; disabled-project cleanup uses the original mapping', async () => {
  const s=await (await create()).json(),id=s.uploadSessionId
  await part(id,1,Buffer.from('abc'))
  loseComplete=true
  assert.equal((await action(id,'complete')).status,503)
  db.prepare('UPDATE upload_sessions SET expires_at=? WHERE id=?').run(Date.now()-1,id)
  db.prepare("UPDATE projects SET status='disabled' WHERE id=?").run(projectId)
  try{
    const cleanup=createUploads({db,provider:storage.multipart})
    assert.ok((await cleanup.sweep()).cleaned>=1)
    const row=db.prepare('SELECT * FROM upload_sessions WHERE id=?').get(id)
    assert.equal(row.state,'expired')
    assert.equal(objects.has(row.provider_reference),false)
    assert.equal(db.prepare('SELECT 1 FROM storage_objects WHERE object_id=?').get(row.object_id),undefined)
  }finally{db.prepare("UPDATE projects SET status='active' WHERE id=?").run(projectId)}
})


test('a stale lease holder cannot acknowledge parts or publish a completed provider object', async () => {
  const s = await (await create()).json(), id = s.uploadSessionId
  stealPartLease = true
  assert.equal((await part(id,1,Buffer.from('abc'))).status,409)
  assert.equal(db.prepare('SELECT etag FROM upload_parts WHERE session_id = ?').get(id).etag,null)
  db.prepare('UPDATE upload_sessions SET lock_until=0 WHERE id=?').run(id)
  assert.equal((await part(id,1,Buffer.from('abc'))).status,200)
  stealCompleteLease = true
  assert.equal((await action(id,'complete')).status,409)
  const row=db.prepare('SELECT * FROM upload_sessions WHERE id=?').get(id)
  assert.equal(row.state,'completing')
  assert.equal(db.prepare('SELECT 1 FROM storage_objects WHERE object_id=?').get(row.object_id),undefined)
  db.prepare('UPDATE upload_sessions SET lock_until=0 WHERE id=?').run(id)
  assert.equal((await action(id,'complete')).status,200)
})
