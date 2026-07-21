import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BRAND_MARK_ICON_GEOMETRY } from './brand-mark-icon';
import {
  ADAPTIVE_ICON_SAFE_ZONE_RATIO,
  generateAppIconAssets,
  writeAppIconAssets,
} from './generate-app-icons';
import { decodeRgbaPng } from './png-encoder';

function pixelAt(rgba: Uint8Array, size: number, x: number, y: number) {
  const index = (y * size + x) * 4;
  return {
    r: rgba[index],
    g: rgba[index + 1],
    b: rgba[index + 2],
    a: rgba[index + 3],
  };
}

const INK = BRAND_MARK_ICON_GEOMETRY.ink;
const WHITE = BRAND_MARK_ICON_GEOMETRY.white;

const EXPECTED_ASSETS = [
  { assetPath: 'assets/icon.png', size: 1024 },
  { assetPath: 'assets/adaptive-icon.png', size: 1024 },
  { assetPath: 'assets/favicon.png', size: 48 },
  { assetPath: 'assets/splash-icon.png', size: 512 },
] as const;

const directories: string[] = [];

afterEach(async () => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe('generateAppIconAssets', () => {
  it('Issue 91 で規定された 4 アセットを固定パス・固定順で返す', () => {
    const assets = generateAppIconAssets();

    expect(assets.map((asset) => asset.assetPath)).toEqual(
      EXPECTED_ASSETS.map((expected) => expected.assetPath)
    );
  });

  it('再実行しても決定論的に同一バイト列を生成する（再現可能生成）', () => {
    const first = generateAppIconAssets();
    const second = generateAppIconAssets();

    for (const [index, asset] of first.entries()) {
      const other = second[index];
      expect(other).toBeDefined();
      expect(
        Buffer.compare(Buffer.from(asset.png), Buffer.from(other?.png ?? []))
      ).toBe(0);
    }
  });

  it('4 アセットとも decodeRgbaPng で読める、想定サイズの PNG である', () => {
    const assets = generateAppIconAssets();

    for (const [index, expected] of EXPECTED_ASSETS.entries()) {
      const asset = assets[index];
      expect(asset).toBeDefined();
      const decoded = decodeRgbaPng(asset?.png ?? new Uint8Array());
      expect(decoded.width).toBe(expected.size);
      expect(decoded.height).toBe(expected.size);
    }
  });

  it('icon.png は Ink 背景 + 白マーク（og.png / PWA アイコンと同一デザイン）', () => {
    const [icon] = generateAppIconAssets();
    expect(icon).toBeDefined();
    const decoded = decodeRgbaPng(icon?.png ?? new Uint8Array());
    const scale = decoded.width / BRAND_MARK_ICON_GEOMETRY.viewBoxSize;
    const { x, y, width, height } = BRAND_MARK_ICON_GEOMETRY.bar;
    const barCenterX = Math.round((x + width / 2) * scale);
    const barCenterY = Math.round((y + height / 2) * scale);

    expect(pixelAt(decoded.rgba, decoded.width, 4, 4)).toEqual({
      r: INK.r,
      g: INK.g,
      b: INK.b,
      a: 255,
    });
    expect(
      pixelAt(decoded.rgba, decoded.width, barCenterX, barCenterY)
    ).toEqual({ r: WHITE.r, g: WHITE.g, b: WHITE.b, a: 255 });
  });

  it('splash-icon.png は配色を反転する（白地 + Ink マーク）', () => {
    const [, , , splashIcon] = generateAppIconAssets();
    expect(splashIcon).toBeDefined();
    const decoded = decodeRgbaPng(splashIcon?.png ?? new Uint8Array());
    const scale = decoded.width / BRAND_MARK_ICON_GEOMETRY.viewBoxSize;
    const { x, y, width, height } = BRAND_MARK_ICON_GEOMETRY.bar;
    const barCenterX = Math.round((x + width / 2) * scale);
    const barCenterY = Math.round((y + height / 2) * scale);

    expect(pixelAt(decoded.rgba, decoded.width, 4, 4)).toEqual({
      r: WHITE.r,
      g: WHITE.g,
      b: WHITE.b,
      a: 255,
    });
    expect(
      pixelAt(decoded.rgba, decoded.width, barCenterX, barCenterY)
    ).toEqual({ r: INK.r, g: INK.g, b: INK.b, a: 255 });
  });

  it('adaptive-icon.png は中央 66% の Android セーフゾーン内にマークを収める', () => {
    const [, adaptiveIcon] = generateAppIconAssets();
    expect(adaptiveIcon).toBeDefined();
    const decoded = decodeRgbaPng(adaptiveIcon?.png ?? new Uint8Array());
    const size = decoded.width;
    const ratio = ADAPTIVE_ICON_SAFE_ZONE_RATIO;
    const effectiveScale =
      (size * ratio) / BRAND_MARK_ICON_GEOMETRY.viewBoxSize;

    // viewBox は [0, 120] の外に一切マークを持たないため、safe zone box
    // （viewBox 全体を markScale で写した箱）の外側は必ず背景色になる。
    const outsideMargin = 8;
    const boxHalfWidthPx = 60 * effectiveScale;
    const outsidePoints: ReadonlyArray<readonly [number, number]> = [
      [
        Math.round(size / 2 - boxHalfWidthPx) - outsideMargin,
        Math.round(size / 2),
      ],
      [
        Math.round(size / 2 + boxHalfWidthPx) + outsideMargin,
        Math.round(size / 2),
      ],
      [
        Math.round(size / 2),
        Math.round(size / 2 - boxHalfWidthPx) - outsideMargin,
      ],
      [
        Math.round(size / 2),
        Math.round(size / 2 + boxHalfWidthPx) + outsideMargin,
      ],
    ];
    for (const [px, py] of outsidePoints) {
      expect(pixelAt(decoded.rgba, size, px, py)).toEqual({
        r: INK.r,
        g: INK.g,
        b: INK.b,
        a: 255,
      });
    }

    // safe zone の内側には引き続きマーク（白）が描画されている。
    // bar 内部かつ角丸の影響を受けない viewBox 座標 (75, 30) を使う。
    const insidePx = Math.round(size / 2 + (75 - 60) * effectiveScale);
    const insidePy = Math.round(size / 2 + (30 - 60) * effectiveScale);
    expect(pixelAt(decoded.rgba, size, insidePx, insidePy)).toEqual({
      r: WHITE.r,
      g: WHITE.g,
      b: WHITE.b,
      a: 255,
    });

    // キャンバス四隅は Android の adaptiveIcon.backgroundColor と揃う Ink。
    for (const [cx, cy] of [
      [2, 2],
      [size - 3, 2],
      [2, size - 3],
      [size - 3, size - 3],
    ] as const) {
      expect(pixelAt(decoded.rgba, size, cx, cy)).toEqual({
        r: INK.r,
        g: INK.g,
        b: INK.b,
        a: 255,
      });
    }
  });
});

describe('writeAppIconAssets', () => {
  it('repoRoot 配下の assets/ へ 4 ファイルを実際に書き出す', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'tenka-app-icons-'));
    directories.push(repoRoot);
    await mkdir(join(repoRoot, 'assets'), { recursive: true });

    const writtenPaths = await writeAppIconAssets({ repoRoot });
    const expected = generateAppIconAssets();

    expect(writtenPaths).toEqual(
      expected.map((asset) => join(repoRoot, asset.assetPath))
    );
    for (const [index, asset] of expected.entries()) {
      const writtenPath = writtenPaths[index];
      expect(writtenPath).toBeDefined();
      const writtenBytes = await readFile(writtenPath ?? '');
      expect(Buffer.compare(writtenBytes, Buffer.from(asset.png))).toBe(0);
    }
  });

  it('assets/ ディレクトリが存在しないときはエラーで fail-closed になる', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'tenka-app-icons-missing-'));
    directories.push(repoRoot);

    await expect(writeAppIconAssets({ repoRoot })).rejects.toThrow();
  });
});

function toHexColor(color: { r: number; g: number; b: number }): string {
  const toByte = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
}

const appJsonPath = join(import.meta.dir, '..', 'app.json');
const readAppJson = (): Promise<string> => Bun.file(appJsonPath).text();

describe('Issue 91: app.json との配色 drift 検出', () => {
  it('adaptiveIcon.backgroundColor は生成した adaptive-icon.png の背景色 (Ink) と一致する', async () => {
    const appJson = await readAppJson();
    const parsed = JSON.parse(appJson) as {
      expo?: { android?: { adaptiveIcon?: { backgroundColor?: string } } };
    };

    expect(parsed.expo?.android?.adaptiveIcon?.backgroundColor).toBe(
      toHexColor(BRAND_MARK_ICON_GEOMETRY.ink)
    );
  });

  it('splash.backgroundColor は生成した splash-icon.png の背景色 (白) と一致する', async () => {
    const appJson = await readAppJson();
    const parsed = JSON.parse(appJson) as {
      expo?: { splash?: { backgroundColor?: string } };
    };

    expect(parsed.expo?.splash?.backgroundColor).toBe(
      toHexColor(BRAND_MARK_ICON_GEOMETRY.white)
    );
  });
});
