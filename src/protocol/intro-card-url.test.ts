import { describe, expect, it } from 'bun:test';
import jsQR from 'jsqr';
import type { IntroCard } from '../domain/intro-card';
import { IntroCardError } from '../domain/intro-card';
import { encodeQr, QR_ENCODER_MAX_BYTES } from '../qr/encoder';
import {
  decodeIntroCardUrlFragment,
  encodeIntroCardUrl,
  INTRO_CARD_VIEWER_URL,
  introCardUrlByteLength,
} from './intro-card-url';

/**
 * 画素化ヘルパは `src/qr/encoder.test.ts` / `src/protocol/vcard.test.ts` の
 * `rasterize` を手本にする。テストファイル間で共有する module 境界を持たないため、
 * この repo の既存 test file の慣行どおりここに閉じたコピーを置く。
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

function decodeUrlQr(url: string): string | null {
  const encoded = encodeQr(url);
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

function fragmentOf(url: string): string {
  const hashIndex = url.indexOf('#');
  expect(hashIndex).toBeGreaterThan(-1);
  return url.slice(hashIndex + 1);
}

/**
 * `decodeIntroCardUrlFragment` は攻撃者が作った任意のフラグメントも受け取り得るため、
 * 不正入力テストは本物の `encodeIntroCardUrl` の出力を経由せず、独立した base64url
 * エンコードで fixture を組み立てる（production の base64url 実装への依存を避ける）。
 */
const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const byte0 = bytes[index] ?? 0;
    const byte1 = bytes[index + 1];
    const byte2 = bytes[index + 2];
    const chunk = (byte0 << 16) | ((byte1 ?? 0) << 8) | (byte2 ?? 0);
    output += BASE64URL_ALPHABET.charAt((chunk >> 18) & 0x3f);
    output += BASE64URL_ALPHABET.charAt((chunk >> 12) & 0x3f);
    output +=
      byte1 === undefined ? '' : BASE64URL_ALPHABET.charAt((chunk >> 6) & 0x3f);
    output +=
      byte2 === undefined ? '' : BASE64URL_ALPHABET.charAt(chunk & 0x3f);
  }
  return output;
}

function toBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function expectInvalidShareUrl(captured: unknown): void {
  expect(captured).toBeInstanceOf(IntroCardError);
  if (captured instanceof IntroCardError) {
    expect(captured.code).toBe('INVALID_SHARE_URL');
  }
}

const FULL_CARD: IntroCard = {
  name: '田中太郎',
  title: 'Engineer',
  organization: 'TenkaCloud',
  selfIntro: 'LT 登壇者です。🎤',
  links: ['https://github.com/example', 'https://x.com/example'],
  email: 'taro@example.com',
  phone: '090-1234-5678',
};

