import { describe, expect, it } from 'bun:test';
import { colors, primaryEmphasisBorder, spacing } from './theme';

/**
 * Issue 70: Ink / Summit リデザインのトークン正本を固定する。
 * 期待値の正本は `docs/design/2026-07-20-ink-summit-redesign.md` の
 * トークン対応表であり、この 16 進値を変えるときは設計書の更新が先行する。
 */

function hexToRgb(hex: string): readonly [number, number, number] {
  const matched = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  if (!matched) {
    throw new Error(`16 進カラーではありません: ${hex}`);
  }
  const [, r, g, b] = matched;
  return [
    Number.parseInt(r as string, 16),
    Number.parseInt(g as string, 16),
    Number.parseInt(b as string, 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Ink / Summit カラートークン', () => {
  it('設計書のトークン対応表と同じ 16 進値を公開する', () => {
    expect(colors).toEqual({
      background: '#ffffff',
      surface: '#f5f5f7',
      ink: '#1d1d1f',
      muted: '#6e6e73',
      mutedLight: '#86868b',
      border: '#d2d2d7',
      borderSubtle: '#e8e8ed',
      primary: '#1d1d1f',
      primaryPressed: '#000000',
      primarySoft: '#f5f5f7',
      accent: '#ff6a32',
      success: '#2f9e63',
      successText: '#1f7a49',
      info: '#3b82f6',
      warning: '#b07708',
      warningText: '#8a6a12',
      danger: '#9f3434',
      disabled: '#c7c7cc',
      white: '#ffffff',
    });
  });

  it('primary ボタンは ink 塗りである（primary と ink が同値）', () => {
    expect(colors.primary).toBe(colors.ink);
  });

  it('白地の本文・状態文字トークンは WCAG 2.1 AA（4.5:1）を満たす', () => {
    for (const token of [
      colors.ink,
      colors.muted,
      colors.successText,
      colors.warningText,
      colors.danger,
    ]) {
      expect(contrastRatio(token, colors.background)).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });

  it('ダーク面（ink 地）の白文字と summit ラベルは WCAG 2.1 AA（4.5:1）を満たす', () => {
    expect(contrastRatio(colors.white, colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.accent, colors.ink)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it('accent は白背景の本文に使えないコントラストであることを記録する（ドット・バッジ・ダーク面限定）', () => {
    expect(contrastRatio(colors.accent, colors.background)).toBeLessThan(4.5);
  });

  it('状態ドットは白地・淡地の両方で非テキスト UI の WCAG 2.1 AA（3:1）を満たす', () => {
    for (const dot of [colors.success, colors.warning, colors.info]) {
      expect(contrastRatio(dot, colors.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(dot, colors.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('余白トークン', () => {
  it('spacing はリデザイン前と同じ値を維持する', () => {
    expect(spacing).toEqual({ xs: 6, sm: 10, md: 16, lg: 24, xl: 32 });
  });
});

describe('primaryEmphasisBorder（Issue 72 E: tint 単独の選択表現を防ぐ枠）', () => {
  it('primary の 1px 枠だけを持ち、背景色・角丸・余白は含まない', () => {
    expect(primaryEmphasisBorder).toEqual({
      borderColor: colors.primary,
      borderWidth: 1,
    });
  });
});
