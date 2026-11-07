import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHttpDownload } from '../src/storage/range-download.js'
const input = { mount: { provider: 'garage', bucket: 'private-bucket' }, providerRef: '12345678-1234-1234-1234-123456789012' }
const meta = { ContentLength: 10, ETag: '"opaque-s3-tag"', LastModified: new Date('2026-01-01') }
function fixture({ get, head = meta, timeout = 200 } = {}) {
  const calls = []
  const s3 = { async send(command, options) {
    calls.push({ command, options })
    if (command.constructor.name === 'HeadObjectCommand') return head
    assert.equal(command.input.IfMatch, head.ETag)
    if (get) return get(command, options)
    const range = command.input.Range && /^bytes=(\d+)-(\d+)$/.exec(command.input.Range)
    const bytes = new TextEncoder().encode('0123456789'.slice(range ? Number(range[1]) : 0, range ? Number(range[2]) + 1 : 10))
    return { ...meta, ContentLength: bytes.length, $metadata: { httpStatusCode: range ? 206 : 200 },
      ...(range ? { ContentRange: `bytes ${range[1]}-${range[2]}/10` } : {}),
      Body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } }) }
  } }
  return { run: createHttpDownload(s3, timeout), calls }
}
test('full GET and HEAD use authoritative metadata, no GET for HEAD', async () => {
  const f = fixture()
  const head = await f.run({ ...input, head: true })
  assert.equal(head.headers['Content-Length'], '10'); assert.equal(f.calls.length,1)
  assert.equal(await new Response((await f.run(input)).body).text(), '0123456789')
  assert.equal(f.calls[2].options.abortSignal.aborted,false)
})
test('object mutation between HEAD and GET fails before exposing bytes', async () => {
  let cancelled = false
  const f = fixture({ get: () => ({ ...meta, ETag: '"changed"', $metadata: { httpStatusCode: 200 }, Body: new ReadableStream({ cancel() { cancelled = true } }) }) })
  await assert.rejects(f.run(input), { code: 'TRANSFER_INCOMPLETE' }); assert.ok(cancelled)
  const changed = fixture({ get: () => { throw Object.assign(new Error('private details'), { $metadata: { httpStatusCode: 412 } }) } })
  await assert.rejects(changed.run(input), { code: 'PROVIDER_UNAVAILABLE' })
})
test('ignored range, wrong geometry and bad lengths are rejected', async () => {
  for (const overrides of [{ $metadata:{ httpStatusCode:200 } }, { ContentRange:'bytes 2-4/10' }, { ContentLength:4 }]) {
    const f = fixture({ get: () => ({ ...meta, ContentLength:3, ContentRange:'bytes 1-3/10', $metadata:{ httpStatusCode:206 }, Body:new ReadableStream({start(c){c.close()}}), ...overrides }) })
    await assert.rejects(f.run({ ...input, range:'bytes=1-3' }), { code:'TRANSFER_INCOMPLETE' })
  }
})
test('truncated and excessive streams error rather than reporting success', async () => {
  for (const length of [3,11]) {
    const f = fixture({ get: () => ({ ...meta, $metadata:{httpStatusCode:200}, Body:new ReadableStream({start(c){c.enqueue(new Uint8Array(length));c.close()}}) }) })
    await assert.rejects(new Response((await f.run(input)).body).arrayBuffer(), { code:'TRANSFER_INCOMPLETE' })
    assert.equal(f.calls[1].options.abortSignal.aborted,true)
  }
})
test('client stream cancel and request abort cancel S3 transport and body', async () => {
  for (const external of [false,true]) {
    let cancelled = false
    const f = fixture({ get: () => ({ ...meta, $metadata:{httpStatusCode:200}, Body:new ReadableStream({ cancel(){cancelled=true} }) }) })
    const caller = new AbortController()
    const result = await f.run({ ...input, signal:caller.signal })
    if (external) { caller.abort(); await assert.rejects(new Response(result.body).text(), {code:'TRANSFER_INCOMPLETE'}) }
    else await result.body.cancel()
    assert.ok(cancelled); assert.equal(f.calls[1].options.abortSignal.aborted,true)
  }
})
test('idle timeout releases a stalled stream; active stream can exceed total deadline', async () => {
  const stalled = fixture({ timeout:20, get: () => ({ ...meta, $metadata:{httpStatusCode:200}, Body:new ReadableStream() }) })
  await assert.rejects(new Response((await stalled.run(input)).body).text(), {code:'TRANSFER_INCOMPLETE'})
  const active = fixture({ timeout:50, get: () => ({ ...meta, $metadata:{httpStatusCode:200}, Body:new ReadableStream({async pull(c){await new Promise(r=>setTimeout(r,15));c.enqueue(new Uint8Array(1))}}) }) })
  const result = await active.run(input)
  const reader = result.body.getReader()
  for(let i=0;i<10;i++) assert.equal((await reader.read()).value.length,1)
  await reader.cancel()
})

test('HEAD/GET connection timeout and already-aborted requests fail closed', async () => {
  for (const stalledCommand of ['HeadObjectCommand','GetObjectCommand']) {
    let signal
    const s3 = { send(command,options) {
      signal=options.abortSignal
      if(command.constructor.name !== stalledCommand) return Promise.resolve(meta)
      return new Promise((resolve,reject)=>{
        const abort=()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))
        if(signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true})
      })
    } }
    await assert.rejects(createHttpDownload(s3,20)(input),{code:'PROVIDER_UNAVAILABLE'})
    assert.equal(signal.aborted,true)
  }
  const caller=new AbortController();caller.abort()
  await assert.rejects(fixture().run({...input,signal:caller.signal}),{code:'TRANSFER_INCOMPLETE'})
})
test('empty objects, absent validators, changed timestamp and version ID', async () => {
  const empty=fixture({head:{...meta,ContentLength:0}})
  assert.equal((await empty.run({...input,range:'bytes=0-'})).status,416)
  assert.equal((await empty.run({...input,head:true})).headers['Content-Length'],'0')
  await assert.rejects(fixture({head:{ContentLength:10}}).run(input),{code:'PROVIDER_UNAVAILABLE'})
  const changed=fixture({get:()=>({...meta,LastModified:new Date('2026-02-01'),$metadata:{httpStatusCode:200},Body:new ReadableStream({start(c){c.close()}})})})
  await assert.rejects(changed.run(input),{code:'TRANSFER_INCOMPLETE'})
  const version=fixture({head:{...meta,VersionId:'snapshot-1'},get:command=>{
    assert.equal(command.input.VersionId,'snapshot-1')
    return {...meta,VersionId:'snapshot-2',$metadata:{httpStatusCode:200},Body:new ReadableStream({start(c){c.close()}})}
  }})
  await assert.rejects(version.run(input),{code:'TRANSFER_INCOMPLETE'})
})
