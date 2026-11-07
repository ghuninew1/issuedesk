import { normalizeError, StorageError } from './errors.js'

export function createStorageManager(registry) {
  const manager = {}
  for (const operation of ['list', 'stat', 'createFolder', 'upload', 'download', 'rename', 'move', 'copy', 'delete', 'restore']) {
    manager[operation] = async (input) => {
      try {
        const provider = registry.getProvider(input?.mount?.provider)
        const capability = operation === 'delete' ? 'permanentDelete' : operation
        if (!provider.getCapabilities()[capability]) throw new StorageError('CAPABILITY_UNAVAILABLE')
        return await provider[operation](input)
      } catch (error) {
        throw normalizeError(error)
      }
    }
  }
  manager.multipart = Object.fromEntries(['create','discover','part','parts','complete','abort','head','delete'].map(operation => [operation, input => {
    const provider = registry.getProvider(input?.mount?.provider)
    if (!provider.getCapabilities().upload || !provider.multipart?.[operation]) throw new StorageError('CAPABILITY_UNAVAILABLE')
    return provider.multipart[operation](input)
  }]))
  manager.getCapabilities = ({ mount }) => registry.getProvider(mount.provider).getCapabilities()
  return manager
}
