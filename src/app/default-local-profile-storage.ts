import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { ExpoFileSystemLocalProfileStorageAdapter } from './expo-file-system-local-profile-storage';
import {
  type LocalProfileStoragePort,
  UnavailableLocalProfileStorageAdapter,
} from './local-profile-storage';
import { WebLocalProfileStorageAdapter } from './web-local-profile-storage';

const LOCAL_PROFILE_FILE_NAME = 'tenkacloud-passport-local-profile.json';

export function createDefaultLocalProfileStorage(): LocalProfileStoragePort {
  if (Platform.OS === 'web') {
    try {
      return new WebLocalProfileStorageAdapter(
        typeof globalThis.localStorage === 'undefined'
          ? null
          : globalThis.localStorage
      );
    } catch (error: unknown) {
      return new UnavailableLocalProfileStorageAdapter(error);
    }
  }
  try {
    return new ExpoFileSystemLocalProfileStorageAdapter(
      new File(Paths.document, LOCAL_PROFILE_FILE_NAME)
    );
  } catch (error: unknown) {
    return new UnavailableLocalProfileStorageAdapter(error);
  }
}
