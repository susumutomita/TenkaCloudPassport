import type { ProviderSwitchReason } from '../domain/provider-fallback';

/**
 * Issue 13: Provider 切替理由を内容を含まない Status として UI に表示する。
 * `ProviderSwitchReason`（内容を持たない閉じた enum）だけを受け取り、Evidence・Chain of
 * Thought・Prompt を一切含まない固定文言を返す（`interaction-status-notice.ts` と同じ、
 * 内容を持たない状態表示専用の mapper）。
 */
export interface ProviderSwitchNotice {
  readonly message: string;
}

const NO_SWITCH_MESSAGE = 'Rules Provider（基準実装）で判定しています。';

const PROVIDER_SWITCH_MESSAGES: Record<ProviderSwitchReason, string> = {
  timeout:
    'Local Agent の応答がなかったため、Rules Provider へ切り替えました。',
  'schema-error':
    'Local Agent の出力を検証できなかったため、Rules Provider へ切り替えました。',
  'load-error':
    'Local Agent を読み込めなかったため、Rules Provider へ切り替えました。',
};

/**
 * `reason` が `null` のとき（切替が発生していない、または Local Agent 未接続の既定状態）は
 * 固定の「基準実装で判定中」文言を返す。
 */
export function providerSwitchNotice(
  reason: ProviderSwitchReason | null
): ProviderSwitchNotice {
  if (!reason) {
    return { message: NO_SWITCH_MESSAGE };
  }
  return { message: PROVIDER_SWITCH_MESSAGES[reason] };
}
