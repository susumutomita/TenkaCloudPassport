import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
import { LocalProfileStorageError } from './local-profile-storage';

export type ProfileNotice =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'restored'; readonly message: string }
  | { readonly kind: 'validation-error'; readonly message: string }
  | { readonly kind: 'save-error'; readonly message: string }
  | { readonly kind: 'storage-unavailable'; readonly message: string }
  | { readonly kind: 'invalid-data'; readonly message: string }
  | { readonly kind: 'read-error'; readonly message: string }
  // Room 段階（waiting / ready）から Passport 編集へ戻る操作で Lounge 由来データを
  // 破棄したときに使う。Active Lounge 以降の破棄は DestroyedLoungeScreen が専任するため、
  // この kind は Room 段階からの離脱経路（`editLocalProfile`）専用にする。
  | { readonly kind: 'lounge-discarded'; readonly message: string };

/**
 * `LocalProfileStorageError.message`（Storage adapter が生成する技術的な診断文）自体は
 * Issue 15 の対象外（Known follow-up、`docs/design/i18n-and-accessibility.md`）で日本語の
 * ままだが、型を持たない例外の既定文言（Owner に見せる唯一の Fallback）はこの Issue で
 * `locale` に対応する。
 */
export function profileNoticeFromStorageError(
  error: unknown,
  operation: 'load' | 'save',
  locale: Locale = DEFAULT_LOCALE
): ProfileNotice {
  if (error instanceof LocalProfileStorageError) {
    if (error.code === 'UNAVAILABLE') {
      return { kind: 'storage-unavailable', message: error.message };
    }
    if (error.code === 'INVALID_DATA') {
      return { kind: 'invalid-data', message: error.message };
    }
    if (operation === 'load') {
      return { kind: 'read-error', message: error.message };
    }
    return { kind: 'save-error', message: error.message };
  }
  const fallback =
    operation === 'load'
      ? MESSAGES[locale].profileNotice.readErrorFallback
      : MESSAGES[locale].profileNotice.saveErrorFallback;
  return {
    kind: operation === 'load' ? 'read-error' : 'save-error',
    message: error instanceof Error ? error.message : fallback,
  };
}
