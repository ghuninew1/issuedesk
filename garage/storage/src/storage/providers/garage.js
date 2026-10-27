import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { GARAGE_CAPABILITIES } from '../capabilities.js'
import { normalizeError, StorageError } from '../errors.js'
import { validateReference } from '../validation.js'

export function createGarageProvider({ s3, timeoutMs = 60000 }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new StorageError('INVALID_INPUT')

  async function request(Command, input, params, streaming = false) {
    validateReference(input)
    if (Command !== ListObjectsV2Command && !input.providerRef) throw new StorageError('INVALID_INPUT')
    const controller = new AbortController()
    const abort = () => controller.abort()
    const cleanup = () => {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', abort)
    }
    const timer = setTimeout(abort, timeoutMs)
    input.signal?.addEventListener('abort', abort, { once: true })
    if (input.signal?.aborted) abort()
    try {
      const result = await s3.send(new Command(params), { abortSignal: controller.signal })
      if (!streaming || !result.Body) {
        cleanup()
        return streaming ? { body: null } : result
      }
      const source = typeof result.Body.getReader === 'function'
        ? result.Body
        : typeof result.Body.transformToWebStream === 'function'
          ? result.Body.transformToWebStream() : Readable.toWeb(result.Body)
      const reader = source.getReader()
      let finished = false
      let transferred = 0
      let streamController
      const finish = () => {
        if (finished) return
        finished = true
        cleanup()
        controller.signal.removeEventListener('abort', onAbort)
      }
      const fail = () => {
        if (finished) return
        finish()
        streamController.error(new StorageError('TRANSFER_INCOMPLETE'))
        void reader.cancel().catch(() => {})
      }
      const onAbort = () => fail()
      const body = new ReadableStream({
        start(c) { streamController = c },
        async pull(c) {
          try {
            const { value, done } = await reader.read()
            if (finished) return
            if (done) {
              if (Number.isSafeInteger(result.ContentLength) && transferred !== result.ContentLength) return fail()
              finish()
              c.close()
            } else {
              transferred += value.byteLength
              if (Number.isSafeInteger(result.ContentLength) && transferred > result.ContentLength) return fail()
              c.enqueue(value)
            }
          } catch {
            fail()
          }
        },
        async cancel() {
          finish()
          controller.abort()
          await reader.cancel().catch(() => {})
        },
      })
      controller.signal.addEventListener('abort', onAbort, { once: true })
      if (controller.signal.aborted) fail()
      return { body, size: result.ContentLength, mimeType: result.ContentType }
    } catch (error) {
      cleanup()
      controller.abort()
      if (typeof input.onCopyFailure === 'function') {
        const operation = Command === GetObjectCommand ? 'GetObject'
          : Command === PutObjectCommand ? 'PutObject'
            : Command === HeadObjectCommand ? 'HeadObject'
              : Command === DeleteObjectCommand ? 'DeleteObject' : 'Other'
        input.onCopyFailure(error, operation)
      }
      throw normalizeError(error)
    }
  }

  async function copy(input) {
    input.onCopyStage?.('provider-read', 'GetObject')
    const download = await request(GetObjectCommand, input, {
      Bucket: input.mount.bucket, Key: input.providerRef,
    }, true)
    if (!download.body) throw new StorageError('NOT_FOUND')
    const sourceHash = createHash('sha256')
    async function* hashWhileReading(body) {
      for await (const chunk of body) {
        const bytes = Buffer.from(chunk)
        sourceHash.update(bytes)
        yield bytes
      }
    }
    try {
      input.onCopyStage?.('provider-write', 'PutObject')
      await request(PutObjectCommand, input, {
        Bucket: input.mount.bucket, Key: input.targetRef, Body: hashWhileReading(download.body),
        ContentLength: input.size, ContentType: input.mimeType || download.mimeType || 'application/octet-stream',
      })
      input.onCopyStage?.('verify-size', 'HeadObject')
      const verified = await request(HeadObjectCommand, input, { Bucket: input.mount.bucket, Key: input.targetRef })
      if (!Number.isSafeInteger(input.size) || verified.ContentLength !== input.size) throw new StorageError('TRANSFER_INCOMPLETE')
      input.onCopyStage?.('verify-checksum', 'GetObject')
      const copied = await request(GetObjectCommand, { ...input, providerRef: input.targetRef }, {
        Bucket: input.mount.bucket, Key: input.targetRef,
      }, true)
      if (!copied.body) throw new StorageError('TRANSFER_INCOMPLETE')
      const targetHash = createHash('sha256')
      for await (const chunk of copied.body) targetHash.update(Buffer.from(chunk))
      if (sourceHash.digest('hex') !== targetHash.digest('hex')) throw new StorageError('TRANSFER_INCOMPLETE')
      return { providerRef: input.targetRef, size: verified.ContentLength, mimeType: verified.ContentType || input.mimeType }
    } catch (error) {
      try {
        await request(DeleteObjectCommand, { ...input, onCopyStage: undefined, onCopyFailure: undefined }, {
          Bucket: input.mount.bucket, Key: input.targetRef,
        })
      }
      catch { error.cleanupFailed = true }
      throw error
    }
  }

  return {
    getCapabilities: () => ({ ...GARAGE_CAPABILITIES, copy: true }),
    async list(input) {
      const result = await request(ListObjectsV2Command, input, { Bucket: input.mount.bucket, MaxKeys: 100 })
      return {
        items: (result.Contents || []).map((item) => ({ providerRef: item.Key, size: item.Size, modifiedAt: item.LastModified })),
        isTruncated: result.IsTruncated || false, nextCursor: result.NextContinuationToken || null,
      }
    },
    async stat(input) {
      const result = await request(HeadObjectCommand, input, { Bucket: input.mount.bucket, Key: input.providerRef })
      return { size: result.ContentLength, mimeType: result.ContentType, modifiedAt: result.LastModified }
    },
    async upload(input) {
      if (!Number.isSafeInteger(input.size) || input.size <= 0 || !input.body) throw new StorageError('INVALID_INPUT')
      await request(PutObjectCommand, input, {
        Bucket: input.mount.bucket, Key: input.providerRef, Body: input.body,
        ContentLength: input.size, ContentType: input.mimeType || 'application/octet-stream',
      })
      return { size: input.size, mimeType: input.mimeType || 'application/octet-stream' }
    },
    download(input) {
      if (input.range) throw new StorageError('CAPABILITY_UNAVAILABLE')
      return request(GetObjectCommand, input, { Bucket: input.mount.bucket, Key: input.providerRef }, true)
    },
    copy,
    async delete(input) {
      await request(DeleteObjectCommand, input, { Bucket: input.mount.bucket, Key: input.providerRef })
    },
  }
}
