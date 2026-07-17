import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ActiveLoungeScreen.tsx');
}

/**
 * Issue 13 の受け入れ条件「Provider 切替理由を内容を含まない Status として UI に表示する」の
 * 配線を固定する。Active Lounge が実際に保持する Provider Runner はまだ無い
 * （Issue 17 の Known follow-up）ため、`providerSwitchNotice(null)` を渡す固定表示であり、
 * `interaction-status-notice.ts` の Issue 10 配線と同じ先行パターンを踏襲する。
 */
describe('Active Lounge 画面の Provider 切替 Status 表示', () => {
  it('providerSwitchNotice から取得した固定文言だけを表示する', async () => {
    const text = await source();

    expect(text).toContain("from '../app/provider-switch-notice'");
    expect(text).toContain('providerSwitchNotice(null)');
  });

  it('内部推論・Prompt・Evidence・内部エラー型名の語彙を直接埋め込まない', async () => {
    const text = await source();

    for (const forbidden of [
      'Chain of Thought',
      'candidateClue',
      'Prompt',
      'AgentModelProviderError',
      'evidenceId',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('固定文言を live な Provider Runner の状態であるかのように名乗らない', async () => {
    const text = await source();

    expect(text).not.toContain('現在の Provider');
  });
});
