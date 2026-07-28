import type { OnDeviceAiStatus } from './trusted-model-enablement-controller';
import type { LocalModelManagementView } from './use-local-model-management';

/**
 * Issue 180: `ModelAcquisitionSection.tsx`（Settings / 会話エージェント画面が
 * 共有する信頼済み Model 取得 UI）が「今どの状態を描画するか」を決める分岐だけを
 * 切り出した純関数。この repo は React render harness を持たないため、`.tsx`
 * 側では検証できない分岐ロジックをここへ集約し、`bun test` で直接実行する
 * （`conversation-agent-flow-controller.ts` と同じ既存方針）。
 */
export interface ResolveModelAcquisitionViewStateInput {
  readonly onDeviceAiFlow: LocalModelManagementView['onDeviceAiFlow'];
  /**
   * `LocalModelManagementView['onDeviceAiStatus']` は型上 `null` を許すが、
   * 呼び出し側（`ModelAcquisitionSection.tsx`）が `trustedModelSource` の
   * 非 null を確認した後に限って呼ぶため、実際には常に非 null の実値になる
   * （`onDeviceAiStatusFromManifest` は `management` が存在する限り null を
   * 返さない）。この不変条件を `as` アサーションで型に押し付けず、
   * `null` も受け付けたうえで `'not-acquired'` 相当として扱う（`/simplify`
   * 指摘: 到達しない分岐を隠さず、実行テストで固定する）。
   */
  readonly onDeviceAiStatus: OnDeviceAiStatus | null;
}

export type ModelAcquisitionViewState =
  | { readonly kind: 'consent-pending' }
  | { readonly kind: 'downloading' }
  | { readonly kind: 'finalizing' }
  | { readonly kind: 'verifying' }
  | { readonly kind: 'not-acquired' }
  | { readonly kind: 'acquired'; readonly active: boolean };

/**
 * `onDeviceAiFlow`（同意待ち・ダウンロード中・仕上げ処理中・検証中）を
 * `onDeviceAiStatus`（未取得・取得済み）より優先する。進行中の一連の操作は
 * Manifest 側の状態がまだ追いついていない一時的な区間のため、Flow が
 * `idle` に戻るまでは Flow 側の表示を優先する既存 `OnDeviceAiSection` の
 * 分岐順をそのまま踏襲する。
 */
export function resolveModelAcquisitionViewState(
  input: ResolveModelAcquisitionViewStateInput
): ModelAcquisitionViewState {
  if (input.onDeviceAiFlow === 'consent-pending') {
    return { kind: 'consent-pending' };
  }
  if (input.onDeviceAiFlow === 'downloading') {
    return { kind: 'downloading' };
  }
  if (input.onDeviceAiFlow === 'finalizing') {
    return { kind: 'finalizing' };
  }
  if (input.onDeviceAiFlow === 'verifying') {
    return { kind: 'verifying' };
  }
  if (input.onDeviceAiStatus === 'active') {
    return { kind: 'acquired', active: true };
  }
  if (input.onDeviceAiStatus === 'imported-not-active') {
    return { kind: 'acquired', active: false };
  }
  return { kind: 'not-acquired' };
}
