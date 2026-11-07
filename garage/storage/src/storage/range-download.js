import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { StorageError, normalizeError } from './errors.js'
import { validateReference } from './validation.js'

// Malformed/unsupported units and multi-range are ignored (full 200).
// Syntactically valid but unsatisfiable single byte ranges return 416.
export function singleRange(value, size) {
  if (!value || value.length > 256) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return null
  const a = match[1] ? BigInt(match[1]) : null
  const b = match[2] ? BigInt(match[2]) : null
  const total = BigInt(size)
  if (a === null) {
    if (b === 0n || total === 0n) return false
    return { start: Number(b >= total ? 0n : total - b), end: size - 1 }
  }
  if (a >= total || (b !== null && b < a)) return false
  return { start: Number(a), end: Number(b === null || b >= total ? total - 1n : b) }
}

export function createHttpDownload(s3, timeoutMs) {
  return async function download(input) {
    validateReference(input)
    if (!input.providerRef) throw new StorageError('INVALID_INPUT')
    const controller = new AbortController()
    let timer, reader, streamController, finished = false
    const cleanup = () => { clearTimeout(timer); input.signal?.removeEventListener('abort', abort) }
    const stop = () => { if (finished) return; finished = true; cleanup(); controller.abort(); return reader?.cancel().catch(() => {}) }
    const fail = () => { if (finished) return; stop(); streamController?.error(new StorageError('TRANSFER_INCOMPLETE')) }
    const abort = () => { controller.abort(); fail() }
    const arm = () => { clearTimeout(timer); timer = setTimeout(abort, timeoutMs) }
    input.signal?.addEventListener('abort', abort, { once: true })
    if (input.signal?.aborted) abort()
    const params = { Bucket: input.mount.bucket, Key: input.providerRef }
    try {
      arm()
      const meta = await s3.send(new HeadObjectCommand(params), { abortSignal: controller.signal })
      if (controller.signal.aborted) throw new StorageError('TRANSFER_INCOMPLETE')
      const size = meta.ContentLength
      if (!Number.isSafeInteger(size) || size < 0 || typeof meta.ETag !== 'string' || !/^"[^"\r\n]+"$/.test(meta.ETag)) throw new StorageError('PROVIDER_UNAVAILABLE')
      // An opaque identity validator, not a checksum. Never disclose bucket/key/S3 ETag.
      const identity = JSON.stringify([input.mount.bucket, input.providerRef, meta.VersionId || null, meta.ETag, size, meta.LastModified?.toISOString() || null])
      const etag = `"${createHash('sha256').update(identity).digest('hex')}"`
      const modified = meta.LastModified instanceof Date && Number.isFinite(meta.LastModified.getTime()) ? meta.LastModified.toUTCString() : null
      // HTTP dates are not strong enough for sub-second replacements; safely fall back.
      const useRange = !input.ifRange || input.ifRange === etag
      const range = input.head || !useRange ? null : singleRange(input.range, size)
      const headers = { 'Accept-Ranges': 'bytes', ETag: etag, ...(modified ? { 'Last-Modified': modified } : {}) }
      if (range === false) { stop(); return { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' }, body: null } }
      const length = range ? range.end - range.start + 1 : size
      headers['Content-Length'] = String(length)
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
      const status = range ? 206 : 200
      if (input.head) { stop(); return { status, headers, body: null } }
      arm()
      const result = await s3.send(new GetObjectCommand({ ...params, IfMatch: meta.ETag,
        ...(meta.VersionId ? { VersionId: meta.VersionId } : {}),
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}) }), { abortSignal: controller.signal })
      if (controller.signal.aborted) { result.Body?.destroy?.(); await result.Body?.cancel?.().catch(() => {}); throw new StorageError('TRANSFER_INCOMPLETE') }
      // Reject a provider which ignores Range or races the HEAD; no bytes released yet.
      if (result.ContentLength !== length || result.ETag !== meta.ETag
        || (range ? result.$metadata?.httpStatusCode !== 206 || result.ContentRange !== headers['Content-Range'] : result.$metadata?.httpStatusCode !== 200 || result.ContentRange)
        || (meta.VersionId && result.VersionId !== meta.VersionId)
        || (meta.LastModified && result.LastModified?.getTime() !== meta.LastModified.getTime())) {
        result.Body?.destroy?.(); await result.Body?.cancel?.().catch(() => {})
        throw new StorageError('TRANSFER_INCOMPLETE')
      }
      if (!result.Body) throw new StorageError('TRANSFER_INCOMPLETE')
      const source = typeof result.Body.getReader === 'function' ? result.Body
        : typeof result.Body.transformToWebStream === 'function' ? result.Body.transformToWebStream() : Readable.toWeb(result.Body)
      reader = source.getReader()
      let received = 0
      arm()
      const body = new ReadableStream({
        start(c) { streamController = c; if (controller.signal.aborted) fail() },
        async pull(c) {
          try {
            arm()
            const { value, done } = await reader.read()
            if (finished) return
            if (done) {
              if (received !== length) return fail()
              finished = true; cleanup(); c.close(); return
            }
            received += value.byteLength
            if (received > length) return fail()
            arm(); c.enqueue(value)
          } catch { fail() }
        },
        cancel() { return stop() },
      })
      return { status, headers, body }
    } catch (error) { stop(); throw normalizeError(error) }
  }
}
