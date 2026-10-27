import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { S3Client } from '@aws-sdk/client-s3'
import { createGarageProvider } from '../src/storage/providers/garage.js'

const sourceRef = '6fdcce5b-9111-48b0-9d9e-1f5f9a0a3101'
const targetRef = 'aef84180-6a89-4f21-b5da-79f4528b141c'
const sourceBytes = Buffer.from('small streaming copy fixture\n')
const objects = new Map([[sourceRef, { bytes: sourceBytes, contentType: 'text/plain' }]])
const requests = []
let failNextPut = false

const server = createServer(async (request, response) => {
  const segments = new URL(request.url, 'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const key = segments[1]
  const chunks = []
  if (request.method === 'PUT') {
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    requests.push({ method: 'PUT', key, headers: request.headers, bytes: body })
    if (failNextPut) {
      failNextPut = false
      objects.set(key, { bytes: body.subarray(0, 1), contentType: request.headers['content-type'] })
      const error = Buffer.from('<Error><Code>InternalError</Code><Message>mock failure</Message></Error>')
      response.writeHead(500, { 'Content-Type': 'application/xml', 'Content-Length': error.length }).end(error)
      return
    }
    objects.set(key, { bytes: body, contentType: request.headers['content-type'] })
    response.writeHead(200, { ETag: '"mock-etag"' }).end()
    return
  }

  requests.push({ method: request.method, key, headers: request.headers })
  if (request.method === 'GET') {
    const stored = objects.get(key)
    if (!stored) {
      response.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>')
      return
    }
    response.writeHead(200, {
      'Content-Length': stored.bytes.length,
      'Content-Type': stored.contentType,
      ETag: '"mock-etag"',
    }).end(stored.bytes)
    return
  }
  if (request.method === 'HEAD') {
    const stored = objects.get(key)
    response.writeHead(stored ? 200 : 404, stored ? {
      'Content-Length': stored.bytes.length,
      'Content-Type': stored.contentType,
      ETag: '"mock-etag"',
    } : {}).end()
    return
  }
  if (request.method === 'DELETE') {
    objects.delete(key)
    response.writeHead(204).end()
    return
  }
  response.writeHead(405).end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const clientOptions = {
  endpoint: `http://127.0.0.1:${server.address().port}`,
  region: 'us-east-1',
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: { accessKeyId: 'copy-test', secretAccessKey: 'copy-test' },
}
const s3 = new S3Client(clientOptions)
const s3Copy = new S3Client({ ...clientOptions, requestChecksumCalculation: 'WHEN_REQUIRED' })
const provider = createGarageProvider({ s3, s3Copy, timeoutMs: 3000 })
const input = {
  mount: { provider: 'garage', bucket: 'copy-test-bucket' },
  providerRef: sourceRef,
  targetRef,
  size: sourceBytes.length,
  mimeType: 'text/plain',
}

after(async () => {
  s3.destroy()
  s3Copy.destroy()
  await new Promise((resolve) => server.close(resolve))
})

test('Copy streams a Node Readable with known length through PutObject and verifies bytes', async () => {
  const result = await provider.copy(input)
  const put = requests.find((request) => request.method === 'PUT' && request.key === targetRef)
  assert.equal(result.providerRef, targetRef)
  assert.equal(result.size, sourceBytes.length)
  assert.ok(put)
  assert.equal(put.headers['content-length'], String(sourceBytes.length))
  assert.equal(put.headers['transfer-encoding'], undefined)
  assert.equal(put.headers['content-encoding'], undefined)
  assert.equal(put.headers['x-amz-trailer'], undefined)
  assert.deepEqual(put.bytes, sourceBytes)
  assert.deepEqual(objects.get(targetRef).bytes, sourceBytes)
  assert.deepEqual(requests.filter((request) => ['GET', 'PUT', 'HEAD'].includes(request.method)).map((request) => request.method), ['GET', 'PUT', 'HEAD', 'GET'])
})

test('failed streaming PutObject deletes a partial destination object', async () => {
  const failedTarget = 'f1a71c79-854b-44f1-8f69-2c2def83ec35'
  failNextPut = true
  await assert.rejects(provider.copy({ ...input, targetRef: failedTarget }), { code: 'PROVIDER_UNAVAILABLE' })
  assert.equal(objects.has(failedTarget), false)
  assert.deepEqual(requests.filter((request) => request.key === failedTarget).map((request) => request.method), ['PUT', 'DELETE'])
  assert.deepEqual(objects.get(sourceRef).bytes, sourceBytes)
})
