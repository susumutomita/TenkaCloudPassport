import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'StatusDot.tsx');
}

/**
 * Issue 72 A: 4 画面にコピペされていた状態ドット（7px / 8px にドリフト）を
 * 共有原子へ集約する。`brand-mark.test.ts` と同じくレンダリング基盤を持たないため、
 * tone→色写像・寸法・文言非保持をソーステキスト検査で固定する。
 */
describe('StatusDot（状態ドット共有原子）のソース契約', () => {
  it('tone は 5 種類の共有トークンへ 1 箇所だけで写像する', async () => {
    const text = await source();

    expect(text).toContain('backgroundColor: colors.info');
    expect(text).toContain('backgroundColor: colors.success');
    expect(text).toContain('backgroundColor: colors.warning');
    expect(text).toContain('backgroundColor: colors.disabled');
    expect(text).toContain('backgroundColor: colors.accent');
    // tone→色の対応表は 1 箇所（この StyleSheet.create）だけに閉じる。
    expect(
      text.match(/colors\.(info|success|warning|disabled|accent)/g)
    ).toHaveLength(5);
    // render のたびに新しいスタイルオブジェクトを組み立てない
    // （`styles[tone]` を使い、`{ backgroundColor: ... }` をインラインで作らない）。
    expect(text).toContain('styles[tone]');
    expect(text).not.toContain('{ backgroundColor:');
  });

  it('寸法は 7px・borderRadius 999 に統一する（8px 系ドリフトを解消）', async () => {
    const text = await source();

    expect(text).toContain('height: 7');
    expect(text).toContain('width: 7');
    expect(text).toContain('borderRadius: 999');
    expect(text).not.toContain('height: 8');
    expect(text).not.toContain('width: 8');
    expect(text).not.toContain('borderRadius: 4');
  });

  it('props は tone と style だけを受ける', async () => {
    const text = await source();

    expect(text).toContain('readonly tone: StatusTone');
    expect(text).toContain('readonly style?: StyleProp<ViewStyle>');
    expect(text.match(/readonly/g)).toHaveLength(2);
  });

  it('文言を持たない装飾要素であり、支援技術からは隠す', async () => {
    const text = await source();

    expect(text).not.toContain('<Text');
    expect(text).not.toContain('accessibilityLabel');
    expect(text).toContain('accessible={false}');
  });

  it('react-native-svg を使わず View ベースで描く', async () => {
    const text = await source();

    expect(text).not.toContain('react-native-svg');
    expect(text).toContain("from 'react-native'");
  });

  it('色の 16 進値を直書きせず theme のトークンだけを使う', async () => {
    const text = await source();

    expect(text).toContain("from '../ui/theme'");
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
