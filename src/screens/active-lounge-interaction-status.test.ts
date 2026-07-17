import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ActiveLoungeScreen.tsx');
}

/**
 * Issue 10 の受け入れ条件「UI には『探しています』『確認しています』等の状態だけを
 * 表示し、内部推論を表示しない」の配線を固定する。ActiveLoungeScreen は
 * `src/app/interaction-status-notice.ts` の純粋な文言だけを表示し、Chain of
 * Thought・Prompt・Evidence の語彙を直接埋め込まない。
 */
describe('Active Lounge 画面の Pet Interaction 状態表示', () => {
  it('interactionStatusNotice から取得した固定文言だけを表示する', async () => {
    const text = await source();

    expect(text).toContain("from '../app/interaction-status-notice'");
    expect(text).toContain("interactionStatusNotice('discovering', locale)");
  });

  it('内部推論・Prompt・Evidence の語彙を直接埋め込まない', async () => {
    const text = await source();

    for (const forbidden of ['Chain of Thought', 'candidateClue', 'Prompt']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('固定文言を live な Pet Interaction の状態であるかのように名乗らない', async () => {
    const text = await source();

    expect(text).not.toContain('現在の状態');
  });
});
