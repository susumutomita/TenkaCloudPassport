// 誤り訂正レベル L（ISO/IEC 18004）採用時に、密度（QR Version = モジュール数）を
// 変えないまま選べる最大 byte 数。導出（ADR-0032 参照）:
//   1. 旧構成（誤り訂正 M）で 1,024 byte の payload が選んでいた QR Version は 26
//      （encoder.test.ts の '1,024 byte 境界の入力を Version 26 で encode' で固定）。
//      これが現状の最密 QR の Version であり、変えてはならない。
//   2. Version 26・誤り訂正 L のデータ容量は RS_BLOCKS_L[26] から
//      data codewords 合計 = 10 * 114 + 2 * 115 = 1,370 byte、
//      capacity bit = 1,370 * 8 = 10,960 bit。
//      Byte mode のオーバーヘッド（mode 指示子 4 bit + 文字数指示子 16 bit
//      ［Version 26 は 10 以上のため 16 bit］）を引くと
//      (10,960 - 4 - 16) / 8 = 1,367.5 → floor で 1,367 byte。
//   3. 1,367 byte は Version 25・L の容量（1,273 byte）を超えるため Version 26 を
//      選び続け、1,368 byte からは Version 27 が必要になる（未対応の Version）。
//      つまり 1,367 byte が「Version 26 のまま収まる最大値」＝新しい上限として
//      厳密に一致する。
// 1,024 → 1,367 で約 33.5%（≈ 30%）の容量増。

export const QR_ENCODER_MAX_BYTES = 1367;

export type QrEncodingErrorCode = 'DATA_TOO_LARGE' | 'INVALID_DATA';

export class QrEncodingError extends Error {
  readonly code: QrEncodingErrorCode;

  constructor(code: QrEncodingErrorCode, message: string) {
    super(message);
    this.name = 'QrEncodingError';
    this.code = code;
  }
}

export interface EncodedQr {
  readonly version: number;
  readonly errorCorrection: 'L';
  readonly matrix: readonly (readonly boolean[])[];
}

interface RsBlock {
  readonly totalCodewords: number;
  readonly dataCodewords: number;
}

type MutableCell = boolean | null;
type MutableMatrix = MutableCell[][];

// These private closed domains make every supported table lookup total.
const QR_VERSIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26,
] as const;
type QrVersion = (typeof QR_VERSIONS)[number];
const QR_MASKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
type QrMask = (typeof QR_MASKS)[number];
type RsBlockDefinition = readonly [
  count: number,
  totalCodewords: number,
  dataCodewords: number,
];

const ALIGNMENT_PATTERN_POSITIONS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90],
  21: [6, 28, 50, 72, 94],
  22: [6, 26, 50, 74, 98],
  23: [6, 30, 54, 78, 102],
  24: [6, 28, 54, 80, 106],
  25: [6, 32, 58, 84, 110],
  26: [6, 30, 58, 86, 114],
} as const satisfies Readonly<Record<QrVersion, readonly number[]>>;

// ISO/IEC 18004 Table 9（誤り訂正レベル L）の Reed-Solomon ブロック構成を
// Version 1〜26（旧 RS_BLOCKS_M と同じ Version 数）ぶん転記した正準値。
// 各 [count, totalCodewords, dataCodewords] は「同一構成のブロックが count 個」を表す
// （例: Version 8 は totalCodewords 121・dataCodewords 97 のブロックが 2 個で 1 group）。
// 転記値は下記 2 系統でそれぞれ独立に突合済み（ADR-0032）。
//   - Version ごとの data byte 容量（count * dataCodewords の合計）が、QR 規格でよく
//     参照される Byte mode 容量表（Version1 L=17 byte 〜 Version26 L=1,367 byte）と
//     一致すること。
//   - 本プロジェクトの devDependency ではない第三者 QR エンコーダ実装
//     （`toqr`、EC level enum 値が ISO の format info indicator と同じ 0=M/1=L/2=H/3=Q）
//     を一時スクリプトで実行し、各 Version の「収まる最大 byte 数」の境界が
//     この表からの計算値と全 Version で一致すること。
const RS_BLOCKS_L = {
  1: [[1, 26, 19]],
  2: [[1, 44, 34]],
  3: [[1, 70, 55]],
  4: [[1, 100, 80]],
  5: [[1, 134, 108]],
  6: [[2, 86, 68]],
  7: [[2, 98, 78]],
  8: [[2, 121, 97]],
  9: [[2, 146, 116]],
  10: [
    [2, 86, 68],
    [2, 87, 69],
  ],
  11: [[4, 101, 81]],
  12: [
    [2, 116, 92],
    [2, 117, 93],
  ],
  13: [[4, 133, 107]],
  14: [
    [3, 145, 115],
    [1, 146, 116],
  ],
  15: [
    [5, 109, 87],
    [1, 110, 88],
  ],
  16: [
    [5, 122, 98],
    [1, 123, 99],
  ],
  17: [
    [1, 135, 107],
    [5, 136, 108],
  ],
  18: [
    [5, 150, 120],
    [1, 151, 121],
  ],
  19: [
    [3, 141, 113],
    [4, 142, 114],
  ],
  20: [
    [3, 135, 107],
    [5, 136, 108],
  ],
  21: [
    [4, 144, 116],
    [4, 145, 117],
  ],
  22: [
    [2, 139, 111],
    [7, 140, 112],
  ],
  23: [
    [4, 151, 121],
    [5, 152, 122],
  ],
  24: [
    [6, 147, 117],
    [4, 148, 118],
  ],
  25: [
    [8, 132, 106],
    [4, 133, 107],
  ],
  26: [
    [10, 142, 114],
    [2, 143, 115],
  ],
} as const satisfies Readonly<Record<QrVersion, readonly RsBlockDefinition[]>>;

