import { IntroCardError, type IntroCardField } from '../domain/intro-card';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
import { IntroCardStorageError } from './intro-card-storage';

export type IntroCardNotice =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'saved'; readonly message: string }
  | {
      readonly kind: 'validation-error';
      readonly message: string;
      // Issue 92: 保存失敗時にどの入力欄が原因かを画面側で特定し、focus と
      // 直下のエラー表示に使う。`exactOptionalPropertyTypes` 下で明示
      // `undefined` を代入できるよう、`IntroCardError.field` と同じく
      // `?:` を使わず union で宣言する。
      readonly field: IntroCardField | undefined;
    }
  | { readonly kind: 'save-error'; readonly message: string }
  | { readonly kind: 'delete-error'; readonly message: string }
  | { readonly kind: 'storage-unavailable'; readonly message: string }
  | { readonly kind: 'invalid-data'; readonly message: string }
  | { readonly kind: 'read-error'; readonly message: string };

export type IntroCardNoticeOperation = 'load' | 'save' | 'delete';

function operationErrorKind(
  operation: IntroCardNoticeOperation
): 'read-error' | 'save-error' | 'delete-error' {
  if (operation === 'load') return 'read-error';
  if (operation === 'save') return 'save-error';
  return 'delete-error';
}

function operationFallback(
  operation: IntroCardNoticeOperation,
  locale: Locale
): string {
  const t = MESSAGES[locale].introCard;
  if (operation === 'load') return t.readErrorFallback;
  if (operation === 'save') return t.saveErrorFallback;
  return t.deleteErrorFallback;
}

/**
 * `src/app/profile-notice.ts` と同じ方針（`docs/design/i18n-and-accessibility.md` の
 * Known follow-up）で、型付き Error 自身の message（Storage adapter や domain の
 * 検証結果）は日本語のまま Owner へ見せる。型を持たない例外の既定文言だけが
 * `locale` に対応する。`operation` は呼び出し側の意図（読込・保存・削除）を示し、
 * title と本文の意味が食い違わないようにする（保存失敗の文言を削除失敗に流用しない）。
 */
export function introCardNoticeFromError(
  error: unknown,
  operation: IntroCardNoticeOperation,
  locale: Locale = DEFAULT_LOCALE
): IntroCardNotice {
  if (error instanceof IntroCardError) {
    return {
      kind: 'validation-error',
      message: error.message,
      field: error.field,
    };
  }
  if (error instanceof IntroCardStorageError) {
    if (error.code === 'UNAVAILABLE') {
      return { kind: 'storage-unavailable', message: error.message };
    }
    if (error.code === 'INVALID_DATA') {
      return { kind: 'invalid-data', message: error.message };
    }
    return { kind: operationErrorKind(operation), message: error.message };
  }
  const fallback = operationFallback(operation, locale);
  return {
    kind: operationErrorKind(operation),
    message: error instanceof Error ? error.message : fallback,
  };
}
