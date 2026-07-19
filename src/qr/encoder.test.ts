import { describe, expect, it } from 'bun:test';
import jsQR, { type QRCode } from 'jsqr';
import { QR_PAYLOAD_MAX_BYTES } from '../protocol/qr-payload';
import { encodeQr, QR_ENCODER_MAX_BYTES, QrEncodingError } from './encoder';

function rows(matrix: readonly (readonly boolean[])[]): string[] {
  return matrix.map((row) => row.map((cell) => (cell ? '1' : '0')).join(''));
}

const QUIET_ZONE_MODULES = 4;
const PIXELS_PER_MODULE = 4;

interface RasterizedQr {
  readonly pixels: Uint8ClampedArray;
  readonly widthInPixels: number;
}

function rasterize(matrix: readonly (readonly boolean[])[]): RasterizedQr {
  const widthInModules = matrix.length + QUIET_ZONE_MODULES * 2;
  const widthInPixels = widthInModules * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(widthInPixels * widthInPixels * 4);
  for (let y = 0; y < widthInPixels; y += 1) {
    for (let x = 0; x < widthInPixels; x += 1) {
      const row = Math.floor(y / PIXELS_PER_MODULE) - QUIET_ZONE_MODULES;
      const column = Math.floor(x / PIXELS_PER_MODULE) - QUIET_ZONE_MODULES;
      const luminance = matrix[row]?.[column] === true ? 0 : 255;
      const offset = (y * widthInPixels + x) * 4;
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
      pixels[offset + 3] = 255;
    }
  }
  return { pixels, widthInPixels };
}

function decodeWithJsQr(
  matrix: readonly (readonly boolean[])[]
): QRCode | null {
  const { pixels, widthInPixels } = rasterize(matrix);
  return jsQR(pixels, widthInPixels, widthInPixels);
}

function utf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function captureError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

function expectDataTooLarge(captured: unknown): void {
  expect(captured).toBeInstanceOf(QrEncodingError);
  if (captured instanceof QrEncodingError) {
    expect(captured.code).toBe('DATA_TOO_LARGE');
  }
}

describe('QR Code Model 2 byte mode encoder', () => {
  it('既知入力 HELLO WORLD を Version 1・誤り訂正 M の既知 matrix にする', () => {
    const qr = encodeQr('HELLO WORLD');

    expect(qr.version).toBe(1);
    expect(qr.errorCorrection).toBe('M');
    expect(rows(qr.matrix)).toEqual([
      '111111101100101111111',
      '100000100001001000001',
      '101110100101001011101',
      '101110101001001011101',
      '101110101110101011101',
      '100000101001001000001',
      '111111101010101111111',
      '000000001001100000000',
      '100010111111011111001',
      '000100001011100001111',
      '001111110011011010010',
      '111110001100010000000',
      '111110101010101100110',
      '000000001010111101011',
      '111111101110101011010',
      '100000100101110110011',
      '101110101101011000110',
      '101110100100100011011',
      '101110100111000111000',
      '100000100001010000000',
      '111111101111111110101',
    ]);
  });

  it('日本語 UTF-8 入力も同じ入力なら同じ matrix を返す', () => {
    expect(encodeQr('招待 QR')).toEqual(encodeQr('招待 QR'));
  });

  it('入力 byte 数に必要な最小 Version を選ぶ', () => {
    expect(encodeQr('a'.repeat(14)).version).toBe(1);
    expect(encodeQr('a'.repeat(15)).version).toBe(2);
    expect(encodeQr('a'.repeat(1024)).version).toBe(26);
  });

  it('encoder の上限は QR wire format の上限と一致する', () => {
    expect(QR_ENCODER_MAX_BYTES).toBe(QR_PAYLOAD_MAX_BYTES);
  });

  it('1,024 byte を超える入力を型付き Error にする', () => {
    expectDataTooLarge(captureError(() => encodeQr('a'.repeat(1025))));
  });

  it('文字数は上限以下でも UTF-8 byte 数が 1,024 byte を超える多バイト入力を型付き Error にする', () => {
    const input = 'あ'.repeat(400);

    expect(input.length).toBeLessThanOrEqual(1024);
    expectDataTooLarge(captureError(() => encodeQr(input)));
  });

  it('孤立サロゲートは TextEncoder が U+FFFD へ正規化するため置換文字と同じ matrix になる', () => {
    expect(encodeQr('\ud800')).toEqual(encodeQr('�'));
  });
});

describe('jsQR による round-trip 検証', () => {
  it('ASCII 入力 HELLO WORLD を Version 1 で encode し jsQR が同じ文字列に実デコードする', () => {
    const input = 'HELLO WORLD';

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(1);
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
    expect(decoded?.data).toBe(input);
  });

  it('日本語 UTF-8 入力を encode し jsQR が同じ UTF-8 byte 列に実デコードする', () => {
    const input = '天下クラウドパスポート QR 招待';

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
  });

  it('1,024 byte 境界の入力を Version 26 で encode し jsQR が同じ byte 列に実デコードする', () => {
    const input = 'a'.repeat(1024);

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(26);
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
    expect(decoded?.data).toBe(input);
  });

  it('絵文字を含むサロゲートペア入力を encode し jsQR が同じ UTF-8 byte 列に実デコードする', () => {
    const input = '招待🎌';

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
  });

  it('文字数指示子が 8 bit から 16 bit に切り替わる 180 / 181 byte 境界を実デコードできる', () => {
    const beforeInput = 'a'.repeat(180);
    const afterInput = 'a'.repeat(181);

    const beforeBoundary = encodeQr(beforeInput);
    const afterBoundary = encodeQr(afterInput);

    expect(beforeBoundary.version).toBe(9);
    expect(afterBoundary.version).toBe(10);
    expect(decodeWithJsQr(beforeBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(beforeInput)
    );
    expect(decodeWithJsQr(afterBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(afterInput)
    );
  });

  it('version 情報ブロックが初めて現れる 106 / 107 byte 境界を実デコードできる', () => {
    const beforeInput = 'a'.repeat(106);
    const afterInput = 'a'.repeat(107);

    const beforeBoundary = encodeQr(beforeInput);
    const afterBoundary = encodeQr(afterInput);

    expect(beforeBoundary.version).toBe(6);
    expect(afterBoundary.version).toBe(7);
    expect(decodeWithJsQr(beforeBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(beforeInput)
    );
    expect(decodeWithJsQr(afterBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(afterInput)
    );
  });

  it('空文字列を Version 1 の 21x21 matrix にし jsQR が空 payload に実デコードする', () => {
    const qr = encodeQr('');
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(1);
    expect(qr.matrix.length).toBe(21);
    for (const row of qr.matrix) {
      expect(row.length).toBe(21);
    }
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual([]);
    expect(decoded?.data).toBe('');
  });
});