// The highest supported byte-mode capacity is the public admission limit.

class BitBuffer {
  private readonly bytes: number[];
  private bitLength: number;

  constructor() {
    this.bytes = [];
    this.bitLength = 0;
  }

  get length(): number {
    return this.bitLength;
  }

  put(value: number, length: number): void {
    for (let index = length - 1; index >= 0; index -= 1) {
      this.putBit(((value >>> index) & 1) === 1);
    }
  }

  putBit(value: boolean): void {
    const byteIndex = Math.floor(this.bitLength / 8);
    if (this.bytes.length <= byteIndex) this.bytes.push(0);
    if (value) {
      this.bytes[byteIndex] =
        (this.bytes[byteIndex] ?? 0) | (0x80 >>> (this.bitLength % 8));
    }
    this.bitLength += 1;
  }

  toBytes(): number[] {
    return [...this.bytes];
  }
}

function rsBlocks(version: QrVersion): RsBlock[] {
  const definition: readonly RsBlockDefinition[] = RS_BLOCKS_L[version];
  return definition.flatMap(([count, totalCodewords, dataCodewords]) =>
    Array.from({ length: count }, () => ({ totalCodewords, dataCodewords }))
  );
}

function dataCapacityBits(version: QrVersion): number {
  return rsBlocks(version).reduce(
    (sum, block) => sum + block.dataCodewords * 8,
    0
  );
}

function characterCountBits(version: QrVersion): number {
  return version < 10 ? 8 : 16;
}

function dataTooLargeError(): QrEncodingError {
  return new QrEncodingError(
    'DATA_TOO_LARGE',
    `QR encoder は ${QR_ENCODER_MAX_BYTES} byte 以下を扱います。`
  );
}

function chooseVersion(byteLength: number): QrVersion {
  for (const version of QR_VERSIONS) {
    const requiredBits = 4 + characterCountBits(version) + byteLength * 8;
    if (requiredBits <= dataCapacityBits(version)) return version;
  }
  throw dataTooLargeError();
}

function createDataBytes(data: Uint8Array, version: QrVersion): number[] {
  const capacity = dataCapacityBits(version);
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4);
  buffer.put(data.byteLength, characterCountBits(version));
  for (const byte of data) buffer.put(byte, 8);
  const terminatorLength = Math.min(4, capacity - buffer.length);
  if (terminatorLength > 0) buffer.put(0, terminatorLength);
  while (buffer.length % 8 !== 0) buffer.putBit(false);
  const bytes = buffer.toBytes();
  let pad = true;
  while (bytes.length * 8 < capacity) {
    bytes.push(pad ? 0xec : 0x11);
    pad = !pad;
  }
  return bytes;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if ((value & 0x100) !== 0) value ^= 0x11d;
  }
  for (let index = 255; index < GF_EXP.length; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255] ?? 0;
  }
}

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  const exponent = (GF_LOG[left] ?? 0) + (GF_LOG[right] ?? 0);
  return GF_EXP[exponent] ?? 0;
}

