import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';

/**
 * Owner Question を提示する前に必ず示す、共有範囲・削除契機・Passport への非保存を
 * 明示する定型文。質問文より先に表示することで、Owner が回答する前に境界を確認できる
 * ようにする（`docs/design/owner-question-consent-flow.md` を正本とする）。
 * `expiry-notice.ts` / `interaction-status-notice.ts` と同じ、内容を持たない
 * 状態表示専用の mapper である。
 */
export interface OwnerQuestionDisclosure {
  readonly sharedWithMessage: string;
  readonly deletedWhenMessage: string;
  readonly notSavedToPassportMessage: string;
}

export function ownerQuestionDisclosure(
  locale: Locale = DEFAULT_LOCALE
): OwnerQuestionDisclosure {
  return MESSAGES[locale].ownerQuestionDisclosure;
}
