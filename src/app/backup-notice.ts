import type { BackupShareOutcome } from './backup-share-port';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
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
  outcome: BackupShareOutcome,
  locale: Locale = DEFAULT_LOCALE
): BackupNotice {
  const messages = MESSAGES[locale].backupNotice;
  if (outcome.kind === 'shared') {
    return { kind: 'share-succeeded', message: messages.shareSucceeded };
  }
  if (outcome.kind === 'dismissed') {
    return {
      kind: 'share-dismissed',
      message: messages.shareDismissed,
    };
  }
  return {
    kind: 'share-saved-to-file',
    message: messages.shareSavedToFile(outcome.destination),
  };
}

export function backupNoticeFromShareFailure(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE
): BackupNotice {
  return {
    kind: 'share-failed',
    message: readableError(
      error,
      MESSAGES[locale].backupNotice.shareFailedFallback
    ),
  };
}

export function backupNoticeFromImportCommitSuccess(
  locale: Locale = DEFAULT_LOCALE
): BackupNotice {
  return {
    kind: 'import-committed',
    message: MESSAGES[locale].backupNotice.importCommittedSucceeded,
  };
}

export function backupNoticeFromImportCommitFailure(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE
): BackupNotice {
  return {
    kind: 'import-commit-failed',
    message: readableError(
      error,
      MESSAGES[locale].backupNotice.importCommitFailedFallback
    ),
  };
}
