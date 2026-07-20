import { type IntroCard, IntroCardError } from '../domain/intro-card';
import { QR_ENCODER_MAX_BYTES } from '../qr/encoder';

/**
 * 自己紹介カードピボット Step 1（Issue 79）の vCard 3.0 エンコーダ。
 * `TCPQ1:` envelope（`src/protocol/qr-payload.ts`）は使わない。相手は標準カメラで
 * 生の vCard を読み取って連絡先登録するため、Passport / Lounge Invite の QR とは
 * 独立したこの protocol module に閉じる。QR 化自体はここでは行わず、呼び出し側が
 * `encodeQr(encodeVCard(card))` を直接呼ぶ（`src/qr/encoder.ts` の `encodeQr`）。
 */

const CRLF = '\r\n';

/**
 * RFC 6350 のエスケープ規則。`\` を最初に置換しないと、後続の置換で生成した
 * `\,` 等の `\` を二重にエスケープしてしまう。
 */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

interface VCardLine {
  readonly label: string;
  readonly text: string;
}

function buildLines(card: IntroCard): VCardLine[] {
  const escapedName = escapeVCardValue(card.name);
  const lines: VCardLine[] = [
    { label: 'BEGIN', text: 'BEGIN:VCARD' },
    { label: 'VERSION', text: 'VERSION:3.0' },
    // 姓名を分割する入力を持たないため、氏名をそのまま N の 1 要素目へ入れる
    // （Issue 79 詳細設計）。
    { label: 'N', text: `N:${escapedName};;;;` },
    { label: 'FN', text: `FN:${escapedName}` },
  ];
  if (card.organization !== undefined) {
    lines.push({
      label: 'ORG',
      text: `ORG:${escapeVCardValue(card.organization)}`,
    });
  }
  if (card.title !== undefined) {
    lines.push({
      label: 'TITLE',
      text: `TITLE:${escapeVCardValue(card.title)}`,
    });
  }
  if (card.phone !== undefined) {
    // phone は domain 側で `[0-9+\-() ]` だけを許可済みのため、この値に
    // vCard の予約文字（`,` `;` `\`）は現れない。
    lines.push({ label: 'TEL', text: `TEL;TYPE=CELL:${card.phone}` });
  }
  if (card.email !== undefined) {
    lines.push({
      label: 'EMAIL',
      text: `EMAIL:${escapeVCardValue(card.email)}`,
    });
  }
  for (const link of card.links ?? []) {
    lines.push({ label: 'URL', text: `URL:${escapeVCardValue(link)}` });
  }
  if (card.selfIntro !== undefined) {
    lines.push({
      label: 'NOTE',
      text: `NOTE:${escapeVCardValue(card.selfIntro)}`,
    });
  }
  lines.push({ label: 'END', text: 'END:VCARD' });
  return lines;
}

/**
 * 何を削れば QR に収まるかが分かるよう、項目名と byte 数の内訳を message に含める。
 * 値そのもの（氏名、連絡先等）は含めない。
 */
function cardTooLargeError(lines: readonly VCardLine[]): IntroCardError {
  const breakdown = lines
    .map((line) => `${line.label} ${byteLength(line.text)} byte`)
    .join(', ');
  return new IntroCardError(
    'CARD_TOO_LARGE',
    `vCard が QR の上限（${QR_ENCODER_MAX_BYTES} byte）を超えています。内訳: ${breakdown}`
  );
}

function joinedVCard(lines: readonly VCardLine[]): string {
  return `${lines.map((line) => line.text).join(CRLF)}${CRLF}`;
}

export function encodeVCard(card: IntroCard): string {
  const lines = buildLines(card);
  const vcard = joinedVCard(lines);
  if (byteLength(vcard) > QR_ENCODER_MAX_BYTES) {
    throw cardTooLargeError(lines);
  }
  return vcard;
}

/**
 * 編集画面の「vCard byte 使用量の目安表示」用。`encodeVCard` と異なり上限超過でも
 * 例外を投げず、入力中の draft がどれだけ 1,024 byte 予算に近いかをそのまま返す
 * （Issue 79 詳細設計）。
 */
export function vCardByteLength(card: IntroCard): number {
  return byteLength(joinedVCard(buildLines(card)));
}
