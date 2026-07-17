/**
 * M1 は実カメラでの読取を持たないため（architect guidance）、ここでの「QR」は
 * 標準準拠のスキャン可能な行列ではなく、Payload から決定論的に導出した視覚表現である。
 * 依存追加を避けつつ、Screenshot 時に Payload の内容が判読できないことも保証する。
 */
export const QR_MATRIX_SIZE = 16;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * FNV-1a は乗数が奇数のため最下位 bit が最終文字の偶奇にしか依存せず、そのまま
 * 使うと近い Payload 同士で Cell の偶奇が揃ってしまう（弱い avalanche）。
 * MurmurHash3 の finalizer と同じ mix 手順を通し、抽出する bit 位置に依らず
 * 十分な拡散を持たせる。
 */
function avalanche(value: number): number {
  let mixed = value;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function buildQrMatrix(
  payload: string,
  size: number = QR_MATRIX_SIZE
): readonly (readonly boolean[])[] {
  if (!Number.isInteger(size) || size < 8) {
    throw new RangeError('QR Matrix のサイズは 8 以上の整数にしてください。');
  }
  const rows: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: boolean[] = [];
    for (let column = 0; column < size; column += 1) {
      cells.push(avalanche(fnv1a(`${payload}:${row}:${column}`)) % 2 === 0);
    }
    rows.push(cells);
  }
  return rows;
}
