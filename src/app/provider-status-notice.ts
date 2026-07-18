import type { ProviderRuntimeStatus } from './agent-provider-session';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';

/**
 * Issue 16: Provider の 5 状態を内容を含まない Status として UI に表示する。
 * Passport、Answer、Evidence、Prompt、Model Output、Error 本文を一切受け取らない。
 */
export interface ProviderStatusNotice {
  readonly message: string;
}

/**
 * 閉じた Union の Status だけを、Locale ごとの固定文言へ変換する。
 */
export function providerStatusNotice(
  status: ProviderRuntimeStatus,
  locale: Locale = DEFAULT_LOCALE
): ProviderStatusNotice {
  const messages = MESSAGES[locale].providerStatusNotice;
  return { message: messages[status] };
}
