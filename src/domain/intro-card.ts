/**
 * 自己紹介カードピボット Step 1（Issue 79）のドメイン型。
 * 正本は `docs/specs/2026-07-20-digital-meishi-pivot.md` と Issue 79 本文。
 * ADR-0026 が、氏名・連絡先・SNS リンクの端末内保持を許可する契約として
 * ADR-0007 のデータ最小化契約の一部を supersede する（Lounge / Public Passport /
 * Pet Message の匿名性契約はここでは変更しない）。
 */

export const INTRO_CARD_NAME_MAX_LENGTH = 50;
export const INTRO_CARD_TITLE_MAX_LENGTH = 50;
export const INTRO_CARD_ORGANIZATION_MAX_LENGTH = 50;
export const INTRO_CARD_SELF_INTRO_MAX_LENGTH = 300;
export const INTRO_CARD_MAX_LINKS = 5;
export const INTRO_CARD_LINK_MAX_LENGTH = 120;
export const INTRO_CARD_PHONE_MAX_LENGTH = 20;

export interface IntroCard {
  readonly name: string;
  readonly title?: string;
  readonly organization?: string;
  readonly selfIntro?: string;
  readonly links?: readonly string[];
  readonly email?: string;
  readonly phone?: string;
}

export type IntroCardErrorCode =
  | 'NAME_REQUIRED'
  | 'FIELD_TOO_LONG'
  | 'INVALID_URL'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'CARD_TOO_LARGE'
  | 'INVALID_SHARE_URL';

/**
 * `src/protocol/qr-payload.ts` の `QrPayloadError` 等と同形の per-module Error 慣行。
 * `CARD_TOO_LARGE` は `createIntroCard` 自体は投げず、QR 化の byte 数検証を行う
 * protocol 層のエンコーダがこのクラスを再利用して投げる。現在の本番経路は
 * `src/protocol/intro-card-url.ts` の `encodeIntroCardUrl`（QR に載せる自己紹介
 * ページ URL 全体の byte 数を検証、Issue 84）であり、`src/protocol/vcard.ts` の
 * `encodeVCard`（vCard 全体の byte 数を検証、将来の切替式用に残置）も同じコードを
 * 投げる（フィールド単体の妥当性と、複数フィールド合算の QR 収容可否は別の関心事だが、
 * 呼び出し側から見ればどちらも「この Intro Card は保存・共有できない」という
 * 同じ意味の型付き Error であるため、クラスを分けない）。
 * `INVALID_SHARE_URL`（Issue 84）は同じ理由で `src/protocol/intro-card-url.ts` の
 * `decodeIntroCardUrlFragment` が、QR フラグメントを Intro Card として復元できない
 * 場合（base64url 不正・JSON 不正・version 不一致・スキーマ不一致）に投げる。
 */
export class IntroCardError extends Error {
  readonly code: IntroCardErrorCode;

  constructor(code: IntroCardErrorCode, message: string) {
    super(message);
    this.name = 'IntroCardError';
    this.code = code;
  }
}

export interface CreateIntroCardInput {
  readonly name: string;
  readonly title?: string;
  readonly organization?: string;
  readonly selfIntro?: string;
  readonly links?: readonly string[];
  readonly email?: string;
  readonly phone?: string;
}

export interface IntroCardOptionalFields {
  readonly title: string | undefined;
  readonly organization: string | undefined;
  readonly selfIntro: string | undefined;
  readonly links: readonly string[] | undefined;
  readonly email: string | undefined;
  readonly phone: string | undefined;
}

/**
 * `exactOptionalPropertyTypes` の下では、値が `undefined` の optional key を明示的に
 * 代入できない（`{ title: undefined }` は `title?: string` に非適合）ため、undefined の
 * key はそもそも生成しない。`createIntroCard` と、Storage から読み戻した JSON を
 * 同じ形へ変換する `src/app/intro-card-storage.ts` の両方がこの組み立てを必要とする
 * ため、ここへ一本化する（jscpd 重複検出の指摘を実装で解消）。
 */
