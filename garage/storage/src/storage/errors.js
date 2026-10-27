export const ERROR_CODES = Object.freeze([
  'INVALID_INPUT', 'NOT_FOUND', 'CAPABILITY_UNAVAILABLE', 'NAME_CONFLICT',
  'UPLOAD_TOO_LARGE', 'PROVIDER_UNAVAILABLE', 'TRANSFER_INCOMPLETE', 'OPERATION_TOO_LARGE', 'INTERNAL_ERROR',
])

export class StorageError extends Error {
  constructor(code) {
    super(code)
    this.name = 'StorageError'
    this.code = ERROR_CODES.includes(code) ? code : 'INTERNAL_ERROR'
  }
}

export function normalizeError(error) {
  if (error instanceof StorageError) return error
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return new StorageError('NAME_CONFLICT')
  if (error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
    return new StorageError('NOT_FOUND')
  }
  return new StorageError('PROVIDER_UNAVAILABLE')
}