function generatorPolynomial(degree: number): number[] {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(result.length + 1).fill(0);
    const root = GF_EXP[index] ?? 0;
    for (let term = 0; term < result.length; term += 1) {
      const coefficient = result[term] ?? 0;
      next[term] = (next[term] ?? 0) ^ coefficient;
      next[term + 1] = (next[term + 1] ?? 0) ^ gfMultiply(coefficient, root);
    }
    result = next;
  }
  return result;
}

function errorCorrectionBytes(
  data: readonly number[],
  count: number
): number[] {
  const generator = generatorPolynomial(count);
  const remainder = new Array<number>(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    if (factor === 0) continue;
    for (let index = 0; index < count; index += 1) {
      remainder[index] =
        (remainder[index] ?? 0) ^ gfMultiply(generator[index + 1] ?? 0, factor);
    }
  }
  return remainder;
}

function interleavedCodewords(data: Uint8Array, version: QrVersion): number[] {
  const dataBytes = createDataBytes(data, version);
  const blocks = rsBlocks(version);
  const blockData: number[][] = [];
  const blockError: number[][] = [];
  let offset = 0;
  for (const block of blocks) {
    const current = dataBytes.slice(offset, offset + block.dataCodewords);
    offset += block.dataCodewords;
    blockData.push(current);
    blockError.push(
      errorCorrectionBytes(current, block.totalCodewords - block.dataCodewords)
    );
  }
  return interleaveBlocks(blockData, blockError);
}

function interleaveBlocks(
  dataBlocks: readonly (readonly number[])[],
  errorBlocks: readonly (readonly number[])[]
): number[] {
  const result: number[] = [];
  const maximumData = Math.max(...dataBlocks.map((block) => block.length));
  const maximumError = Math.max(...errorBlocks.map((block) => block.length));
  for (let index = 0; index < maximumData; index += 1) {
    for (const block of dataBlocks) {
      const value = block[index];
      if (value !== undefined) result.push(value);
    }
  }
  for (let index = 0; index < maximumError; index += 1) {
    for (const block of errorBlocks) {
      const value = block[index];
      if (value !== undefined) result.push(value);
    }
  }
  return result;
}

function emptyMatrix(size: number): MutableMatrix {
  return Array.from({ length: size }, () =>
    new Array<MutableCell>(size).fill(null)
  );
}

function setupFinder(matrix: MutableMatrix, row: number, column: number): void {
  const size = matrix.length;
  for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
      const target = matrix[row + rowOffset];
      const targetColumn = column + columnOffset;
      if (!target || targetColumn < 0 || targetColumn >= size) {
        continue;
      }
      const dark =
        rowOffset >= 0 &&
        rowOffset <= 6 &&
        columnOffset >= 0 &&
        columnOffset <= 6 &&
        (rowOffset === 0 ||
          rowOffset === 6 ||
          columnOffset === 0 ||
          columnOffset === 6 ||
          (rowOffset >= 2 &&
            rowOffset <= 4 &&
            columnOffset >= 2 &&
            columnOffset <= 4));
      target[targetColumn] = dark;
    }
  }
}

function placeAlignmentPattern(
  matrix: MutableMatrix,
  row: number,
  column: number
): void {
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      const target = matrix[row + rowOffset];
      if (target) {
        target[column + columnOffset] =
          Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== 1;
      }
    }
  }
}

function setupAlignmentPatterns(
  matrix: MutableMatrix,
  version: QrVersion
): void {
  const positions = ALIGNMENT_PATTERN_POSITIONS[version];
  for (const row of positions) {
    for (const column of positions) {
      if (matrix[row]?.[column] === null) {
        placeAlignmentPattern(matrix, row, column);
      }
    }
  }
}

function setupTimingPatterns(matrix: MutableMatrix): void {
  const horizontal = matrix[6];
  for (let index = 8; index < matrix.length - 8; index += 1) {
    const vertical = matrix[index];
    if (vertical && vertical[6] === null) vertical[6] = index % 2 === 0;
    if (horizontal && horizontal[index] === null) {
      horizontal[index] = index % 2 === 0;
    }
  }
}

function bchDigit(value: number): number {
  let digit = 0;
  let current = value;
  while (current !== 0) {
    digit += 1;
    current >>>= 1;
  }
  return digit;
}

