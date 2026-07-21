import {
  createIntroCard,
  INTRO_CARD_MAX_LINKS,
  type IntroCard,
  IntroCardError,
} from '../domain/intro-card';
import { QR_ENCODER_MAX_BYTES } from '../qr/encoder';
import {
  arrayValue,
  assertLiteral,
  parseBoundedJson,
  SchemaValidationError,
  strictRecord,
  stringValue,
} from './validation';

/**
 * Issue 84（QR 自己紹介ページ方式への Pivot）。QR の中身を `src/protocol/vcard.ts` の
 * vCard 直埋めから、フラグメント（`#` 以降）に base64url + JSON で自己紹介カードを
 * 埋め込んだ静的ビューア URL へ変更する。フラグメントはブラウザから外部へ
 * 送信されないため、ビューア（`site/c/index.html`）は「データを預からない」原則を
 * 保ったまま、相手に「連絡先に追加するか」を選ばせられる。正本は Issue 84 本文と
 * ADR-0027。`vcard.ts` は削除せず、将来の「vCard 直埋めへの切替式」で使う想定
 * （ADR-0027 参照）。
 */

// 末尾スラッシュ必須。`/c` は GitHub Pages が `/c/` へ 301 リダイレクトするため、
// スキャン直後の 1 ホップと古いブラウザでのフラグメント欠落リスクを避ける。
export const INTRO_CARD_VIEWER_URL =
  'https://susumutomita.github.io/TenkaCloudPassport/c/';

const INTRO_CARD_URL_PAYLOAD_VERSION = 1;
// 実際に生成する payload は object -> array（links）の 2 段までしか深くならない。
// 3 は攻撃者が作った深いネスト JSON を弾くための余裕を持たせた fail-closed 上限。
const INTRO_CARD_URL_JSON_MAX_DEPTH = 3;
// 個々の field 自体は QR_ENCODER_MAX_BYTES（1,024 byte）の全体予算でしか実質的に
// 制限されないため、ここでは「異常に巨大な単一 field」を弾く粗い上限に留める。
const INTRO_CARD_URL_FIELD_MAX_LENGTH = 4096;

interface IntroCardUrlPayload {
  readonly v: 1;
  readonly n: string;
  readonly t?: string;
  readonly o?: string;
  readonly s?: string;
  readonly l?: readonly string[];
  readonly e?: string;
  readonly p?: string;
}

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const BASE64URL_DECODE_TABLE: ReadonlyMap<string, number> = new Map(
  Array.from(BASE64URL_ALPHABET, (char, index) => [char, index] as const)
);

/**
 * パディングなし base64url。bit accumulator 方式にすることで、末尾グループの
 * 残り byte 数（1 / 2 / 3）ごとに分岐を書き分ける必要がなくなる。
 */
function encodeBase64Url(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 6) {
      bitsInBuffer -= 6;
      output += BASE64URL_ALPHABET.charAt((buffer >> bitsInBuffer) & 0x3f);
    }
  }
  if (bitsInBuffer > 0) {
    output += BASE64URL_ALPHABET.charAt((buffer << (6 - bitsInBuffer)) & 0x3f);
  }
  return output;
}

function shareUrlError(reason: string): IntroCardError {
  return new IntroCardError(
    'INVALID_SHARE_URL',
    `自己紹介ページ URL を読み取れません。${reason}`
  );
}

function decodeBase64Url(encoded: string): Uint8Array {
  if (encoded.length % 4 === 1) {
    throw shareUrlError('QR の内容（フラグメント）の長さが不正です。');
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const char of encoded) {
    const value = BASE64URL_DECODE_TABLE.get(char);
    if (value === undefined) {
      throw shareUrlError(
        'QR の内容（フラグメント）に使えない文字が含まれています。'
      );
    }
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw shareUrlError('内容を UTF-8 として解釈できません。');
  }
}

function optionalStringField(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return stringValue(value, path, INTRO_CARD_URL_FIELD_MAX_LENGTH);
}

function optionalLinksField(
  value: unknown,
  path: string
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  return arrayValue(value, path, 1, INTRO_CARD_MAX_LINKS).map((item, index) =>
    stringValue(item, `${path}[${index}]`, INTRO_CARD_URL_FIELD_MAX_LENGTH)
  );
}

/**
 * デコードした payload を `createIntroCard` へ通すことで、`IntroCard` の妥当性
 * ルール（文字数上限・URL 形式・メール形式など）を domain 側 1 か所だけに保つ
 * （`src/domain/intro-card.ts` の `withIntroCardOptionalFields` と同じ、
 * `exactOptionalPropertyTypes` 下で undefined key を作らない組み立て方）。
 */
