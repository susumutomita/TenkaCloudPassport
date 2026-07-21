import { describe, expect, it } from 'bun:test';
import {
  decodeRgbaPng,
  encodeRgbaPng,
  PNG_COLOR_TYPE_RGBA,
} from './png-encoder';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function pixelAt(
  decoded: ReturnType<typeof decodeRgbaPng>,
  x: number,
  y: number
) {
  const index = (y * decoded.width + x) * 4;
  return {
    r: decoded.rgba[index],
    g: decoded.rgba[index + 1],
    b: decoded.rgba[index + 2],
    a: decoded.rgba[index + 3],
  };
}

describe('encodeRgbaPng / decodeRgbaPng', () => {
  it('PNG signature を正しいバイト列で書き出す', () => {
    const rgba = new Uint8Array(2 * 2 * 4);
    const png = encodeRgbaPng(2, 2, rgba);

    expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it('IHDR に width / height / bitDepth 8 / colorType RGBA を記録する', () => {
    const rgba = new Uint8Array(5 * 3 * 4);
    const png = encodeRgbaPng(5, 3, rgba);
    const decoded = decodeRgbaPng(png);

    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(3);
    expect(decoded.bitDepth).toBe(8);
    expect(decoded.colorType).toBe(PNG_COLOR_TYPE_RGBA);
  });

  it('単色 2x2 画像を encode すると、decode した全ピクセルが同じ色になる（round-trip）', () => {
    const rgba = new Uint8Array(2 * 2 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 0x1d;
      rgba[i + 1] = 0x1d;
      rgba[i + 2] = 0x1f;
      rgba[i + 3] = 255;
    }
    const decoded = decodeRgbaPng(encodeRgbaPng(2, 2, rgba));

    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        expect(pixelAt(decoded, x, y)).toEqual({
          r: 0x1d,
          g: 0x1d,
          b: 0x1f,
          a: 255,
        });
      }
    }
  });

  it('市松模様 4x4 画像を encode すると、座標ごとに期待した色が decode される（round-trip）', () => {
    const width = 4;
    const height = 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const isWhite = (x + y) % 2 === 0;
        const value = isWhite ? 255 : 0;
        rgba[index] = value;
        rgba[index + 1] = value;
        rgba[index + 2] = value;
        rgba[index + 3] = 255;
      }
    }
    const decoded = decodeRgbaPng(encodeRgbaPng(width, height, rgba));

    expect(pixelAt(decoded, 0, 0)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(pixelAt(decoded, 1, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(pixelAt(decoded, 3, 3)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(pixelAt(decoded, 2, 2)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });

  it('width が正の整数でなければ Error を投げる', () => {
    expect(() => encodeRgbaPng(0, 4, new Uint8Array(0))).toThrow(
      'width は正の整数にする: 0'
    );
    expect(() => encodeRgbaPng(1.5, 4, new Uint8Array(24))).toThrow(
      /width は正の整数にする/
    );
  });

  it('height が正の整数でなければ Error を投げる', () => {
    expect(() => encodeRgbaPng(4, 0, new Uint8Array(0))).toThrow(
      'height は正の整数にする: 0'
    );
  });

  it('rgba の長さが width*height*4 と一致しなければ Error を投げる', () => {
    expect(() => encodeRgbaPng(2, 2, new Uint8Array(4))).toThrow(
      'rgba の長さが width*height*4 と一致しない: expected=16 actual=4'
    );
  });

  it('PNG signature が壊れていれば decodeRgbaPng は Error を投げる', () => {
    const png = encodeRgbaPng(1, 1, new Uint8Array(4));
    const corrupted = Uint8Array.from(png);
    corrupted[0] = 0;

    expect(() => decodeRgbaPng(corrupted)).toThrow(
      'PNG signature mismatch at byte 0'
    );
  });
});
