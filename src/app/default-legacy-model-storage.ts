import { NoLocalModelStorageAdapter } from './local-data-control';
/** Web has no native GGUF store. */
export function createDefaultLegacyModelStorage() {
  return new NoLocalModelStorageAdapter();
}
