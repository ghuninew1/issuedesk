import { StorageError } from './errors.js'

export function validateReference({ mount, providerRef }) {
  if (!mount || mount.provider !== 'garage' || typeof mount.bucket !== 'string' || !mount.bucket) {
    throw new StorageError('INVALID_INPUT')
  }
  if (providerRef !== undefined && (typeof providerRef !== 'string' || providerRef.length !== 36 || !/^[0-9a-f-]{36}$/i.test(providerRef))) {
    throw new StorageError('INVALID_INPUT')
  }
}

// Preserve stored filenames and existing UTF-8 attachment behavior; sanitize only headers.
export function attachmentName(name) {
  return encodeURIComponent(String(name).toWellFormed()).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function safeContentType(type) {
  return typeof type === 'string' && !/[^\x20-\x7e]/.test(type) && /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;[\x20-\x7e]*)?$/.test(type)
    ? type : 'application/octet-stream'
}
