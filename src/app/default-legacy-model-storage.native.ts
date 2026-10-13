import { Directory, File, Paths } from 'expo-file-system';
import {
  createLegacyModelStorage,
  type LegacyModelFile,
} from './legacy-model-storage';
/** Never creates a directory or touches files until explicit diagnostics/deletion. */
export function createDefaultLegacyModelStorage() {
  const directory = new Directory(Paths.document, 'local-models');
  return createLegacyModelStorage({
    list() {
      if (!directory.exists) return [];
      return directory.list().map(
        (entry): LegacyModelFile => ({
          name: entry.name,
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
