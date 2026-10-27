import { Buffer } from 'node:buffer'
import { StorageError } from './errors.js'

const hasControlCharacter = (value) => [...value].some((character) => {
  const code = character.codePointAt(0)
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
})
const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

export function normalizeObjectName(input) {
  if (typeof input !== 'string' || input !== input.toWellFormed()) throw new StorageError('INVALID_INPUT')
  const name = input.normalize('NFC').trim()
  if (!name || name === '.' || name === '..' || hasControlCharacter(name) || /[\\/]/u.test(name) || /[. ]$/u.test(name) || reserved.test(name) || Buffer.byteLength(name, 'utf8') > 255) {
    throw new StorageError('INVALID_INPUT')
  }
  return { name, normalizedName: name.toLowerCase() }
}

export function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function decodeCursor(value) {
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new StorageError('INVALID_INPUT')
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed.name !== 'string' || typeof parsed.id !== 'string' || Object.keys(parsed).sort().join(',') !== 'id,name') throw new Error()
    return parsed
  } catch {
    throw new StorageError('INVALID_INPUT')
  }
}

export function legacyNameKey(name, objectId) {
  try { return normalizeObjectName(name).normalizedName }
  catch { return `legacy:${objectId}` }
}
