import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  BRAND_MARK_ICON_GEOMETRY,
  generateBrandMarkIconPng,
  renderBrandMarkIconRgba,
} from './brand-mark-icon';
import { decodeRgbaPng } from './png-encoder';

const brandMarkSourcePath = join(
  import.meta.dir,
  '..',
  'src/components/BrandMark.tsx'
);
const readBrandMarkSource = (): Promise<string> =>
  Bun.file(brandMarkSourcePath).text();

function pixelAt(rgba: Uint8Array, size: number, x: number, y: number) {
  const index = (y * size + x) * 4;
  return {
    r: rgba[index],
    g: rgba[index + 1],
    b: rgba[index + 2],
    a: rgba[index + 3],
  };
}

describe('renderBrandMarkIconRgba', () => {
  it('sizePx × sizePx × 4 byte の RGBA バッファを返す', () => {
    const rgba = renderBrandMarkIconRgba(48);

    expect(rgba.length).toBe(48 * 48 * 4);
  });

  it('sizePx が正の整数でなければ Error を投げる', () => {
    expect(() => renderBrandMarkIconRgba(0)).toThrow(
      'sizePx は正の整数にする: 0'
    );
    expect(() => renderBrandMarkIconRgba(1.5)).toThrow(
      /sizePx は正の整数にする/
    );
  });

  it('mark から十分離れた四隅の背景は Ink 色になる', () => {
    const size = 120;
    const rgba = renderBrandMarkIconRgba(size);

    for (const [x, y] of [
      [2, 2],
      [117, 2],
      [2, 117],
      [117, 117],
    ] as const) {
      expect(pixelAt(rgba, size, x, y)).toEqual({
        r: BRAND_MARK_ICON_GEOMETRY.ink.r,
        g: BRAND_MARK_ICON_GEOMETRY.ink.g,
        b: BRAND_MARK_ICON_GEOMETRY.ink.b,
        a: 255,
      });
    }
  });

  it('bar（パスポートの帯）の中心は白になる', () => {
    const size = 120;
    const rgba = renderBrandMarkIconRgba(size);
    const { x, y, width, height } = BRAND_MARK_ICON_GEOMETRY.bar;
    const centerX = Math.round(x + width / 2);
    const centerY = Math.round(y + height / 2);

    expect(pixelAt(rgba, size, centerX, centerY)).toEqual({
      r: BRAND_MARK_ICON_GEOMETRY.white.r,
      g: BRAND_MARK_ICON_GEOMETRY.white.g,
      b: BRAND_MARK_ICON_GEOMETRY.white.b,
      a: 255,
    });
  });

  it('peak（山頂）の線分の中間点は白になる', () => {
    const size = 120;
    const rgba = renderBrandMarkIconRgba(size);
    // BrandMark.tsx の Path (M26 90 L60 48) の中間点。
    const midX = Math.round((26 + 60) / 2);
    const midY = Math.round((90 + 48) / 2);

    expect(pixelAt(rgba, size, midX, midY)).toEqual({
      r: BRAND_MARK_ICON_GEOMETRY.white.r,
      g: BRAND_MARK_ICON_GEOMETRY.white.g,
      b: BRAND_MARK_ICON_GEOMETRY.white.b,
      a: 255,
    });
  });

  it('サイズを変えても輪郭がスケールする（512px でも中心が白のまま）', () => {
    const size = 512;
    const scale = size / BRAND_MARK_ICON_GEOMETRY.viewBoxSize;
    const rgba = renderBrandMarkIconRgba(size);
    const { x, y, width, height } = BRAND_MARK_ICON_GEOMETRY.bar;
    const centerX = Math.round((x + width / 2) * scale);
    const centerY = Math.round((y + height / 2) * scale);

    expect(pixelAt(rgba, size, centerX, centerY)).toEqual({
      r: BRAND_MARK_ICON_GEOMETRY.white.r,
      g: BRAND_MARK_ICON_GEOMETRY.white.g,
      b: BRAND_MARK_ICON_GEOMETRY.white.b,
      a: 255,
    });
  });
});

describe('generateBrandMarkIconPng', () => {
  it('192 / 512 のどちらでも decodeRgbaPng が読める正しい PNG を生成する', () => {
    for (const size of [192, 512]) {
      const decoded = decodeRgbaPng(generateBrandMarkIconPng(size));

      expect(decoded.width).toBe(size);
      expect(decoded.height).toBe(size);
    }
  });
});

describe('Issue 88: BrandMark.tsx との幾何 drift 検出', () => {
  it('bar の Rect 定数が BrandMark.tsx と一致する', async () => {
    const source = await readBrandMarkSource();

    expect(source).toContain('x={26}');
    expect(source).toContain('y={24}');
    expect(source).toContain('width={68}');
    expect(source).toContain('height={12}');
    expect(source).toContain('rx={6}');
    expect(BRAND_MARK_ICON_GEOMETRY.bar).toEqual({
      x: 26,
      y: 24,
      width: 68,
      height: 12,
      rx: 6,
    });
  });

  it('peak の Path 定数が BrandMark.tsx と一致する', async () => {
    const source = await readBrandMarkSource();

    expect(source).toContain('d="M26 90 L60 48 L94 90"');
    expect(source).toContain('strokeWidth={13}');
    expect(source).toContain('strokeLinecap="round"');
    expect(source).toContain('strokeLinejoin="round"');
    expect(BRAND_MARK_ICON_GEOMETRY.peakSegments).toEqual([
      { from: [26, 90], to: [60, 48] },
      { from: [60, 48], to: [94, 90] },
    ]);
    expect(BRAND_MARK_ICON_GEOMETRY.peakStrokeWidth).toBe(13);
  });

  it('Ink / 白の色定数が Ink Summit リデザインの ink トークン (#1d1d1f) と一致する', () => {
    expect(BRAND_MARK_ICON_GEOMETRY.ink).toEqual({ r: 0x1d, g: 0x1d, b: 0x1f });
    expect(BRAND_MARK_ICON_GEOMETRY.white).toEqual({
      r: 0xff,
      g: 0xff,
      b: 0xff,
    });
  });
});
