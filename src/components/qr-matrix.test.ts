import { describe, expect, it } from 'bun:test';
import { buildQrMatrix, QR_MATRIX_SIZE } from './qr-matrix';

describe('QR 視覚表現の決定論的 Matrix 生成', () => {
  it('既定サイズで正方形の Matrix を返す', () => {
    const matrix = buildQrMatrix('TCPQ1:{"a":1}');

    expect(matrix).toHaveLength(QR_MATRIX_SIZE);
    for (const row of matrix) {
      expect(row).toHaveLength(QR_MATRIX_SIZE);
    }
  });

  it('同じ Payload なら同じ Matrix を返す', () => {
    const first = buildQrMatrix('same-payload');
    const second = buildQrMatrix('same-payload');

    expect(second).toEqual(first);
  });

  it('異なる Payload なら異なる Matrix を返す', () => {
    const first = buildQrMatrix('payload-one');
    const second = buildQrMatrix('payload-two');

    expect(second).not.toEqual(first);
  });

  it('指定したサイズの Matrix を返す', () => {
    const matrix = buildQrMatrix('payload', 10);

    expect(matrix).toHaveLength(10);
    expect(matrix[0]).toHaveLength(10);
  });

  it('8 未満のサイズを拒否する', () => {
    expect(() => buildQrMatrix('payload', 7)).toThrow(RangeError);
  });

  it('整数でないサイズを拒否する', () => {
    expect(() => buildQrMatrix('payload', 8.5)).toThrow(RangeError);
  });
});
