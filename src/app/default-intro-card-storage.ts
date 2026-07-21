import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { ExpoFileSystemIntroCardStorageAdapter } from './expo-file-system-intro-card-storage';
import {
  type IntroCardStoragePort,
  UnavailableIntroCardStorageAdapter,
} from './intro-card-storage';
import { WebIntroCardStorageAdapter } from './web-intro-card-storage';

const INTRO_CARD_FILE_NAME = 'tenkacloud-passport-intro-card.json';
// Issue 93: 下書き（編集中の生入力）は確定カードとは別ファイルへ保存する。
const INTRO_CARD_DRAFT_FILE_NAME = 'tenkacloud-passport-intro-card-draft.json';

export function createDefaultIntroCardStorage(): IntroCardStoragePort {
  if (Platform.OS === 'web') {
    try {
      return new WebIntroCardStorageAdapter(
        typeof globalThis.localStorage === 'undefined'
          ? null
          : globalThis.localStorage
      );
    } catch (error: unknown) {
      return new UnavailableIntroCardStorageAdapter(error);
    }
  }
  try {
    return new ExpoFileSystemIntroCardStorageAdapter(
      new File(Paths.document, INTRO_CARD_FILE_NAME),
      new File(Paths.document, INTRO_CARD_DRAFT_FILE_NAME)
    );
  } catch (error: unknown) {
    return new UnavailableIntroCardStorageAdapter(error);
  }
}
