import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'OutcomeScreen.tsx');
}

/**
 * Issue 12 の受け入れ条件「UI は Score ではなく理由と Opener を表示する」の配線を固定する。
 * `OutcomeScreen` は Bridge の `message`（確認済みの理由 + 最初の一言を 1 文へまとめた
 * もの、`src/domain/bridge.ts` / `src/domain/bridge-selection.ts` が組み立てる）だけを
 * 表示し、数値の人物 Score・Confidence・順位を直接埋め込まない。
 */
describe('Outcome 画面は Bridge の理由だけを表示し Score を表示しない', () => {
  it('lounge.outcome.bridge.message を表示する', async () => {
    const text = await source();

    expect(text).toContain('lounge.outcome.bridge.message');
  });

  it('数値の Score・Confidence・順位を示す語彙を直接埋め込まない', async () => {
    const text = await source();

    for (const forbidden of [
      'score',
      'Score',
      'confidence',
      'Confidence',
      'ranking',
      'Ranking',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
