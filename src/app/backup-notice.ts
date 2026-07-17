import type { BackupShareOutcome } from './backup-share-port';
import { readableError } from './readable-error';

export type BackupNotice =
  | { readonly kind: 'idle' }
  | { readonly kind: 'share-succeeded'; readonly message: string }
  | { readonly kind: 'share-dismissed'; readonly message: string }
  | { readonly kind: 'share-saved-to-file'; readonly message: string }
  | { readonly kind: 'share-failed'; readonly message: string }
  | { readonly kind: 'import-committed'; readonly message: string }
  | { readonly kind: 'import-commit-failed'; readonly message: string };

const NOTICE_ERROR_KINDS: ReadonlySet<BackupNotice['kind']> = new Set([
  'share-failed',
  'import-commit-failed',
]);

export const BACKUP_NOTICE_IDLE: BackupNotice = { kind: 'idle' };

/** `BackupExportScreen` / `BackupImportScreen` のどちらも、この判定で通知バナーを警告色にする。 */
export function backupNoticeIsError(notice: BackupNotice): boolean {
  return NOTICE_ERROR_KINDS.has(notice.kind);
}

/** Share Sheet（または Web fallback）が返した結果を、Owner 向け通知へ変換する。 */
export function backupNoticeFromShareOutcome(
  outcome: BackupShareOutcome
): BackupNotice {
  if (outcome.kind === 'shared') {
    return { kind: 'share-succeeded', message: '共有しました。' };
  }
  if (outcome.kind === 'dismissed') {
    return {
      kind: 'share-dismissed',
      message: 'Share Sheet を閉じました。共有は行われていません。',
    };
  }
  return {
    kind: 'share-saved-to-file',
    message: `ファイルとして保存しました（${outcome.destination}）。`,
  };
}

export function backupNoticeFromShareFailure(error: unknown): BackupNotice {
  return {
    kind: 'share-failed',
    message: readableError(error, 'Share Sheet を開けませんでした。'),
  };
}

export function backupNoticeFromImportCommitSuccess(): BackupNotice {
  return {
    kind: 'import-committed',
    message: 'Import した内容を端末内へ保存しました。',
  };
}

export function backupNoticeFromImportCommitFailure(
  error: unknown
): BackupNotice {
  return {
    kind: 'import-commit-failed',
    message: readableError(
      error,
      'Import の Commit に失敗したため、既存の Profile を保ちました。'
    ),
  };
}
