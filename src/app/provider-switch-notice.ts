import type { ProviderSwitchReason } from '../domain/provider-fallback';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';

/**
 * Issue 13: Provider 切替理由を内容を含まない Status として UI に表示する。
 * `ProviderSwitchReason`（内容を持たない閉じた enum）だけを受け取り、Evidence・Chain of
 * Thought・Prompt を一切含まない固定文言を返す（`interaction-status-notice.ts` と同じ、
 * 内容を持たない状態表示専用の mapper）。
 */
export interface ProviderSwitchNotice {
  readonly message: string;
}

/**
 * `reason` が `null` のとき（切替が発生していない、または Local Agent 未接続の既定状態）は
 * 固定の「基準実装で判定中」文言を返す。
 */
export function providerSwitchNotice(
  reason: ProviderSwitchReason | null,
  locale: Locale = DEFAULT_LOCALE
): ProviderSwitchNotice {
  const messages = MESSAGES[locale].providerSwitchNotice;
  if (!reason) {
    return { message: messages.noSwitch };
  }
  return { message: messages[reason] };
}