export function withIntroCardOptionalFields(
  name: string,
  optional: IntroCardOptionalFields
): IntroCard {
  return {
    name,
    ...(optional.title === undefined ? {} : { title: optional.title }),
    ...(optional.organization === undefined
      ? {}
      : { organization: optional.organization }),
    ...(optional.selfIntro === undefined
      ? {}
      : { selfIntro: optional.selfIntro }),
    ...(optional.links === undefined ? {} : { links: optional.links }),
    ...(optional.email === undefined ? {} : { email: optional.email }),
    ...(optional.phone === undefined ? {} : { phone: optional.phone }),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-() ]+$/;
const URL_PATTERN = /^https?:\/\//;

/** 空文字・空白のみは undefined に正規化する（Issue 79 詳細設計）。 */
function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function validatedOptionalField(
  value: string | undefined,
  maxLength: number,
  fieldName: string
): string | undefined {
  const normalized = normalizeOptional(value);
  if (normalized === undefined) return undefined;
  if (normalized.length > maxLength) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `${fieldName} は ${maxLength} 文字以下で入力してください。`
    );
  }
  return normalized;
}

function validatedName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    throw new IntroCardError('NAME_REQUIRED', '名前を入力してください。');
  }
  if (trimmed.length > INTRO_CARD_NAME_MAX_LENGTH) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `名前は ${INTRO_CARD_NAME_MAX_LENGTH} 文字以下で入力してください。`
    );
  }
  return trimmed;
}

function validatedLinks(
  links: readonly string[] | undefined
): readonly string[] | undefined {
  if (links === undefined) return undefined;
  const normalized = links
    .map((link) => link.trim())
    .filter((link) => link.length > 0);
  if (normalized.length === 0) return undefined;
  if (normalized.length > INTRO_CARD_MAX_LINKS) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `リンクは ${INTRO_CARD_MAX_LINKS} 件までにしてください。`
    );
  }
  for (const link of normalized) {
    if (link.length > INTRO_CARD_LINK_MAX_LENGTH) {
      throw new IntroCardError(
        'FIELD_TOO_LONG',
        `リンクは ${INTRO_CARD_LINK_MAX_LENGTH} 文字以下で入力してください。`
      );
    }
    if (!URL_PATTERN.test(link)) {
      throw new IntroCardError(
        'INVALID_URL',
        'リンクは http:// または https:// から始まる URL にしてください。'
      );
    }
  }
  return normalized;
}

function validatedEmail(value: string | undefined): string | undefined {
  const normalized = normalizeOptional(value);
  if (normalized === undefined) return undefined;
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new IntroCardError(
      'INVALID_EMAIL',
      'メールアドレスの形式が不正です。'
    );
  }
  return normalized;
}

function validatedPhone(value: string | undefined): string | undefined {
  const normalized = normalizeOptional(value);
  if (normalized === undefined) return undefined;
  if (normalized.length > INTRO_CARD_PHONE_MAX_LENGTH) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `電話番号は ${INTRO_CARD_PHONE_MAX_LENGTH} 文字以下で入力してください。`
    );
  }
  if (!PHONE_PATTERN.test(normalized)) {
    throw new IntroCardError(
      'INVALID_PHONE',
      '電話番号に使える文字は数字と + - ( ) 空白だけです。'
    );
  }
  return normalized;
}

export function createIntroCard(input: CreateIntroCardInput): IntroCard {
  const name = validatedName(input.name);
  const title = validatedOptionalField(
    input.title,
    INTRO_CARD_TITLE_MAX_LENGTH,
    '肩書き'
  );
  const organization = validatedOptionalField(
    input.organization,
    INTRO_CARD_ORGANIZATION_MAX_LENGTH,
    '所属'
  );
  const selfIntro = validatedOptionalField(
    input.selfIntro,
    INTRO_CARD_SELF_INTRO_MAX_LENGTH,
    '自己紹介'
  );
  const links = validatedLinks(input.links);
  const email = validatedEmail(input.email);
  const phone = validatedPhone(input.phone);

  return withIntroCardOptionalFields(name, {
    title,
    organization,
    selfIntro,
    links,
    email,
    phone,
  });
}
