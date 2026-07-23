import {
  isQuizQuestionId,
  QUIZ_CATALOG_VERSION,
  type QuizQuestionId,
} from '../domain/quiz-catalog';
import type { QuizProgress } from '../domain/quiz-progress';

/**
 * Issue 110: `src/app/intro-card-storage.ts`（Port + Web/Native 2 adapter + factory の
 * 4 ファイル構成）を踏襲する。クイズには下書き概念（`loadDraft`/`saveDraft`）が不要なため
 * 持たない（設計文書 `docs/design/2026-07-23-cloud-basics-quiz.md` 4 節）。
 * Issue 130（Codex 指摘 blocker）: `inspect`/`remove` を追加し、`IntroCardStoragePort` /
 * `LocalProfileStoragePort` と同じ形にする。`local-data-control.ts` の tombstone
 * 保護つき削除トランザクション（`deleteAll`）へこの Storage を含めるために必須。
 */
export interface QuizProgressStoragePort {
  load(): Promise<QuizProgress>;
  save(progress: QuizProgress): Promise<void>;
  inspect(): Promise<QuizProgressStorageUsage>;
  remove(): Promise<void>;
}

export interface QuizProgressStorageUsage {
  readonly count: 0 | 1;
  readonly bytes: number;
}

export type QuizProgressStorageErrorCode =
  | 'UNAVAILABLE'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'DELETE_FAILED'
  | 'INVALID_DATA';

export class QuizProgressStorageError extends Error {
  readonly code: QuizProgressStorageErrorCode;

  constructor(
    code: QuizProgressStorageErrorCode,
    message: string,
    cause: unknown
  ) {
    super(message, { cause });
    this.name = 'QuizProgressStorageError';
    this.code = code;
  }
}

export function unavailableQuizProgressStorageError(): QuizProgressStorageError {
  return new QuizProgressStorageError(
    'UNAVAILABLE',
    'この環境では端末内 Storage を利用できません。',
    new Error('クイズ進捗の保存媒体がありません。')
  );
}

/**
 * `catalogVersion` は `clue-catalog.ts` の `CATALOG_VERSION` と同じ「バージョン付き
 * 同梱カタログ」の流儀で保存データに含める。現時点では読込時に検証しない
 * （bitIndex は append-only 不変のため、古いバージョンの保存データも
 * `parseStoredQuizProgress` がそのまま安全に読める設計、設計文書 3 節）。将来
 * カタログの互換性が崩れる変更をする場合、この値を手がかりに移行ロジックを
 * 追加できるようにするための記録である。
 */
export function serializeQuizProgress(progress: QuizProgress): string {
  return JSON.stringify({
    catalogVersion: QUIZ_CATALOG_VERSION,
    clearedQuestionIds: [...progress].sort(),
  });
}

interface UnknownQuizProgressRecord {
  readonly clearedQuestionIds?: unknown;
}

/**
 * 保存データの構造（object であること、`clearedQuestionIds` が string 配列であること）だけを
 * 検証する。`catalogVersion` は記録目的のみで読込時の必須項目にはしない（未来の
 * バージョンで形式が増えても、現行カタログが読めない保存データとして拒否しない）。
 * 現在のカタログに存在しない id は throw せず黙って除外する（Fail-soft、設計文書
 * 4 節: ローカル保存はユーザー本人のデータであり、QR の fail-closed とは非対称な設計を
 * 意図的に採る）。
 */
export function parseStoredQuizProgress(raw: string): QuizProgress {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('クイズ進捗の保存データが object ではありません。');
    }
    const record = parsed as UnknownQuizProgressRecord;
    const ids = record.clearedQuestionIds;
    if (
      !Array.isArray(ids) ||
      !ids.every((item): item is string => typeof item === 'string')
    ) {
      throw new Error(
        'クイズ進捗の clearedQuestionIds が文字列配列ではありません。'
      );
    }
    const known = ids.filter((id): id is QuizQuestionId =>
      isQuizQuestionId(id)
    );
    return new Set(known);
  } catch (error: unknown) {
    throw new QuizProgressStorageError(
      'INVALID_DATA',
      '端末内のクイズ進捗は有効な保存データではありません。',
      error
    );
  }
}

export class UnavailableQuizProgressStorageAdapter
  implements QuizProgressStoragePort
{
  constructor(private readonly unavailableCause: unknown) {}

  private rejectUnavailable<T>(): Promise<T> {
    return Promise.reject(
      new QuizProgressStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }

  load(): Promise<QuizProgress> {
    return this.rejectUnavailable();
  }

  save(_progress: QuizProgress): Promise<void> {
    return this.rejectUnavailable();
  }

  inspect(): Promise<QuizProgressStorageUsage> {
    return this.rejectUnavailable();
  }

  remove(): Promise<void> {
    return this.rejectUnavailable();
  }
}
