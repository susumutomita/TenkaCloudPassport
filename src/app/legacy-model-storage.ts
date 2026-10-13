import type { LocalModelStoragePort } from './local-data-control';

export interface LegacyModelFile {
  readonly name: string;
  readonly isLegacyDownload?: boolean;
  size(): number;
  remove(): void;
}
export interface LegacyModelDirectory {
  list(): readonly LegacyModelFile[];
}
const PAYLOAD = /^([a-f0-9]{64})(?:\.deleting)?\.gguf$/;
export const LEGACY_DOWNLOAD_CACHE_NAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
const METADATA = new Set([
  'manifest.v1.json',
  '.manifest.v1.tmp',
  '.incoming.gguf',
]);
export function isLegacyModelFile(name: string): boolean {
  return PAYLOAD.test(name) || METADATA.has(name);
}
/** Inspect actual files without parsing legacy manifests, loading models, reconciling or writing. */
export function createLegacyModelStorage(
  directory: LegacyModelDirectory
): LocalModelStoragePort {
  return {
    async inspect() {
      const files = directory
        .list()
        .filter((file) => isManagedLegacyFile(file));
      if (files.length === 0) return null;
      let sizeBytes = 0;
      let count = 0;
      let digest = '0'.repeat(64);
      for (const file of files) {
        const size = verifiedSize(file);
        sizeBytes += size;
        if (!Number.isSafeInteger(sizeBytes))
          throw new Error('旧モデルの合計容量を確認できません。');
        const payload = PAYLOAD.exec(file.name);
        if (
          payload ||
          file.name === '.incoming.gguf' ||
          file.name === LEGACY_DOWNLOAD_CACHE_NAME
        )
          count += 1;
        if (payload?.[1]) digest = payload[1];
      }
      return { architecture: 'unknown', sizeBytes, count, digest };
    },
    async remove() {
      for (const file of directory.list()) {
        if (isManagedLegacyFile(file)) file.remove();
      }
      if (directory.list().some((file) => isManagedLegacyFile(file)))
        throw new Error(
          '旧モデルのファイルが残っています。削除を再試行してください。'
        );
    },
  };
}

function verifiedSize(file: LegacyModelFile): number {
  const size = file.size();
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error('旧モデルの容量を確認できません。');
  return size;
}

function isManagedLegacyFile(file: LegacyModelFile): boolean {
  return (
    isLegacyModelFile(file.name) ||
    (file.name === LEGACY_DOWNLOAD_CACHE_NAME && file.isLegacyDownload === true)
  );
}