describe('encodeIntroCardUrl', () => {
  it('name だけの最小カードから INTRO_CARD_VIEWER_URL#<base64url JSON> を組み立てる', () => {
    const url = encodeIntroCardUrl({ name: '田中太郎' });

    expect(url.startsWith(`${INTRO_CARD_VIEWER_URL}#`)).toBe(true);
    expect(decodeIntroCardUrlFragment(fragmentOf(url))).toEqual({
      name: '田中太郎',
    });
  });

  it('全項目・日本語・絵文字を含むカードを decode すると同じ内容へ復元する', () => {
    const url = encodeIntroCardUrl(FULL_CARD);

    expect(decodeIntroCardUrlFragment(fragmentOf(url))).toEqual(FULL_CARD);
  });

  it('vCard 直埋め版とは独立した family であり TCPQ prefix を持たない', () => {
    const url = encodeIntroCardUrl(FULL_CARD);

    expect(url.startsWith('TCPQ')).toBe(false);
  });

  it('URL 全体が 1,367 byte を超える場合、項目別内訳を持つ CARD_TOO_LARGE を投げる', () => {
    const oversizedSelfIntro = 'a'.repeat(2000);
    const card: IntroCard = { name: 'A', selfIntro: oversizedSelfIntro };

    const error = captureError(() => encodeIntroCardUrl(card));

    expect(error).toBeInstanceOf(IntroCardError);
    if (error instanceof IntroCardError) {
      expect(error.code).toBe('CARD_TOO_LARGE');
      expect(error.message).toContain('byte');
      expect(error.message).toContain('s ');
      // 値そのもの（自己紹介の内容）を message に含めない。
      expect(error.message).not.toContain(oversizedSelfIntro);
    }
  });

  it('jsQR で実際に読み取れる QR を生成し、読み取った URL の fragment を decode すると元のカードに戻る', () => {
    const url = encodeIntroCardUrl(FULL_CARD);

    const decodedUrl = decodeUrlQr(url);

    expect(decodedUrl).toBe(url);
    expect(decodeIntroCardUrlFragment(fragmentOf(decodedUrl ?? ''))).toEqual(
      FULL_CARD
    );
  });

  it('名前・肩書・会社（日本語）＋長文自己紹介＋会社 URL 2 本＋メールの日本語フルカードでも throw しない（Issue 121）', () => {
    // owner が「会社 URL を 2 つ入れるとサイズオーバーになる」と報告した構成の再現
    // ケース（ADR-0032）。280 文字の日本語自己紹介＋肩書・会社名（日本語）＋会社 URL
    // 2 本（各 ~25 文字）＋メールを合わせると 1,351 byte になり、旧 EC-M /
    // QR_ENCODER_MAX_BYTES = 1,024 byte では超過して throw していたが、誤り訂正 L 化後の
    // 1,367 byte 上限では余裕を持って収まる。
    const selfIntro =
      '弊社では分散システムと生成AIを組み合わせたプロダクト開発に取り組んでいます。'
        .repeat(10)
        .slice(0, 280);
    const card: IntroCard = {
      name: '田中太郎',
      title: '最高技術責任者',
      organization: '天下クラウド株式会社',
      selfIntro,
      links: ['https://tenkacloud.com', 'https://bull.example'],
      email: 'taro@tenkacloud.com',
    };

    expect(selfIntro.length).toBe(280);
    expect(introCardUrlByteLength(card)).toBeGreaterThan(1024);
    expect(introCardUrlByteLength(card)).toBeLessThanOrEqual(
      QR_ENCODER_MAX_BYTES
    );
    expect(() => encodeIntroCardUrl(card)).not.toThrow();
  });
});

describe('introCardUrlByteLength', () => {
  it('encodeIntroCardUrl と同じ byte 数を返す（1,367 byte 以内）', () => {
    const card: IntroCard = { name: '田中太郎', title: 'Engineer' };

    expect(introCardUrlByteLength(card)).toBe(
      byteLength(encodeIntroCardUrl(card))
    );
  });

  it('1,367 byte を超える draft でも例外を投げず実際の byte 数を返す', () => {
    const oversizedCard: IntroCard = {
      name: 'A',
      selfIntro: 'a'.repeat(2000),
    };

    const usage = introCardUrlByteLength(oversizedCard);

    expect(usage).toBeGreaterThan(QR_ENCODER_MAX_BYTES);
  });
});

describe('decodeIntroCardUrlFragment', () => {
  it('base64url に使えない文字を含む場合 INVALID_SHARE_URL を投げる', () => {
    const error = captureError(() => decodeIntroCardUrlFragment('not!valid*'));

    expectInvalidShareUrl(error);
  });

  it('base64url の残り文字数が 1（不正な長さ）の場合 INVALID_SHARE_URL を投げる', () => {
    const error = captureError(() => decodeIntroCardUrlFragment('AAAAA'));

    expectInvalidShareUrl(error);
  });

  it('base64url としては正しいが JSON として不正な場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = toBase64Url('this is not json');

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('base64url としては正しいが不正な UTF-8 byte 列の場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = bytesToBase64Url(Uint8Array.from([0xff, 0xfe]));

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('JSON だが object でない場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = toBase64Url(JSON.stringify(['not', 'an', 'object']));

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('v（version）が 1 以外の場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = toBase64Url(JSON.stringify({ v: 2, n: '田中太郎' }));

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('必須の n（name）が欠けている場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = toBase64Url(JSON.stringify({ v: 1 }));

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('未知の field を含む場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = toBase64Url(
      JSON.stringify({ v: 1, n: '田中太郎', unknown: 'x' })
    );

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('l（links）が string の配列でない場合 INVALID_SHARE_URL を投げる', () => {
    const fragment = toBase64Url(
      JSON.stringify({ v: 1, n: '田中太郎', l: [123] })
    );

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expectInvalidShareUrl(error);
  });

  it('スキーマは正しいが domain の妥当性を満たさない場合 createIntroCard 由来の IntroCardError をそのまま伝える', () => {
    const fragment = toBase64Url(JSON.stringify({ v: 1, n: '   ' }));

    const error = captureError(() => decodeIntroCardUrlFragment(fragment));

    expect(error).toBeInstanceOf(IntroCardError);
    if (error instanceof IntroCardError) {
      expect(error.code).toBe('NAME_REQUIRED');
    }
  });
});