function decodePayload(parsed: unknown): IntroCard {
  const path = '$.introCardUrlPayload';
  const record = strictRecord(
    parsed,
    path,
    ['v', 'n'],
    ['t', 'o', 's', 'l', 'e', 'p']
  );
  assertLiteral(record.v, INTRO_CARD_URL_PAYLOAD_VERSION, `${path}.v`);
  const name = stringValue(
    record.n,
    `${path}.n`,
    INTRO_CARD_URL_FIELD_MAX_LENGTH
  );
  const title = optionalStringField(record.t, `${path}.t`);
  const organization = optionalStringField(record.o, `${path}.o`);
  const selfIntro = optionalStringField(record.s, `${path}.s`);
  const links = optionalLinksField(record.l, `${path}.l`);
  const email = optionalStringField(record.e, `${path}.e`);
  const phone = optionalStringField(record.p, `${path}.p`);

  return createIntroCard({
    name,
    ...(title === undefined ? {} : { title }),
    ...(organization === undefined ? {} : { organization }),
    ...(selfIntro === undefined ? {} : { selfIntro }),
    ...(links === undefined ? {} : { links }),
    ...(email === undefined ? {} : { email }),
    ...(phone === undefined ? {} : { phone }),
  });
}

export function decodeIntroCardUrlFragment(fragment: string): IntroCard {
  const bytes = decodeBase64Url(fragment);
  const json = decodeUtf8(bytes);
  try {
    const parsed = parseBoundedJson(
      json,
      QR_ENCODER_MAX_BYTES,
      INTRO_CARD_URL_JSON_MAX_DEPTH
    );
    return decodePayload(parsed);
  } catch (error: unknown) {
    if (error instanceof SchemaValidationError) {
      throw shareUrlError('内容の形式が正しくありません。');
    }
    throw error;
  }
}

function buildPayload(card: IntroCard): IntroCardUrlPayload {
  return {
    v: INTRO_CARD_URL_PAYLOAD_VERSION,
    n: card.name,
    ...(card.title === undefined ? {} : { t: card.title }),
    ...(card.organization === undefined ? {} : { o: card.organization }),
    ...(card.selfIntro === undefined ? {} : { s: card.selfIntro }),
    ...(card.links === undefined ? {} : { l: card.links }),
    ...(card.email === undefined ? {} : { e: card.email }),
    ...(card.phone === undefined ? {} : { p: card.phone }),
  };
}

function buildUrl(card: IntroCard): string {
  const json = JSON.stringify(buildPayload(card));
  const fragment = encodeBase64Url(new TextEncoder().encode(json));
  return `${INTRO_CARD_VIEWER_URL}#${fragment}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * 何を削れば QR に収まるかが分かるよう、payload の key と byte 数の内訳を message に
 * 含める（`src/protocol/vcard.ts` の `cardTooLargeError` と同じ流儀）。値そのもの
 * （氏名、自己紹介等）は含めない。
 */
function fieldBreakdownEntry(
  label: string,
  value: string | readonly string[] | undefined
): string | null {
  if (value === undefined) return null;
  return `${label} ${byteLength(JSON.stringify(value))} byte`;
}

function urlTooLargeError(card: IntroCard): IntroCardError {
  const breakdown = [
    fieldBreakdownEntry('n', card.name),
    fieldBreakdownEntry('t', card.title),
    fieldBreakdownEntry('o', card.organization),
    fieldBreakdownEntry('s', card.selfIntro),
    fieldBreakdownEntry('l', card.links),
    fieldBreakdownEntry('e', card.email),
    fieldBreakdownEntry('p', card.phone),
  ]
    .filter((entry): entry is string => entry !== null)
    .join(', ');
  return new IntroCardError(
    'CARD_TOO_LARGE',
    `自己紹介ページ URL が QR の上限（${QR_ENCODER_MAX_BYTES} byte）を超えています。内訳: ${breakdown}`
  );
}

export function encodeIntroCardUrl(card: IntroCard): string {
  const url = buildUrl(card);
  if (byteLength(url) > QR_ENCODER_MAX_BYTES) {
    throw urlTooLargeError(card);
  }
  return url;
}

/**
 * 編集画面の「QR に収まるかの目安表示」用。`encodeIntroCardUrl` と異なり上限超過でも
 * 例外を投げず、入力中の draft がどれだけ 1,024 byte 予算に近いかをそのまま返す
 * （`vcard.ts` の `vCardByteLength` と同じ流儀）。
 */
export function introCardUrlByteLength(card: IntroCard): number {
  return byteLength(buildUrl(card));
}
