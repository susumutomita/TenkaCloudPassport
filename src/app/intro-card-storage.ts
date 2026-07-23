import {
  createIntroCard,
  type IntroCard,
  withIntroCardOptionalFields,
} from '../domain/intro-card';

/**
 * 自己紹介カードピボット Step 1（Issue 79）の Storage Port。
 * `src/app/local-profile-storage.ts`（Port + Web/Native 2 adapter + factory の
 * 4 ファイル構成）をそのまま踏襲する。Local Private Profile とは別の端末内キー・
 * ファイルへ保存する。JSON Backup 機能自体を Issue 118 / ADR-0033 で削除したため、
 * どの allowlist にも統合しない。
 */
export interface IntroCardStoragePort {
  load(): Promise<IntroCard | null>;
  save(card: IntroCard): Promise<void>;
  inspect(): Promise<IntroCardStorageUsage>;
  remove(): Promise<void>;
  /**
   * Issue 93: 保存前（未検証）の編集中の生入力を、確定カードとは別キーで
   * 保持する。「アプリを一度離れて戻っても入力内容を維持する」を実現するため、
   * `PassportApp.tsx` が編集画面の入力欄の変化に合わせて呼ぶ。下書きは
   * nice-to-have であり、失敗しても確定カードの読み書きを妨げてはならない
   * （呼び出し側は必ず `.catch(() => undefined)` で握り潰す）。
   */
  loadDraft(): Promise<IntroCardDraftFields | null>;
  saveDraft(draft: IntroCardDraftFields): Promise<void>;
  clearDraft(): Promise<void>;
}

export interface IntroCardStorageUsage {
  readonly count: 0 | 1;
  readonly bytes: number;
}

/**
 * Issue 93: 編集画面の入力欄そのままの生文字列（バリデーション前）。
 * `src/screens/intro-card-links.ts` の `IntroCardLinksDraft`
 * （X/GitHub/LinkedIn/Portfolio/自由リンク）と、名前・肩書き・所属・
 * 自己紹介・メール・電話の 6 欄を合わせた形。`PassportApp.tsx` の
 * `introCardDraft*` state 群と 1 対 1 に対応する。
 */
export interface IntroCardDraftFields {
  readonly name: string;
  readonly title: string;
  readonly organization: string;
  readonly selfIntro: string;
  readonly email: string;
  readonly phone: string;
  readonly linkX: string;
  readonly linkGithub: string;
  readonly linkLinkedin: string;
  readonly linkPortfolio: string;
  readonly otherLinks: readonly string[];
}

export const EMPTY_INTRO_CARD_DRAFT_FIELDS: IntroCardDraftFields = {
  name: '',
  title: '',
  organization: '',
  selfIntro: '',
  email: '',
  phone: '',
  linkX: '',
  linkGithub: '',
  linkLinkedin: '',
  linkPortfolio: '',
  otherLinks: [],
};

/**
 * 全欄が空の下書きは「下書きなし」と同義に扱う。起動時に水和した下書きが
 * 空なら保存済みカードの値を優先させ（`PassportApp.tsx` の
 * `openIntroCardEdit`）、編集中の下書きが全欄空へ戻ったら永続化ファイルも
 * 消す（`saveDraft` ではなく `clearDraft` を呼ぶ判断に使う）。
 * 単一行・複数行の各文字列欄は `trim()` してから判定する（code-reviewer
 * 指摘: 空白文字だけの入力を「値がある」と誤判定すると、保存済みカードの
 * 方が新しいはずの起動直後に、実質空の下書きが優先されて画面が空欄に
 * 見える紛らわしい体験になる）。`otherLinks` は行そのものの有無（自由
 * リンクの追加ボタンで空行を増やした状態）を保持したい意図的な仕様のため、
 * 中身の trim ではなく配列の長さで判定する。
 */
export function isEmptyIntroCardDraft(draft: IntroCardDraftFields): boolean {
  return (
    draft.name.trim().length === 0 &&
    draft.title.trim().length === 0 &&
    draft.organization.trim().length === 0 &&
    draft.selfIntro.trim().length === 0 &&
    draft.email.trim().length === 0 &&
    draft.phone.trim().length === 0 &&
    draft.linkX.trim().length === 0 &&
    draft.linkGithub.trim().length === 0 &&
    draft.linkLinkedin.trim().length === 0 &&
    draft.linkPortfolio.trim().length === 0 &&
    draft.otherLinks.length === 0
  );
}

export function serializeIntroCardDraft(draft: IntroCardDraftFields): string {
  return JSON.stringify(draft);
}

