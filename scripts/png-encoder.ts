import { deflateSync, inflateSync } from 'node:zlib';

/**
 * 依存ゼロの最小 PNG (RGBA, 8bit, filter None) encoder。
 *
 * `@expo/image-utils` の推移的依存（`pngjs` / `jimp-compact`）を直接 import すると、
 * 本 Repository が直接管理しない依存に暗黙に乗ることになり、`bun.lock` の更新で
 * 無警告に壊れる可能性がある（設計は
 * `docs/design/2026-07-21-web-app-pages-distribution.md` 参照）。PWA アイコンという
 * 単純な用途には `node:zlib`（Bun 組み込み）だけで足りるため、新しい npm 依存を
 * 増やさずに自前実装する。
 */

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_TABLE = buildCrc32Table();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    const tableIndex = (crc ^ byte) & 0xff;
    const tableValue = CRC32_TABLE[tableIndex] ?? 0;
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function writeUint32BE(value: number): Uint8Array {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, value, false);
  return buffer;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concatBytes([typeBytes, data]);
  return concatBytes([
    writeUint32BE(data.length),
    typeBytes,
    data,
    writeUint32BE(crc32(crcInput)),
  ]);
}

/** IHDR の colorType 定数。本実装は RGBA (6) だけを扱う。 */
export const PNG_COLOR_TYPE_RGBA = 6;

/**
 * 幅 `width` × 高さ `height` の RGBA (1px = 4byte, row-major) バッファから
 * 8bit / filter-None / non-interlaced な PNG バイト列を組み立てる。
 */
export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array
): Uint8Array {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`width は正の整数にする: ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`height は正の整数にする: ${height}`);
  }
  const expectedLength = width * height * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(
      `rgba の長さが width*height*4 と一致しない: expected=${expectedLength} actual=${rgba.length}`
    );
  }

  const ihdr = concatBytes([
    writeUint32BE(width),
    writeUint32BE(height),
    Uint8Array.from([8, PNG_COLOR_TYPE_RGBA, 0, 0, 0]),
  ]);

  const rowBytes = width * 4;
  const raw = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y += 1) {
    const srcStart = y * rowBytes;
    const destStart = y * (rowBytes + 1);
    raw[destStart] = 0; // filter type: None
    raw.set(rgba.subarray(srcStart, srcStart + rowBytes), destStart + 1);
  }
  const idatData = deflateSync(raw);

  return concatBytes([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(idatData)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

export interface DecodedRgbaPng {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly rgba: Uint8Array;
}

interface DecodedIhdr {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
}

function assertPngSignature(png: Uint8Array): void {
  for (const [index, byte] of PNG_SIGNATURE.entries()) {
    if (png[index] !== byte) {
      throw new Error(`PNG signature mismatch at byte ${index}`);
    }
  }
}

function parseIhdr(data: Uint8Array): DecodedIhdr {
  const view = new DataView(data.buffer, data.byteOffset, data.length);
  const width = view.getUint32(0, false);
  const height = view.getUint32(4, false);
  const bitDepth = data[8] ?? 0;
  const colorType = data[9] ?? 0;
  if (bitDepth !== 8 || colorType !== PNG_COLOR_TYPE_RGBA) {
    throw new Error(
      `decodeRgbaPng は 8bit RGBA だけに対応する: bitDepth=${bitDepth} colorType=${colorType}`
    );
  }
  return { width, height, bitDepth, colorType };
}

/** signature を除いた PNG chunk 列を走査し、IHDR の値と IDAT の連結バイト列を集める。 */
function parsePngChunks(
  png: Uint8Array
): DecodedIhdr & { readonly idat: Uint8Array } {
  let offset = PNG_SIGNATURE.length;
  let ihdr: DecodedIhdr = { width: 0, height: 0, bitDepth: 0, colorType: 0 };
  const idatParts: Uint8Array[] = [];

  while (offset < png.length) {
    const header = new DataView(png.buffer, png.byteOffset + offset, 8);
    const length = header.getUint32(0, false);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const data = png.subarray(dataStart, dataStart + length);

    if (type === 'IHDR') {
      ihdr = parseIhdr(data);
    } else if (type === 'IDAT') {
      idatParts.push(Uint8Array.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4; // + CRC
  }

  return { ...ihdr, idat: concatBytes(idatParts) };
}

/** filter-None 前提で、行頭 1 byte（filter type）を捨てながら RGBA へ復元する。 */
function unfilterRows(
  raw: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const rowBytes = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    const filterType = raw[rowStart];
    if (filterType !== 0) {
      throw new Error(
        `decodeRgbaPng は filter None だけに対応する: ${filterType}`
      );
    }
    rgba.set(raw.subarray(rowStart + 1, rowStart + 1 + rowBytes), y * rowBytes);
  }
  return rgba;
}

/**
 * `encodeRgbaPng` が書き出す PNG（8bit RGBA・filter None・non-interlaced）だけを
 * 対象にした最小 decoder。テスト（round-trip 検証）向けの逆変換だが、
 * `encodeRgbaPng` と対になる一般的なユーティリティとして export する。
 * この前提（8bit / colorType 6 / filter None）を満たさない PNG は
 * fail-closed で Error にする（対応範囲外を無言でそれらしく読まない）。
 */
export function decodeRgbaPng(png: Uint8Array): DecodedRgbaPng {
  assertPngSignature(png);
  const { width, height, bitDepth, colorType, idat } = parsePngChunks(png);
  const raw = inflateSync(idat);
  const rgba = unfilterRows(raw, width, height);
  return { width, height, bitDepth, colorType, rgba };
}
