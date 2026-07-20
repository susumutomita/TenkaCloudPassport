import { describe, expect, it } from 'bun:test';
import jsQR from 'jsqr';
import type { IntroCard } from '../domain/intro-card';
import { IntroCardError } from '../domain/intro-card';
import { encodeQr, QR_ENCODER_MAX_BYTES } from '../qr/encoder';
import { encodeVCard, vCardByteLength } from './vcard';

/**
 * 画素化ヘルパは `src/qr/encoder.test.ts` の `rasterize` を手本にする（Issue 79
 * 詳細設計）。テストファイル間で共有する module 境界を持たないため、この repo の
 * 既存 test file の慣行どおりここに閉じたコピーを置く。
 */
const QUIET_ZONE_MODULES = 4;
const PIXELS_PER_MODULE = 4;

function rasterize(matrix: readonly (readonly boolean[])[]): {
  readonly pixels: Uint8ClampedArray;
  readonly widthInPixels: number;
} {
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

function decodeVCardQr(vcard: string): string | null {
  const encoded = encodeQr(vcard);
  const { pixels, widthInPixels } = rasterize(encoded.matrix);
  return jsQR(pixels, widthInPixels, widthInPixels)?.data ?? null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function captureError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

describe('encodeVCard', () => {
  it('name だけのカードから BEGIN/VERSION/N/FN/END の 5 行を CRLF 区切りで組み立てる', () => {
    const vcard = encodeVCard({ name: '田中太郎' });

    expect(vcard).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nN:田中太郎;;;;\r\nFN:田中太郎\r\nEND:VCARD\r\n'
    );
  });

  it('全項目を入力すると、ORG/TITLE/TEL/EMAIL/URL/NOTE をこの順で行に追加する', () => {
    const card: IntroCard = {
      name: '田中太郎',
      title: 'Engineer',
      organization: 'TenkaCloud',
      selfIntro: 'LT 登壇者です。',
      links: ['https://github.com/example', 'https://x.com/example'],
      email: 'taro@example.com',
      phone: '090-1234-5678',
    };

    const vcard = encodeVCard(card);
    const lines = vcard.split('\r\n');

    expect(lines).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:田中太郎;;;;',
      'FN:田中太郎',
      'ORG:TenkaCloud',
      'TITLE:Engineer',
      'TEL;TYPE=CELL:090-1234-5678',
      'EMAIL:taro@example.com',
      'URL:https://github.com/example',
      'URL:https://x.com/example',
      'NOTE:LT 登壇者です。',
      'END:VCARD',
      '',
    ]);
  });

  it('自己紹介中のバックスラッシュ・カンマ・セミコロン・改行を RFC 6350 に沿ってエスケープする', () => {
    const vcard = encodeVCard({
      name: '田中太郎',
      selfIntro: 'A\\B,C;D\nE',
    });

    expect(vcard).toContain('NOTE:A\\\\B\\,C\\;D\\nE\r\n');
  });

  it('バックスラッシュを最初に変換し、他の置換で生成した \\ を二重エスケープしない', () => {
    const vcard = encodeVCard({ name: '田中太郎', selfIntro: ',' });

    expect(vcard).toContain('NOTE:\\,\r\n');
  });

  it('氏名に含まれるセミコロンをエスケープし、N の要素区切りと混同しない', () => {
    const vcard = encodeVCard({ name: 'Doe; John' });

    expect(vcard).toContain('N:Doe\\; John;;;;\r\n');
    expect(vcard).toContain('FN:Doe\\; John\r\n');
  });

  it('vCard がちょうど 1,024 byte の場合は例外を投げない', () => {
    const base = encodeVCard({ name: 'A' });
    const overhead = byteLength('NOTE:\r\n');
    const padLength = QR_ENCODER_MAX_BYTES - byteLength(base) - overhead;
    const card: IntroCard = { name: 'A', selfIntro: 'a'.repeat(padLength) };

    const vcard = encodeVCard(card);

    expect(byteLength(vcard)).toBe(QR_ENCODER_MAX_BYTES);
  });

  it('vCard が 1,024 byte を 1 byte でも超える場合、項目名と byte 数の内訳を持つ CARD_TOO_LARGE を投げる', () => {
    const base = encodeVCard({ name: 'A' });
    const overhead = byteLength('NOTE:\r\n');
    const padLength = QR_ENCODER_MAX_BYTES - byteLength(base) - overhead + 1;
    const selfIntroMarker = 'a'.repeat(padLength);
    const card: IntroCard = { name: 'A', selfIntro: selfIntroMarker };

    const error = captureError(() => encodeVCard(card));

    expect(error).toBeInstanceOf(IntroCardError);
    if (error instanceof IntroCardError) {
      expect(error.code).toBe('CARD_TOO_LARGE');
      expect(error.message).toContain('NOTE');
      expect(error.message).toContain('byte');
      // 値そのもの（自己紹介の内容）を message に含めない。
      expect(error.message).not.toContain(selfIntroMarker);
    }
  });

  it('vCardByteLength は encodeVCard と同じ byte 数を返す（1,024 byte 以内）', () => {
    const card: IntroCard = { name: '田中太郎', title: 'Engineer' };

    expect(vCardByteLength(card)).toBe(byteLength(encodeVCard(card)));
  });

  it('vCardByteLength は 1,024 byte を超える draft でも例外を投げず実際の byte 数を返す', () => {
    const overSizedCard: IntroCard = {
      name: '田中太郎',
      selfIntro: 'あ'.repeat(1000),
    };

    const length = vCardByteLength(overSizedCard);

    expect(length).toBeGreaterThan(QR_ENCODER_MAX_BYTES);
    expect(() => encodeVCard(overSizedCard)).toThrow(IntroCardError);
  });

  it('ASCII の全項目カードは encodeQr → jsQR の round-trip で同じ vCard 文字列に実デコードする', () => {
    const card: IntroCard = {
      name: 'Taro Tanaka',
      title: 'Engineer',
      organization: 'TenkaCloud',
      selfIntro: 'Speaking about local-first apps.',
      links: ['https://github.com/example', 'https://x.com/example'],
      email: 'taro@example.com',
      phone: '090-1234-5678',
    };
    const vcard = encodeVCard(card);

    const decoded = decodeVCardQr(vcard);

    expect(decoded).toBe(vcard);
  });

  it('日本語を含むカードは encodeQr → jsQR の round-trip で同じ UTF-8 byte 列に実デコードする', () => {
    const vcard = encodeVCard({
      name: '田中太郎',
      selfIntro: 'LT 登壇者です。よろしくお願いします。',
    });

    const decoded = decodeVCardQr(vcard);

    expect(decoded).toBe(vcard);
  });
});
