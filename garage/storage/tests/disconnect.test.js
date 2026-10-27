import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { request } from 'node:http'
import { serve } from '@hono/node-server'
import { createGarageProvider } from '../src/storage/providers/garage.js'

test('real Hono Node response disconnect cancels the Garage stream', { timeout: 3000 }, async () => {
  let upstreamSignal
  let destroyed
  let timer
  const cancelled = new Promise((resolve) => { destroyed = resolve })
  let sent = false
  const source = new Readable({
    read() { if (!sent) { sent = true; this.push(Buffer.from('x')) } },
    destroy(error, callback) { destroyed(); callback(error) },
  })
  const provider = createGarageProvider({ timeoutMs: 2000, s3: { async send(command, { abortSignal }) {
    upstreamSignal = abortSignal
    return { Body: source, ContentLength: 10 }
  } } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async (req) => {
    const result = await provider.download({ mount: { provider: 'garage', bucket: 'test' }, providerRef: '12345678-1234-1234-1234-123456789012', signal: req.signal })
    return new Response(result.body, { headers: { 'Content-Length': '10' } })
  } })
  let client
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    await new Promise((resolve, reject) => {
      client = request(`http://127.0.0.1:${server.address().port}`, (response) => {
        response.once('data', () => { response.destroy(); resolve() })
        response.on('error', () => {})
      })
      client.on('error', reject)
      client.end()
    })
    await Promise.race([cancelled, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('upstream was not cancelled promptly')), 1000) })])
    assert.equal(upstreamSignal.aborted, true)
    assert.equal(source.destroyed, true)
  } finally {
    clearTimeout(timer)
    client?.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})
