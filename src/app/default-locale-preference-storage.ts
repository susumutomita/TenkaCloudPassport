import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  ExpoFileSystemLocalePreferenceStorageAdapter,
  type LocalePreferenceStoragePort,
  WebLocalePreferenceStorageAdapter,
} from './locale-preference-storage';

const LOCALE_PREFERENCE_FILE_NAME = 'tenkacloud-passport-locale-preference';

/**
 * `default-local-deletion-journal.ts` と同じ Platform 分岐の Composition Root
 * 向け factory。Profile / Intro Card 本体とは別の端末内キー・ファイルへ保存する
 * （ADR-0034）。
 */
export function createDefaultLocalePreferenceStorage(): LocalePreferenceStoragePort {
  if (Platform.OS === 'web') {
    try {
      return new WebLocalePreferenceStorageAdapter(
        typeof globalThis.localStorage === 'undefined'
          ? null
          : globalThis.localStorage
      );
    } catch {
      return new WebLocalePreferenceStorageAdapter(null);
    }
  }
  try {
    return new ExpoFileSystemLocalePreferenceStorageAdapter(
      new File(Paths.document, LOCALE_PREFERENCE_FILE_NAME)
    );
  } catch {
    return new ExpoFileSystemLocalePreferenceStorageAdapter(null);
  }
}
