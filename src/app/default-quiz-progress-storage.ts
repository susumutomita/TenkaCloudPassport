import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { ExpoFileSystemQuizProgressStorageAdapter } from './expo-file-system-quiz-progress-storage';
import {
  type QuizProgressStoragePort,
  UnavailableQuizProgressStorageAdapter,
} from './quiz-progress-storage';
import { WebQuizProgressStorageAdapter } from './web-quiz-progress-storage';

const QUIZ_PROGRESS_FILE_NAME = 'tenkacloud-passport-quiz-progress.json';

export function createDefaultQuizProgressStorage(): QuizProgressStoragePort {
  if (Platform.OS === 'web') {
    try {
      return new WebQuizProgressStorageAdapter(
        typeof globalThis.localStorage === 'undefined'
          ? null
          : globalThis.localStorage
      );
    } catch (error: unknown) {
      return new UnavailableQuizProgressStorageAdapter(error);
    }
  }
  try {
    return new ExpoFileSystemQuizProgressStorageAdapter(
      new File(Paths.document, QUIZ_PROGRESS_FILE_NAME)
    );
  } catch (error: unknown) {
    return new UnavailableQuizProgressStorageAdapter(error);
  }
}
