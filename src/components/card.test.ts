import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'Card.tsx');
}

/**
 * Issue 72 D: 白地 + borderSubtle のカード意匠が 5 箇所インラインでコピペされていたため
 * title を持たないプリミティブへ抽出する。`ScreenCard` / `NoticeCard` は内部でこれを
 * 使うか、Ink / Summit トークンへ移行する。
 */
describe('Card（カード意匠プリミティブ）のソース契約', () => {
  it('white 地・borderSubtle・radius 14・padding md・gap xs を既定にする', async () => {
    const text = await source();

    expect(text).toContain('backgroundColor: colors.white');
    expect(text).toContain('borderColor: colors.borderSubtle');
    expect(text).toContain('borderWidth: 1');
    expect(text).toContain('borderRadius: 14');
    expect(text).toContain('padding: spacing.md');
    expect(text).toContain('gap: spacing.xs');
  });

  it('title を持たず children・style・accessibilityRole だけを受ける（利用側で radius 等を上書き可能）', async () => {
    const text = await source();

    expect(text).not.toContain('readonly title');
    expect(text).toContain('children');
    expect(text).toContain('style?:');
    expect(text.match(/readonly/g)).toHaveLength(2);
  });

  it('accessibilityRole を View へそのまま渡す（利用側が意味グルーピングのために Card を素の View で包まなくてよい）', async () => {
    const text = await source();

    expect(text).toContain('readonly accessibilityRole?: AccessibilityRole');
    expect(text).toContain('accessibilityRole={accessibilityRole}');
  });

  it('style prop を既定スタイルの後ろへマージし、利用側の上書きを許す', async () => {
    const text = await source();
    const styleArrayIndex = text.indexOf('[styles.card, style]');

    expect(styleArrayIndex).toBeGreaterThan(-1);
  });

  it('色の 16 進値を直書きせず theme のトークンだけを使う', async () => {
    const text = await source();

    expect(text).toContain("from '../ui/theme'");
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
