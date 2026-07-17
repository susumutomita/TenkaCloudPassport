import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'OutcomeScreen.tsx');
}

/**
 * Issue 15 の受け入れ条件「異言語 Bridge は原文と端末内生成の補助文を区別する」の配線を
 * 固定する。`src/domain/bridge.ts` の `sourceLabels`（Clue Label そのもの、翻訳しない原文）
 * と `message`（`language` ごとに端末内で今回生成した補助文）を、`OutcomeScreen` が
 * 別々の Text として提示していることをソーステキストで検査する。正確な JA/EN 文言の
 * ピン留めは `messages.test.ts` が担う。
 */
describe('Outcome 画面は Bridge の原文と端末内生成の補助文を区別して表示する', () => {
  it('bridge.sourceLabels を message とは別の Text として表示する', async () => {
    const text = await source();

    expect(text).toContain('lounge.outcome.bridge.sourceLabels');
    expect(text).toContain('lounge.outcome.bridge.message');
  });

  it('原文（sourceLabels）は Bridge が表示中（mask されていない）ときだけ表示する', async () => {
    const text = await source();
    const declarationStart = text.indexOf('const sourceLabels =');
    const declarationEnd = text.indexOf(';', declarationStart);
    const declaration = text.slice(declarationStart, declarationEnd);

    expect(declaration).toContain('bridgeIsVisible');
    expect(declaration).toContain('lounge.outcome.bridge.sourceLabels');
    expect(declaration).toContain('[]');
  });

  it('原文のキャプション・値・生成物であることの注記の順で表示する', async () => {
    const text = await source();

    expectInOrder(text, [
      't.sourceLabelCaption',
      'sourceLabels.join(',
      't.generatedNoteCaption',
    ]);
  });
});
