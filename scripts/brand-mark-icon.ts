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

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface BrandMarkIconColors {
  readonly background: RgbColor;
  readonly mark: RgbColor;
}

/**
 * Issue 91（アプリアイコン 4 アセット生成）向けの拡張オプション。
 * どちらも省略時は Issue 88 のデフォルト（Ink 背景 + 白マーク、等倍）と
 * 完全に後方互換になる。
 */
export interface RenderBrandMarkIconOptions {
  /**
   * viewBox（120×120、中心 (60,60)）をキャンバス中心へ固定したまま、
   * マークだけを拡縮する係数。0 より大きく 1 以下でなければならない。
   *
   * 変換式: `v = 60 + (p - sizePx/2) / effectiveScale`
   * （`effectiveScale = sizePx * markScale / 120`）。
   *
   * `markScale` が 1（省略時のデフォルト）のときは、この中心化変換ではなく
   * Issue 88 由来の非中心化変換 `v = p / effectiveScale` をそのまま使う。
   * 数学的には両者は markScale=1 で同値だが、浮動小数点演算の丸め順序が
   * 異なるため厳密には 1 ULP 未満の差が出ることがある。既存呼び出し元
   * （`generateBrandMarkIconPng(192)` 等）とのバイト互換を壊さないために
   * 明示的に等倍のときだけ旧式を使う。
   *
   * 用途例: Android adaptive icon のセーフゾーン（中央 66%）へマークを
   * 収める場合は `markScale: 0.66` を渡す。
   */
  readonly markScale?: number;
  /** 背景色とマーク色。省略時は Ink 背景 + 白マーク（Issue 88 のデフォルト）。 */
  readonly colors?: BrandMarkIconColors;
}

const DEFAULT_MARK_SCALE = 1;
const DEFAULT_COLORS: BrandMarkIconColors = { background: INK, mark: WHITE };

function validateMarkScale(markScale: number): void {
  if (!(markScale > 0) || markScale > 1) {
    throw new Error(`markScale は 0 より大きく 1 以下にする: ${markScale}`);
  }
}

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

/**
 * 1 次元のピクセル座標 `pixel` を viewBox 座標へ写す。
 * `markScale` が 1 のときは Issue 88 由来の非中心化変換 `pixel / effectiveScale` を
 * そのまま使い（既存呼び出し元とのバイト互換を保証する）、1 未満のときだけ
 * viewBox 中心 (60) をキャンバス中心 (`sizePx/2`) に固定する中心化変換を使う。
 */
function mapPixelToViewBoxAxis(
  pixel: number,
  sizePx: number,
  markScale: number,
  effectiveScale: number
): number {
  if (markScale === DEFAULT_MARK_SCALE) {
    return pixel / effectiveScale;
  }
  return VIEW_BOX_SIZE / 2 + (pixel - sizePx / 2) / effectiveScale;
}

/** ピクセル (px, py) を `SUPERSAMPLE`×`SUPERSAMPLE` のサブピクセルへ分割し、マークの被覆率 (0〜1) を返す。 */
function computeCoverage(
  px: number,
  py: number,
  sizePx: number,
  markScale: number,
  effectiveScale: number
): number {
  let markCount = 0;
  for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
    const vy = mapPixelToViewBoxAxis(
      py + (sy + 0.5) / SUPERSAMPLE,
      sizePx,
      markScale,
      effectiveScale
    );
    for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
      const vx = mapPixelToViewBoxAxis(
        px + (sx + 0.5) / SUPERSAMPLE,
        sizePx,
        markScale,
        effectiveScale
      );
      if (isInsideBrandMark(vx, vy)) {
        markCount += 1;
      }
    }
  }
  return markCount / (SUPERSAMPLE * SUPERSAMPLE);
}

/**
 * 被覆率 `coverage` で `colors.background` と `colors.mark` を線形補間し、
 * `rgba[index..index+3]` へ書き込む。
 */
function writeCoveragePixel(
  rgba: Uint8Array,
  index: number,
  coverage: number,
  colors: BrandMarkIconColors
): void {
  const { background, mark } = colors;
  rgba[index] = Math.round(background.r + (mark.r - background.r) * coverage);
  rgba[index + 1] = Math.round(
    background.g + (mark.g - background.g) * coverage
  );
  rgba[index + 2] = Math.round(
    background.b + (mark.b - background.b) * coverage
  );
  rgba[index + 3] = 255;
}

/**
 * `sizePx` × `sizePx` の BrandMark を RGBA バッファへラスタライズする。
 * サブピクセル `SUPERSAMPLE`×`SUPERSAMPLE` を平均するボックスフィルタで
 * 輪郭をアンチエイリアスする。既定は Ink 背景 + 白マーク・等倍
 * （Issue 88 の PWA アイコンと同一デザイン）。`options` で
 * Issue 91 のアプリアイコン用途（縮小・配色反転）に拡張できる。
 */
export function renderBrandMarkIconRgba(
  sizePx: number,
  options: RenderBrandMarkIconOptions = {}
): Uint8Array {
  if (!Number.isInteger(sizePx) || sizePx <= 0) {
    throw new Error(`sizePx は正の整数にする: ${sizePx}`);
  }
  const markScale = options.markScale ?? DEFAULT_MARK_SCALE;
  validateMarkScale(markScale);
  const colors = options.colors ?? DEFAULT_COLORS;

  const effectiveScale = (sizePx * markScale) / VIEW_BOX_SIZE;
  const rgba = new Uint8Array(sizePx * sizePx * 4);

  for (let py = 0; py < sizePx; py += 1) {
    for (let px = 0; px < sizePx; px += 1) {
      const coverage = computeCoverage(
        px,
        py,
        sizePx,
        markScale,
        effectiveScale
      );
      writeCoveragePixel(rgba, (py * sizePx + px) * 4, coverage, colors);
    }
  }

  return rgba;
}

/**
 * `sizePx` × `sizePx` の BrandMark アイコンを PNG バイト列として生成する。
 * `options` は `renderBrandMarkIconRgba` と同じ（省略時は Ink 背景 + 白マーク・等倍）。
 */
export function generateBrandMarkIconPng(
  sizePx: number,
  options?: RenderBrandMarkIconOptions
): Uint8Array {
  return encodeRgbaPng(
    sizePx,
    sizePx,
    renderBrandMarkIconRgba(sizePx, options)
  );
}

export const BRAND_MARK_ICON_GEOMETRY = {
  viewBoxSize: VIEW_BOX_SIZE,
  bar: BAR,
  peakSegments: PEAK_SEGMENTS,
  peakStrokeWidth: PEAK_STROKE_WIDTH,
  ink: INK,
  white: WHITE,
} as const;
