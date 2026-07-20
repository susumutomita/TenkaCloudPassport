import {
  createIntroCard,
  type IntroCard,
  withIntroCardOptionalFields,
} from '../domain/intro-card';

/**
 * 自己紹介カードピボット Step 1（Issue 79）の Storage Port。
 * `src/app/local-profile-storage.ts`（Port + Web/Native 2 adapter + factory の
 * 4 ファイル構成）をそのまま踏襲する。Local Private Profile とは別の端末内キー・
 * ファイルへ保存し、JSON Backup の allowlist（ADR-0007）へは含めない
 * （Backup 統合は follow-up、Issue 79 本文で明記済み）。
 */
export interface IntroCardStoragePort {
  load(): Promise<IntroCard | null>;
  save(card: IntroCard): Promise<void>;
  inspect(): Promise<IntroCardStorageUsage>;
  remove(): Promise<void>;
}

export interface IntroCardStorageUsage {
  readonly count: 0 | 1;
  readonly bytes: number;
}

export type IntroCardStorageErrorCode =
  | 'UNAVAILABLE'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'DELETE_FAILED'
  | 'INVALID_DATA';

export class IntroCardStorageError extends Error {
  readonly code: IntroCardStorageErrorCode;

  constructor(
    code: IntroCardStorageErrorCode,
    message: string,
    cause: unknown
  ) {
    super(message, { cause });
    this.name = 'IntroCardStorageError';
    this.code = code;
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalStringArray(
  value: unknown
): value is readonly string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

/**
 * `JSON.parse` の結果を Index Signature 型（`Record<string, unknown>`）ではなく
 * 名前付き optional property で受けることで、`noPropertyAccessFromIndexSignature`
 * （tsconfig）が要求する bracket 記法を避け、通常のドット記法で読める形にする。
 */
interface UnknownIntroCardRecord {
  readonly name?: unknown;
  readonly title?: unknown;
  readonly organization?: unknown;
  readonly selfIntro?: unknown;
  readonly links?: unknown;
  readonly email?: unknown;
  readonly phone?: unknown;
}

/**
 * 保存データの構造だけを検証し（型不一致は分かりやすい Error にする）、実際の
 * フィールド妥当性（文字数上限、URL 形式等）は `createIntroCard` に一本化する。
 */
function asCreateIntroCardInput(
  value: unknown
): Parameters<typeof createIntroCard>[0] {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Intro Card の保存データが object ではありません。');
  }
  const record = value as UnknownIntroCardRecord;
  const name = record.name;
  const title = record.title;
  const organization = record.organization;
  const selfIntro = record.selfIntro;
  const email = record.email;
  const phone = record.phone;
  const links = record.links;
  if (typeof name !== 'string') {
    throw new Error('Intro Card の name が文字列ではありません。');
  }
  if (
    !isOptionalString(title) ||
    !isOptionalString(organization) ||
    !isOptionalString(selfIntro) ||
    !isOptionalString(email) ||
    !isOptionalString(phone) ||
    !isOptionalStringArray(links)
  ) {
    throw new Error('Intro Card のフィールドの型が不正です。');
  }
  return withIntroCardOptionalFields(name, {
    title,
    organization,
    selfIntro,
    links,
    email,
    phone,
  });
}

export function parseStoredIntroCard(raw: string): IntroCard {
  try {
    const parsed: unknown = JSON.parse(raw);
    return createIntroCard(asCreateIntroCardInput(parsed));
  } catch (error: unknown) {
    throw new IntroCardStorageError(
      'INVALID_DATA',
      '端末内の自己紹介カードは有効な保存データではありません。',
      error
    );
  }
}

export function serializeIntroCard(card: IntroCard): string {
  try {
    return JSON.stringify(createIntroCard(card));
  } catch (error: unknown) {
    throw new IntroCardStorageError(
      'INVALID_DATA',
      '自己紹介カードを保存可能な形式へ変換できません。',
      error
    );
  }
}

export function unavailableIntroCardStorageError(): IntroCardStorageError {
  return new IntroCardStorageError(
    'UNAVAILABLE',
    'この環境では端末内 Storage を利用できません。',
    new Error('自己紹介カードの保存媒体がありません。')
  );
}

export class UnavailableIntroCardStorageAdapter
  implements IntroCardStoragePort
{
  constructor(private readonly unavailableCause: unknown) {}

  load(): Promise<IntroCard | null> {
    return Promise.reject(
      new IntroCardStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }

  save(_card: IntroCard): Promise<void> {
    return Promise.reject(
      new IntroCardStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }

  inspect(): Promise<IntroCardStorageUsage> {
    return Promise.reject(
      new IntroCardStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }

  remove(): Promise<void> {
    return Promise.reject(
      new IntroCardStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }
}
