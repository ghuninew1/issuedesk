import { StorageError } from '../errors.js'

export function createProviderRegistry(garage) {
  const providers = new Map([['garage', garage]])
  return {
    getProvider(name) {
      const provider = providers.get(name)
      if (!provider) throw new StorageError('CAPABILITY_UNAVAILABLE')
      return provider
    },
  }
}
