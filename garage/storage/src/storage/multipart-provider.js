import { CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, ListMultipartUploadsCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { validateReference } from './validation.js'
import { StorageError } from './errors.js'

// This adapter never exposes provider identifiers through the logical API.
export function createMultipartProvider(s3) {
  async function send(Command, input, extra = {}) {
    input.assertLease?.()
    validateReference(input)
    if (!input.providerRef) throw new StorageError('INVALID_INPUT')
    try {
      return await s3.send(new Command({ Bucket: input.mount.bucket, Key: input.providerRef, ...extra }), { abortSignal: input.signal })
    } catch (error) {
      if (error?.name === 'NoSuchUpload') return { missingUpload: true }
      if (error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return { missingObject: true }
      throw new StorageError('PROVIDER_UNAVAILABLE')
    }
  }
  return {
    async create(input) {
      const result = await send(CreateMultipartUploadCommand, input, { ContentType: input.mimeType, Metadata: { 'upload-session': input.sessionId } })
      if (!result.UploadId) throw new StorageError('PROVIDER_UNAVAILABLE')
      return result.UploadId
    },
    async discover(input) {
      const found = []
      let KeyMarker, UploadIdMarker, pages = 0
      do {
        if (++pages > 10) throw new StorageError('PROVIDER_UNAVAILABLE')
        const page = await send(ListMultipartUploadsCommand, input, { Prefix: input.providerRef, KeyMarker, UploadIdMarker, MaxUploads: 1000 })
        for (const entry of page.Uploads || []) if (entry.Key === input.providerRef && entry.UploadId) found.push(entry.UploadId)
        if (!page.IsTruncated) return found
        if (!page.NextKeyMarker || (page.NextKeyMarker === KeyMarker && page.NextUploadIdMarker === UploadIdMarker)) throw new StorageError('PROVIDER_UNAVAILABLE')
        KeyMarker = page.NextKeyMarker
        UploadIdMarker = page.NextUploadIdMarker
      } while (found.length < 10000)
      throw new StorageError('PROVIDER_UNAVAILABLE')
    },
    async part(input) {
      const result = await send(UploadPartCommand, input, { UploadId: input.uploadId, PartNumber: input.number, Body: input.bytes, ContentLength: input.bytes.length })
      if (typeof result.ETag !== 'string' || !result.ETag) throw new StorageError('TRANSFER_INCOMPLETE')
      return result.ETag
    },
    async parts(input) {
      const parts = []
      let marker = 0
      do {
        const page = await send(ListPartsCommand, input, { UploadId: input.uploadId, PartNumberMarker: marker, MaxParts: 1000 })
        if (page.missingUpload) return null
        for (const p of page.Parts || []) parts.push({ number: p.PartNumber, size: p.Size, etag: p.ETag })
        if (parts.length > 1280) throw new StorageError('PROVIDER_UNAVAILABLE')
        if (!page.IsTruncated) return parts
        if (!Number.isInteger(page.NextPartNumberMarker) || page.NextPartNumberMarker <= marker || parts.length > 10000) throw new StorageError('PROVIDER_UNAVAILABLE')
        marker = page.NextPartNumberMarker
      } while (true)
    },
    async complete(input) {
      const result = await send(CompleteMultipartUploadCommand, input, { UploadId: input.uploadId,
        MultipartUpload: { Parts: input.parts.map(p => ({ PartNumber: p.part_number, ETag: p.etag })) } })
      if (result.missingUpload) throw new StorageError('TRANSFER_INCOMPLETE')
    },
    abort: input => send(AbortMultipartUploadCommand, input, { UploadId: input.uploadId }),
    async head(input) {
      const result = await send(HeadObjectCommand, input)
      return result.missingObject ? null : { size: result.ContentLength, sessionId: result.Metadata?.['upload-session'] }
    },
    delete: input => send(DeleteObjectCommand, input),
  }
}
