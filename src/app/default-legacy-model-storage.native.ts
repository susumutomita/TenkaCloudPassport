import { Directory, File, Paths } from 'expo-file-system';
import {
  createLegacyModelStorage,
  LEGACY_DOWNLOAD_CACHE_NAME,
  type LegacyModelFile,
} from './legacy-model-storage';
/** Never creates a directory or touches files until explicit diagnostics/deletion. */
export function createDefaultLegacyModelStorage() {
  const directory = new Directory(Paths.document, 'local-models');
  const legacyDownload = new File(Paths.cache, LEGACY_DOWNLOAD_CACHE_NAME);
  return createLegacyModelStorage({
    list() {
      const entries = directory.exists ? directory.list() : [];
      if (legacyDownload.exists) entries.push(legacyDownload);
      return entries.map(
        (entry): LegacyModelFile => ({
          name: entry.name,
          isLegacyDownload: entry === legacyDownload,
          size() {
            if (!(entry instanceof File))
              throw new Error('旧モデルの保存領域に不正な項目があります。');
            const size = entry.info().size;
            if (typeof size !== 'number')
              throw new Error('旧モデルの容量を確認できません。');
            return size;
          },
          remove() {
            if (!(entry instanceof File))
              throw new Error('旧モデルの保存領域に不正な項目があります。');
            if (entry.exists) entry.delete();
          },
        })
      );
    },
  });
}