// ISO/IEC 18004 の format information における誤り訂正レベル指標（2 bit）。
// L=01・M=00・Q=11・H=10 の順で固定されており、M（0b00）はこの 2 bit が 0 のため
// 従来 `bchTypeInfo(mask)`（指標 0 相当）でも偶然結果が一致していたが、L（0b01）は
// 指標が 0 ではないため、mask の上位に明示的に組み込まないと format info が壊れる
// （jsQR round-trip テストが検出する）。
const ERROR_CORRECTION_LEVEL_INDICATOR_L = 0b01;

function bchTypeInfo(value: number): number {
  let data = value << 10;
  const generator = 0x537;
  while (bchDigit(data) - bchDigit(generator) >= 0) {
    data ^= generator << (bchDigit(data) - bchDigit(generator));
  }
  return ((value << 10) | data) ^ 0x5412;
}

function bchVersionInfo(version: QrVersion): number {
  let data = version << 12;
  const generator = 0x1f25;
  while (bchDigit(data) - bchDigit(generator) >= 0) {
    data ^= generator << (bchDigit(data) - bchDigit(generator));
  }
  return (version << 12) | data;
}

function verticalTypeInfoRow(index: number, size: number): number {
  if (index < 6) return index;
  if (index < 8) return index + 1;
  return size - 15 + index;
}

function horizontalTypeInfoColumn(index: number, size: number): number {
  if (index < 8) return size - index - 1;
  if (index < 9) return 7;
  return 15 - index - 1;
}

function writeTypeInfoBit(
  matrix: MutableMatrix,
  index: number,
  dark: boolean
): void {
  const vertical = matrix[verticalTypeInfoRow(index, matrix.length)];
  if (vertical) vertical[8] = dark;
  const horizontal = matrix[8];
  if (horizontal) {
    horizontal[horizontalTypeInfoColumn(index, matrix.length)] = dark;
  }
}

function setupTypeInfo(
  matrix: MutableMatrix,
  mask: QrMask,
  test: boolean
): void {
  const bits = bchTypeInfo((ERROR_CORRECTION_LEVEL_INDICATOR_L << 3) | mask);
  for (let index = 0; index < 15; index += 1) {
    writeTypeInfoBit(matrix, index, !test && ((bits >>> index) & 1) === 1);
  }
  const size = matrix.length;
  const darkModuleRow = matrix[size - 8];
  if (darkModuleRow) darkModuleRow[8] = !test;
}

function setupVersionInfo(
  matrix: MutableMatrix,
  version: QrVersion,
  test: boolean
): void {
  if (version < 7) return;
  const bits = bchVersionInfo(version);
  const size = matrix.length;
  for (let index = 0; index < 18; index += 1) {
    const dark = !test && ((bits >>> index) & 1) === 1;
    const row = matrix[Math.floor(index / 3)];
    if (row) row[(index % 3) + size - 11] = dark;
    const mirroredRow = matrix[(index % 3) + size - 11];
    if (mirroredRow) mirroredRow[Math.floor(index / 3)] = dark;
  }
}

function maskBit(mask: QrMask, row: number, column: number): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    case 7:
      return (((row * column) % 3) + ((row + column) % 2)) % 2 === 0;
  }
}

interface MappingCursor {
  row: number;
  direction: number;
  byteIndex: number;
  bitIndex: number;
}

function writeMappedCell(
  matrix: MutableMatrix,
  codewords: readonly number[],
  mask: QrMask,
  column: number,
  cursor: MappingCursor
): void {
  const target = matrix[cursor.row];
  if (!target || target[column] !== null) return;
  const byte = codewords[cursor.byteIndex] ?? 0;
  const sourceDark = ((byte >>> cursor.bitIndex) & 1) === 1;
  target[column] = maskBit(mask, cursor.row, column) ? !sourceDark : sourceDark;
  cursor.bitIndex -= 1;
  if (cursor.bitIndex < 0) {
    cursor.byteIndex += 1;
    cursor.bitIndex = 7;
  }
}

function mapColumnPair(
  matrix: MutableMatrix,
  codewords: readonly number[],
  mask: QrMask,
  column: number,
  cursor: MappingCursor
): void {
  while (cursor.row >= 0 && cursor.row < matrix.length) {
    writeMappedCell(matrix, codewords, mask, column, cursor);
    writeMappedCell(matrix, codewords, mask, column - 1, cursor);
    cursor.row += cursor.direction;
  }
  cursor.row -= cursor.direction;
  cursor.direction = -cursor.direction;
}