/**
 * `JSON.parse` の結果を Index Signature 型ではなく名前付き optional property で
 * 受ける方針は `UnknownIntroCardRecord` と同じ（`noPropertyAccessFromIndexSignature`
 * を満たすため）。
 */
interface UnknownIntroCardDraftRecord {
  readonly name?: unknown;
  readonly title?: unknown;
  readonly organization?: unknown;
  readonly selfIntro?: unknown;
  readonly email?: unknown;
  readonly phone?: unknown;
  readonly linkX?: unknown;
  readonly linkGithub?: unknown;
  readonly linkLinkedin?: unknown;
  readonly linkPortfolio?: unknown;
  readonly otherLinks?: unknown;
}

/**
 * 下書きは nice-to-have なデータであり、壊れていても保存済みカードのように
 * 詳しいエラー種別を返す必要はない（呼び出し側は最終的に握り潰す）ため、
 * 単純な `Error` を投げるだけにする（`IntroCardStorageError` は使わない）。
 * `asCreateIntroCardInput`（本ファイル上部）と同じく、各フィールドを個別の
 * local 変数へ束縛してから `typeof` で確認し、TypeScript の型絞り込みだけで
 * 済ませる（型アサーションを使わない）。
 */
export function parseStoredIntroCardDraft(raw: string): IntroCardDraftFields {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('下書きの保存データが object ではありません。');
  }
  const record = parsed as UnknownIntroCardDraftRecord;
  const name = record.name;
  const title = record.title;
  const organization = record.organization;
  const selfIntro = record.selfIntro;
  const email = record.email;
  const phone = record.phone;
  const linkX = record.linkX;
  const linkGithub = record.linkGithub;
  const linkLinkedin = record.linkLinkedin;
  const linkPortfolio = record.linkPortfolio;
  const otherLinks = record.otherLinks;
  if (
    typeof name !== 'string' ||
    typeof title !== 'string' ||
    typeof organization !== 'string' ||
    typeof selfIntro !== 'string' ||
    typeof email !== 'string' ||
    typeof phone !== 'string' ||
    typeof linkX !== 'string' ||
    typeof linkGithub !== 'string' ||
    typeof linkLinkedin !== 'string' ||
    typeof linkPortfolio !== 'string'
  ) {
    throw new Error('下書きのフィールドの型が不正です。');
  }
  if (
    !Array.isArray(otherLinks) ||
    !otherLinks.every((link): link is string => typeof link === 'string')
  ) {
    throw new Error('下書きの otherLinks が文字列配列ではありません。');
  }
  return {
    name,
    title,
    organization,
    selfIntro,
    email,
    phone,
    linkX,
    linkGithub,
    linkLinkedin,
    linkPortfolio,
    otherLinks,
  };
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
  readonly themeIds?: unknown;
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
  const themeIds = record.themeIds;
  if (typeof name !== 'string') {
    throw new Error('Intro Card の name が文字列ではありません。');
  }
  if (
    !isOptionalString(title) ||
    !isOptionalString(organization) ||
    !isOptionalString(selfIntro) ||
    !isOptionalString(email) ||
    !isOptionalString(phone) ||
    !isOptionalStringArray(links) ||
    !isOptionalStringArray(themeIds)
  ) {
    throw new Error('Intro Card のフィールドの型が不正です。');
  }
  const card = withIntroCardOptionalFields(name, {
    title,
    organization,
    selfIntro,
    links,
    email,
    phone,
  });
  return themeIds === undefined ? card : { ...card, themeIds };
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

  /**
   * simplify レビュー指摘: 7 つのメソッドすべてが同じ
   * `Promise.reject(new IntroCardStorageError('UNAVAILABLE', ...))` を
   * コピペしていたため、1 つの private helper へ一本化する。
   */
  private rejectUnavailable<T>(): Promise<T> {
    return Promise.reject(
      new IntroCardStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }

  load(): Promise<IntroCard | null> {
    return this.rejectUnavailable();
  }

  save(_card: IntroCard): Promise<void> {
    return this.rejectUnavailable();
  }

  inspect(): Promise<IntroCardStorageUsage> {
    return this.rejectUnavailable();
  }

  remove(): Promise<void> {
    return this.rejectUnavailable();
  }

  loadDraft(): Promise<IntroCardDraftFields | null> {
    return this.rejectUnavailable();
  }

  saveDraft(_draft: IntroCardDraftFields): Promise<void> {
    return this.rejectUnavailable();
  }

  clearDraft(): Promise<void> {
    return this.rejectUnavailable();
  }
}
