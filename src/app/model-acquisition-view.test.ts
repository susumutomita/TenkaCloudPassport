import { describe, expect, it } from 'bun:test';
import { resolveModelAcquisitionViewState } from './model-acquisition-view';

/**
 * Issue 180: `ModelAcquisitionSection.tsx`（Settings / 会話エージェント画面が
 * 共有する信頼済み Model 取得 UI）が「今どの状態を描画するか」を決める分岐だけを
 * 切り出した純関数。この repo は React render harness を持たないため、この
 * 決定ロジックだけは実行可能な単体テストで担保し、`.tsx` 側は分岐結果を
 * そのまま描画するだけに留める（`conversation-agent-flow-controller.ts` と
 * 同じ「レンダリング不能な分岐を純関数へ切り出す」既存方針）。
 */
describe('resolveModelAcquisitionViewState（Issue 180: 取得 UI の状態分岐）', () => {
  it('onDeviceAiFlow が consent-pending のとき、onDeviceAiStatus に関わらず consent-pending を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'consent-pending',
        onDeviceAiStatus: 'not-acquired',
      })
    ).toEqual({ kind: 'consent-pending' });
  });

  it('onDeviceAiFlow が downloading のとき downloading を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'downloading',
        onDeviceAiStatus: 'not-acquired',
      })
    ).toEqual({ kind: 'downloading' });
  });

  it('onDeviceAiFlow が finalizing のとき finalizing を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'finalizing',
        onDeviceAiStatus: 'not-acquired',
      })
    ).toEqual({ kind: 'finalizing' });
  });

  it('onDeviceAiFlow が verifying のとき verifying を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'verifying',
        onDeviceAiStatus: 'not-acquired',
      })
    ).toEqual({ kind: 'verifying' });
  });

  it('flow が idle かつ status が not-acquired のとき not-acquired を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'idle',
        onDeviceAiStatus: 'not-acquired',
      })
    ).toEqual({ kind: 'not-acquired' });
  });

  it('flow が idle かつ status が active のとき acquired（active: true）を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'idle',
        onDeviceAiStatus: 'active',
      })
    ).toEqual({ kind: 'acquired', active: true });
  });

  it('flow が idle かつ status が imported-not-active のとき acquired（active: false）を返す', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'idle',
        onDeviceAiStatus: 'imported-not-active',
      })
    ).toEqual({ kind: 'acquired', active: false });
  });

  it('flow が idle かつ status が null（型上は許すが実際には到達しない）のとき not-acquired 相当として扱う', () => {
    expect(
      resolveModelAcquisitionViewState({
        onDeviceAiFlow: 'idle',
        onDeviceAiStatus: null,
      })
    ).toEqual({ kind: 'not-acquired' });
  });
});
