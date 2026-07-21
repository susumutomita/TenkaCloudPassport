import { encodeRgbaPng } from './png-encoder';

/**
 * PWA インストールアイコン用に、Ink / Summit ブランドの山頂マーク
 * （`src/components/BrandMark.tsx`、ビジュアルの正本は
 * `docs/design/2026-07-20-ink-summit-redesign.md`）を Ink 背景 + 白マークで
 * ラスタライズする。BrandMark.tsx は `viewBox="0 0 120 120"` の
 * `react-native-svg` 要素として同じ Rect / Path を描画しており、本モジュールは
 * その幾何定数をピクセル単位のラスタライズ用に複製する
 * （drift 検出は `scripts/brand-mark-icon.test.ts` を参照）。
 */

const VIEW_BOX_SIZE = 120;

/** BrandMark.tsx の `<Rect x={26} y={24} width={68} height={12} rx={6} .../>` と同じ値。 */
const BAR = { x: 26, y: 24, width: 68, height: 12, rx: 6 } as const;

/**
 * BrandMark.tsx の
 * `<Path d="M26 90 L60 48 L94 90" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" .../>`
 * と同じ値。round な linejoin は、2 本の線分をそれぞれ round cap 付きの
 * capsule として描き重ねることと等価になるため、この 2 セグメントを
 * capsule 判定で扱う。
 */
type Point = readonly [number, number];
type PeakSegments = ReadonlyArray<{
  readonly from: Point;
  readonly to: Point;
}>;

const PEAK_SEGMENTS: PeakSegments = [
  { from: [26, 90], to: [60, 48] },
  { from: [60, 48], to: [94, 90] },
];
const PEAK_STROKE_WIDTH = 13;

const INK = { r: 0x1d, g: 0x1d, b: 0x1f } as const;
const WHITE = { r: 0xff, g: 0xff, b: 0xff } as const;

/** アンチエイリアス用の supersampling 係数（縦横それぞれ SS 倍のサブピクセルを平均する）。 */
const SUPERSAMPLE = 4;

function isInsideRoundedRect(
  vx: number,
  vy: number,
  rect: { x: number; y: number; width: number; height: number; rx: number }
): boolean {
  if (
    vx < rect.x ||
    vx > rect.x + rect.width ||
    vy < rect.y ||
    vy > rect.y + rect.height
  ) {
    return false;
  }
  const qx = Math.max(
    rect.x + rect.rx - vx,
    vx - (rect.x + rect.width - rect.rx),
    0
  );
  const qy = Math.max(
    rect.y + rect.rx - vy,
    vy - (rect.y + rect.height - rect.rx),
    0
  );
  return qx * qx + qy * qy <= rect.rx * rect.rx;
}

function distanceToSegment(
  vx: number,
  vy: number,
  from: Point,
  to: Point
): number {
  const [ax, ay] = from;
  const [bx, by] = to;
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((vx - ax) * abx + (vy - ay) * aby) / lengthSquared)
        );
  const projectedX = ax + t * abx;
  const projectedY = ay + t * aby;
  const dx = vx - projectedX;
  const dy = vy - projectedY;
  return Math.sqrt(dx * dx + dy * dy);
}

function isInsidePeakStroke(vx: number, vy: number): boolean {
  const radius = PEAK_STROKE_WIDTH / 2;
  return PEAK_SEGMENTS.some(
    (segment) => distanceToSegment(vx, vy, segment.from, segment.to) <= radius
  );
}

function isInsideBrandMark(vx: number, vy: number): boolean {
  return isInsideRoundedRect(vx, vy, { ...BAR }) || isInsidePeakStroke(vx, vy);
}

/** ピクセル (px, py) を `SUPERSAMPLE`×`SUPERSAMPLE` のサブピクセルへ分割し、白マークの被覆率 (0〜1) を返す。 */
function computeCoverage(px: number, py: number, scale: number): number {
  let whiteCount = 0;
  for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
    const vy = (py + (sy + 0.5) / SUPERSAMPLE) / scale;
    for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
      const vx = (px + (sx + 0.5) / SUPERSAMPLE) / scale;
      if (isInsideBrandMark(vx, vy)) {
        whiteCount += 1;
      }
    }
  }
  return whiteCount / (SUPERSAMPLE * SUPERSAMPLE);
}

/** 被覆率 `coverage` で Ink と白を線形補間し、`rgba[index..index+3]` へ書き込む。 */
function writeCoveragePixel(
  rgba: Uint8Array,
  index: number,
  coverage: number
): void {
  rgba[index] = Math.round(INK.r + (WHITE.r - INK.r) * coverage);
  rgba[index + 1] = Math.round(INK.g + (WHITE.g - INK.g) * coverage);
  rgba[index + 2] = Math.round(INK.b + (WHITE.b - INK.b) * coverage);
  rgba[index + 3] = 255;
}

/**
 * `sizePx` × `sizePx` の Ink 背景 + 白 BrandMark を RGBA バッファへラスタライズする。
 * サブピクセル `SUPERSAMPLE`×`SUPERSAMPLE` を平均するボックスフィルタで
 * 輪郭をアンチエイリアスする。
 */
export function renderBrandMarkIconRgba(sizePx: number): Uint8Array {
  if (!Number.isInteger(sizePx) || sizePx <= 0) {
    throw new Error(`sizePx は正の整数にする: ${sizePx}`);
  }

  const scale = sizePx / VIEW_BOX_SIZE;
  const rgba = new Uint8Array(sizePx * sizePx * 4);

  for (let py = 0; py < sizePx; py += 1) {
    for (let px = 0; px < sizePx; px += 1) {
      const coverage = computeCoverage(px, py, scale);
      writeCoveragePixel(rgba, (py * sizePx + px) * 4, coverage);
    }
  }

  return rgba;
}

/** `sizePx` × `sizePx` の Ink / Summit BrandMark アイコンを PNG バイト列として生成する。 */
export function generateBrandMarkIconPng(sizePx: number): Uint8Array {
  return encodeRgbaPng(sizePx, sizePx, renderBrandMarkIconRgba(sizePx));
}

export const BRAND_MARK_ICON_GEOMETRY = {
  viewBoxSize: VIEW_BOX_SIZE,
  bar: BAR,
  peakSegments: PEAK_SEGMENTS,
  peakStrokeWidth: PEAK_STROKE_WIDTH,
  ink: INK,
  white: WHITE,
} as const;
