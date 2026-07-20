import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'typography.ts');
}

/**
 * Issue 72 C: mono 大文字キャプションの書式（letterSpacing が 0.6〜1.6 でドリフト）を
 * `monoLabel` へ集約する。色は含めない（利用側が白地 mutedLight / ダーク面 white を持つ）。
 * `typography.ts` は `react-native` の `Platform` を import しており、この repo の
 * `bun test` は Flow 構文を含む `react-native` の実体を直接 import できないため
 * （他の Screen / Component 契約と同じ制約）、他の契約テストと同じくソーステキスト
 * 検査で固定する。
 */
describe('monoLabel（mono 大文字キャプションの共有書式）', () => {
  it('mono フォント・fontSize 11・letterSpacing 0.8・uppercase の 1 組を公開する', async () => {
    const text = await source();

    expect(text).toContain('export const monoLabel');
    expect(text).toContain('fontFamily: monoFontFamily');
    expect(text).toContain('fontSize: 11');
    expect(text).toContain("fontWeight: '500'");
    expect(text).toContain('letterSpacing: 0.8');
    expect(text).toContain("textTransform: 'uppercase'");
  });

  it('色を含まない（利用側が白地・ダーク面それぞれの色を上書きする）', async () => {
    const text = await source();
    const declarationStart = text.indexOf('export const monoLabel');
    const declaration = text.slice(declarationStart);

    expect(declaration).not.toContain('color:');
    expect(declaration).not.toContain('opacity:');
  });
});
