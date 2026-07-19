export const QR_ENCODER_MAX_BYTES = 1024;

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
  readonly errorCorrection: 'M';
  readonly matrix: readonly (readonly boolean[])[];
}

interface RsBlock {
  readonly totalCodewords: number;
  readonly dataCodewords: number;
}

type MutableCell = boolean | null;
type MutableMatrix = MutableCell[][];

const ALIGNMENT_PATTERN_POSITIONS: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
];

const RS_BLOCKS_M: readonly (readonly (readonly [number, number, number])[])[] =
  [
    [[1, 26, 16]],
    [[1, 44, 28]],
    [[1, 70, 44]],
    [[2, 50, 32]],
    [[2, 67, 43]],
    [[4, 43, 27]],
    [[4, 49, 31]],
    [
      [2, 60, 38],
      [2, 61, 39],
    ],
    [
      [3, 58, 36],
      [2, 59, 37],
    ],
    [
      [4, 69, 43],
      [1, 70, 44],
    ],
    [
      [1, 80, 50],
      [4, 81, 51],
    ],
    [
      [6, 58, 36],
      [2, 59, 37],
    ],
    [
      [8, 59, 37],
      [1, 60, 38],
    ],
    [
      [4, 64, 40],
      [5, 65, 41],
    ],
    [
      [5, 65, 41],
      [5, 66, 42],
    ],
    [
      [7, 73, 45],
      [3, 74, 46],
    ],
    [
      [10, 74, 46],
      [1, 75, 47],
    ],
    [
      [9, 69, 43],
      [4, 70, 44],
    ],
    [
      [3, 70, 44],
      [11, 71, 45],
    ],
    [
      [3, 67, 41],
      [13, 68, 42],
    ],
    [[17, 68, 42]],
    [[17, 74, 46]],
    [
      [4, 75, 47],
      [14, 76, 48],
    ],
    [
      [6, 73, 45],
      [14, 74, 46],
    ],
    [
      [8, 75, 47],
      [13, 76, 48],
    ],
    [
      [19, 74, 46],
      [4, 75, 47],
    ],
  ];

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

function rsBlocks(version: number): RsBlock[] {
  const definition = RS_BLOCKS_M[version - 1];
  if (!definition) {
    throw new QrEncodingError(
      'INVALID_DATA',
      '対応する QR Version がありません。'
    );
  }
  return definition.flatMap(([count, totalCodewords, dataCodewords]) =>
    Array.from({ length: count }, () => ({ totalCodewords, dataCodewords }))
  );
}

function dataCapacityBits(version: number): number {
  return rsBlocks(version).reduce(
    (sum, block) => sum + block.dataCodewords * 8,
    0
  );
}

function characterCountBits(version: number): number {
  return version < 10 ? 8 : 16;
}

function dataTooLargeError(): QrEncodingError {
  return new QrEncodingError(
    'DATA_TOO_LARGE',
    `QR encoder は ${QR_ENCODER_MAX_BYTES} byte 以下を扱います。`
  );
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= RS_BLOCKS_M.length; version += 1) {
    const requiredBits = 4 + characterCountBits(version) + byteLength * 8;
    if (requiredBits <= dataCapacityBits(version)) return version;
  }
  throw dataTooLargeError();
}

function createDataBytes(data: Uint8Array, version: number): number[] {
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

function interleavedCodewords(data: Uint8Array, version: number): number[] {
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

function setupAlignmentPatterns(matrix: MutableMatrix, version: number): void {
  const positions = ALIGNMENT_PATTERN_POSITIONS[version - 1] ?? [];
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

function bchTypeInfo(value: number): number {
  let data = value << 10;
  const generator = 0x537;
  while (bchDigit(data) - bchDigit(generator) >= 0) {
    data ^= generator << (bchDigit(data) - bchDigit(generator));
  }
  return ((value << 10) | data) ^ 0x5412;
}

function bchVersionInfo(version: number): number {
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
  mask: number,
  test: boolean
): void {
  const bits = bchTypeInfo(mask);
  for (let index = 0; index < 15; index += 1) {
    writeTypeInfoBit(matrix, index, !test && ((bits >>> index) & 1) === 1);
  }
  const size = matrix.length;
  const darkModuleRow = matrix[size - 8];
  if (darkModuleRow) darkModuleRow[8] = !test;
}

function setupVersionInfo(
  matrix: MutableMatrix,
  version: number,
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

function maskBit(mask: number, row: number, column: number): boolean {
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
    default:
      throw new QrEncodingError('INVALID_DATA', 'QR mask が不正です。');
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
  mask: number,
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
  mask: number,
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
  mask: number
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
  version: number,
  codewords: readonly number[],
  mask: number,
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
  version: number,
  codewords: readonly number[]
): boolean[][] {
  let selectedMask = 0;
  let selectedPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
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
  if (data.byteLength > QR_ENCODER_MAX_BYTES) {
    throw dataTooLargeError();
  }
  const version = chooseVersion(data.byteLength);
  const codewords = interleavedCodewords(data, version);
  return {
    version,
    errorCorrection: 'M',
    matrix: bestMatrix(version, codewords),
  };
}
