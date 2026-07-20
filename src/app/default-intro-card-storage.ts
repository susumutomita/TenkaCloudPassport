import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { ExpoFileSystemIntroCardStorageAdapter } from './expo-file-system-intro-card-storage';
import {
  type IntroCardStoragePort,
  UnavailableIntroCardStorageAdapter,
} from './intro-card-storage';
import { WebIntroCardStorageAdapter } from './web-intro-card-storage';

const INTRO_CARD_FILE_NAME = 'tenkacloud-passport-intro-card.json';

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
      new File(Paths.document, INTRO_CARD_FILE_NAME)
    );
  } catch (error: unknown) {
    return new UnavailableIntroCardStorageAdapter(error);
  }
}
