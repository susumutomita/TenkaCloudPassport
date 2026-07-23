import {
  EMPTY_QUIZ_PROGRESS,
  type QuizProgress,
} from '../domain/quiz-progress';
import {
  parseStoredQuizProgress,
  QuizProgressStorageError,
  type QuizProgressStoragePort,
  serializeQuizProgress,
  unavailableQuizProgressStorageError,
} from './quiz-progress-storage';
import type { WebKeyValueStorage } from './web-local-profile-storage';

export const QUIZ_PROGRESS_STORAGE_KEY = 'tenkacloud-passport.quiz-progress';

export class WebQuizProgressStorageAdapter implements QuizProgressStoragePort {
  constructor(private readonly storage: WebKeyValueStorage | null) {}

  async load(): Promise<QuizProgress> {
    if (!this.storage) throw unavailableQuizProgressStorageError();
    let raw: string | null;
    try {
      raw = this.storage.getItem(QUIZ_PROGRESS_STORAGE_KEY);
    } catch (error: unknown) {
      throw new QuizProgressStorageError(
        'READ_FAILED',
        '端末内 Storage からクイズ進捗を読み込めませんでした。',
        error
      );
    }
    return raw === null ? EMPTY_QUIZ_PROGRESS : parseStoredQuizProgress(raw);
  }

  async save(progress: QuizProgress): Promise<void> {
    if (!this.storage) throw unavailableQuizProgressStorageError();
    const serialized = serializeQuizProgress(progress);
    try {
      this.storage.setItem(QUIZ_PROGRESS_STORAGE_KEY, serialized);
    } catch (error: unknown) {
      throw new QuizProgressStorageError(
        'WRITE_FAILED',
        '端末内 Storage へクイズ進捗を保存できませんでした。',
        error
      );
    }
  }
}
