import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

/**
 * Issue 70: ブランドの山頂マーク（bar + peak）のソース契約を固定する。
 * ビジュアルの正本は claude.ai/design「TenkaCloud Passport Redesign.dc.html」で、
 * viewBox・パス定数はそのまま採用する（`docs/design/2026-07-20-ink-summit-redesign.md`）。
 * この repo はレンダリング用のテスト基盤を持たないため、他の Screen / Component と
 * 同じくソーステキスト検査で担保する。
 */
describe('BrandMark（山頂マーク）のソース契約', () => {
  it('react-native-svg で viewBox 0 0 120 120 の bar + peak を描く', async () => {
    const text = await source('BrandMark.tsx');

    expect(text).toContain("from 'react-native-svg'");
    expect(text).toContain('viewBox="0 0 120 120"');
    // bar: 上部の横棒（角丸 rect）。
    expect(text).toContain('<Rect x={26} y={24} width={68} height={12} rx={6}');
    // peak: 山頂の stroke パス。塗りではなく線で描く。
    expect(text).toContain('d="M26 90 L60 48 L94 90"');
    expect(text).toContain('strokeWidth={13}');
    expect(text).toContain('strokeLinecap="round"');
    expect(text).toContain('strokeLinejoin="round"');
    expect(text).toContain('fill="none"');
  });

  it('props は size（既定 20）と color（既定 theme の ink）だけを受ける', async () => {
    const text = await source('BrandMark.tsx');

    expect(text).toContain('size = 20');
    expect(text).toContain('color = colors.ink');
    expect(text).toContain('readonly size?: number');
    expect(text).toContain('readonly color?: string');
    // 純表示コンポーネントであり、この 2 つ以外の props を持たない。
    expect(text.match(/readonly/g)).toHaveLength(2);
  });

  it('文言を持たない装飾要素であり、支援技術からは隠す', async () => {
    const text = await source('BrandMark.tsx');

    // ロックアップの文字列（TenkaCloud Passport）は利用側が持ち、マーク自体は
    // Text を一切描画しない。
    expect(text).not.toContain('<Text');
    expect(text).not.toContain("from 'react-native'");
    expect(text).not.toContain('accessibilityLabel');
    expect(text).toContain('accessible={false}');
  });

  it('色の 16 進値を直書きせず theme のトークンだけを使う', async () => {
    const text = await source('BrandMark.tsx');

    expect(text).toContain("from '../ui/theme'");
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('AppScreen はヘッダーのロックアップに BrandMark を使う（全画面へ波及する）', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain("from './BrandMark'");
    expect(text).toContain('<BrandMark');
    expect(text).toContain('TenkaCloud');
  });
});