function mapCodewords(
  matrix: MutableMatrix,
  codewords: readonly number[],
  mask: QrMask
): void {
  const cursor: MappingCursor = {
    row: matrix.length - 1,
    direction: -1,
    byteIndex: 0,
    bitIndex: 7,
  };
  for (let column = matrix.length - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    mapColumnPair(matrix, codewords, mask, column, cursor);
  }
}

function buildMatrix(
  version: QrVersion,
  codewords: readonly number[],
  mask: QrMask,
  test: boolean
): boolean[][] {
  const size = version * 4 + 17;
  const matrix = emptyMatrix(size);
  setupFinder(matrix, 0, 0);
  setupFinder(matrix, size - 7, 0);
  setupFinder(matrix, 0, size - 7);
  setupAlignmentPatterns(matrix, version);
  setupTimingPatterns(matrix);
  setupTypeInfo(matrix, mask, test);
  setupVersionInfo(matrix, version, test);
  mapCodewords(matrix, codewords, mask);
  return matrix.map((row) => row.map((cell) => cell === true));
}

function runPenalty(line: readonly boolean[]): number {
  let penalty = 0;
  let runLength = 1;
  for (let index = 1; index <= line.length; index += 1) {
    if (index < line.length && line[index] === line[index - 1]) {
      runLength += 1;
    } else {
      if (runLength >= 5) penalty += 3 + runLength - 5;
      runLength = 1;
    }
  }
  return penalty;
}

function adjacentPenalty(matrix: readonly (readonly boolean[])[]): number {
  let penalty = 0;
  for (let index = 0; index < matrix.length; index += 1) {
    penalty += runPenalty(matrix[index] ?? []);
    penalty += runPenalty(matrix.map((row) => row[index] ?? false));
  }
  return penalty;
}

function blockPenalty(matrix: readonly (readonly boolean[])[]): number {
  let penalty = 0;
  for (let row = 0; row < matrix.length - 1; row += 1) {
    for (let column = 0; column < matrix.length - 1; column += 1) {
      const count =
        Number(matrix[row]?.[column]) +
        Number(matrix[row + 1]?.[column]) +
        Number(matrix[row]?.[column + 1]) +
        Number(matrix[row + 1]?.[column + 1]);
      if (count === 0 || count === 4) penalty += 3;
    }
  }
  return penalty;
}

function finderLikePenalty(matrix: readonly (readonly boolean[])[]): number {
  const patterns = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ] as const;
  let penalty = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column <= matrix.length - 11; column += 1) {
      for (const pattern of patterns) {
        if (
          pattern.every(
            (value, index) => matrix[row]?.[column + index] === value
          )
        ) {
          penalty += 40;
        }
        if (
          pattern.every(
            (value, index) => matrix[column + index]?.[row] === value
          )
        ) {
          penalty += 40;
        }
      }
    }
  }
  return penalty;
}

function balancePenalty(matrix: readonly (readonly boolean[])[]): number {
  let dark = 0;
  for (const row of matrix) {
    for (const cell of row) if (cell) dark += 1;
  }
  const total = matrix.length * matrix.length;
  return Math.floor(Math.abs((100 * dark) / total - 50) / 5) * 10;
}

function penalty(matrix: readonly (readonly boolean[])[]): number {
  return (
    adjacentPenalty(matrix) +
    blockPenalty(matrix) +
    finderLikePenalty(matrix) +
    balancePenalty(matrix)
  );
}

function bestMatrix(
  version: QrVersion,
  codewords: readonly number[]
): boolean[][] {
  let selectedMask: QrMask = QR_MASKS[0];
  let selectedPenalty = Number.POSITIVE_INFINITY;
  for (const mask of QR_MASKS) {
    const candidate = buildMatrix(version, codewords, mask, true);
    const candidatePenalty = penalty(candidate);
    if (candidatePenalty < selectedPenalty) {
      selectedMask = mask;
      selectedPenalty = candidatePenalty;
    }
  }
  return buildMatrix(version, codewords, selectedMask, false);
}

export function encodeQr(value: string): EncodedQr {
  // UTF-8 byte 数は UTF-16 code unit 数を下回らないため、encode 前に確実な超過を弾ける。
  if (value.length > QR_ENCODER_MAX_BYTES) {
    throw dataTooLargeError();
  }
  const data = new TextEncoder().encode(value);
  const version = chooseVersion(data.byteLength);
  const codewords = interleavedCodewords(data, version);
  return {
    version,
    errorCorrection: 'L',
    matrix: bestMatrix(version, codewords),
  };
}
