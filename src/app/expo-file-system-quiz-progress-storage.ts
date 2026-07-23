import {
  EMPTY_QUIZ_PROGRESS,
  type QuizProgress,
} from '../domain/quiz-progress';
import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import {
  parseStoredQuizProgress,
  QuizProgressStorageError,
  type QuizProgressStoragePort,
  serializeQuizProgress,
  unavailableQuizProgressStorageError,
} from './quiz-progress-storage';

export class ExpoFileSystemQuizProgressStorageAdapter
  implements QuizProgressStoragePort
{
  constructor(private readonly document: ProfileDocument | null) {}

  async load(): Promise<QuizProgress> {
    if (!this.document) throw unavailableQuizProgressStorageError();
    let exists: boolean;
    try {
      exists = this.document.exists;
    } catch (error: unknown) {
      throw new QuizProgressStorageError(
        'READ_FAILED',
        '端末内ファイルの状態を確認できませんでした。',
        error
      );
    }
    if (!exists) return EMPTY_QUIZ_PROGRESS;
    let raw: string;
    try {
      raw = await this.document.text();
    } catch (error: unknown) {
      throw new QuizProgressStorageError(
        'READ_FAILED',
        '端末内ファイルからクイズ進捗を読み込めませんでした。',
        error
      );
    }
    return parseStoredQuizProgress(raw);
  }

  async save(progress: QuizProgress): Promise<void> {
    if (!this.document) throw unavailableQuizProgressStorageError();
    const serialized = serializeQuizProgress(progress);
    try {
      await this.document.write(serialized);
    } catch (error: unknown) {
      throw new QuizProgressStorageError(
        'WRITE_FAILED',
        '端末内ファイルへクイズ進捗を保存できませんでした。',
        error
      );
    }
  }
}
