import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ActiveLoungeScreen.tsx');
}

/**
 * Issue 13 の受け入れ条件「Provider 切替理由を内容を含まない Status として UI に表示する」の
 * Issue 16 の 5 状態を PassportApp から Prop として受け取り、内容を含まない固定文言へ
 * 変換する配線を固定する。
 */
describe('Active Lounge 画面の Provider 切替 Status 表示', () => {
  it('providerStatusNotice から取得した固定文言だけを表示する', async () => {
    const text = await source();

    expect(text).toContain("from '../app/provider-status-notice'");
    expect(text).toContain('providerStatusNotice(providerStatus, locale)');
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

  it('PassportApp が渡した live Status を固定 null へ置き換えない', async () => {
    const text = await source();

    expect(text).not.toContain('providerSwitchNotice(null');
    expect(text).toContain('readonly providerStatus: ProviderRuntimeStatus');
  });

  it('Provider 結果待機中は開始 Button を disabled にして二重 Tap を UI でも止める', async () => {
    const text = await source();

    expect(text).toContain('readonly providerBusy: boolean');
    expect(text).toContain('disabled={providerBusy}');
  });
});
