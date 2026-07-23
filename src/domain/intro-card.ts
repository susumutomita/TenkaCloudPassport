import { type ClueId, isClueId } from './clue-catalog';

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
/**
 * Issue 104（端末内会話エージェント Step A）: 会話テーマは Passport と同じ
 * 版管理済みカタログ（`clue-catalog.ts`）を再利用する。専用の新しいカタログは
 * 作らない（ADR-0036「案 C」）。上限は Public Passport の
 * `PUBLIC_PASSPORT_MAX_CLUES`（`src/domain/passport.ts`）と同じ 3 件にする
 * （`passport.ts` を import すると循環 import になるため値は独立させる。
 * 一致は `conversation-agent-evidence.test.ts` が固定する）。
 */
export const INTRO_CARD_MAX_THEMES = 3;

export interface IntroCard {
  readonly name: string;
  readonly title?: string;
  readonly organization?: string;
  readonly selfIntro?: string;
  readonly links?: readonly string[];
  readonly email?: string;
  readonly phone?: string;
  /**
   * Issue 104: 端末内会話エージェントが共通点抽出に使う、確認済みの会話テーマ
   * （最大 `INTRO_CARD_MAX_THEMES` 件）。Passport の `ConfirmedClue` とは異なり
   * `category` を持たない（`src/domain/conversation-agent-evidence.ts` が
   * `clueById` から都度導出する）。
   */
  readonly themeIds?: readonly ClueId[];
}

export type IntroCardErrorCode =
  | 'NAME_REQUIRED'
  | 'FIELD_TOO_LONG'
  | 'INVALID_URL'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'CARD_TOO_LARGE'
  | 'INVALID_SHARE_URL'
  | 'INVALID_THEME_IDS';

/**
 * Issue 92: 保存失敗時にどの入力欄が原因かを画面側で特定するための識別子。
 * `createIntroCard` が検証する入力フィールドとちょうど 1 対 1 で対応する
 * （`links` は画面には X/GitHub/LinkedIn/Portfolio/自由リンクの複数欄があるが、
 * domain から見ると `IntroCard.links: readonly string[]` という単一フィールドの
 * ため、ここでは 1 種類にまとめる。画面層でどの名前付き欄が原因かを絞り込む
 * 処理は `src/screens/intro-card-links.ts` の `firstInvalidNamedLinkField` が担う）。
 * `CARD_TOO_LARGE`（`vcard.ts`）・`INVALID_SHARE_URL`（`intro-card-url.ts`）は
 * どの入力欄の問題でもないため対象外（`IntroCardError.field` は未設定のまま）。
 * `INVALID_THEME_IDS`（会話テーマ、Issue 104）も同じ理由で対象外にする。
 * 会話テーマはカタログからの選択式（`ClueSelector` の checkbox）であり、
 * 名前・肩書き等のような「入力中の 1 欄を focus する」体験が必要な自由記述
 * 欄ではないため、他の欄と同じ per-field 検証（`IntroCardFieldValueInput`）の
 * 対象にも含めない。
 */
export type IntroCardField =
  | 'name'
  | 'title'
  | 'organization'
  | 'selfIntro'
  | 'links'
  | 'email'
  | 'phone';

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
 * Issue 104 PR #132: `decodeIntroCardUrlFragmentQuizProgressHex`（`q` だけを
 * 取り出す q-only decoder）も同じ `strictPayloadRecord` を経由するため、`m`
 * （会話テーマ）がカタログ未登録・重複の場合は `resolveCatalogThemeIds` 由来の
 * `INVALID_THEME_IDS` をそのまま投げる（`INVALID_SHARE_URL` へ丸めない）。
 */
export class IntroCardError extends Error {
  readonly code: IntroCardErrorCode;
  // `exactOptionalPropertyTypes` 下で明示 `undefined` を代入できるよう、
  // `withIntroCardOptionalFields` と同じく `?:` を使わず union で宣言する。
  readonly field: IntroCardField | undefined;

  constructor(
    code: IntroCardErrorCode,
    message: string,
    field?: IntroCardField
  ) {
    super(message);
    this.name = 'IntroCardError';
    this.code = code;
    this.field = field;
  }
}

/**
 * `IntroCard` と同じ形にするため、フィールド一覧を手で複製せず `Omit` + 追記で
 * 導出する（jscpd 重複検出の指摘: 7 フィールドをそのまま複製すると
 * `IntroCard` と drift しうる）。`themeIds` だけ検証前の生文字列配列
 * （`readonly string[]`）にする。カタログ ID として妥当かどうかは
 * `validatedThemeIds` が検証する。URL デコード（`intro-card-url.ts`）・
 * Storage 読み戻し（`intro-card-storage.ts`）のどちらから来た値も、ここで
 * 同じ 1 か所の検証を通す。
 */
export type CreateIntroCardInput = Omit<IntroCard, 'themeIds'> & {
  readonly themeIds?: readonly string[];
};

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
 *
 * Issue 104 の `themeIds` はここに含めない: `createIntroCard` が渡す値は検証済みの
 * `readonly ClueId[]`、`intro-card-storage.ts` が渡す値は検証前の `readonly
 * string[]`（`CreateIntroCardInput.themeIds` へ二重目の `createIntroCard` 呼び出しで
 * 初めて検証される）であり、型が異なる。両呼び出し元がそれぞれ 1 行の
 * `themeIds === undefined ? base : { ...base, themeIds }` で付け足す
 * （型を偽装する共通ヘルパーを作らない）。
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

// ゼロ幅スペース（U+200B）・BOM/ゼロ幅非改行スペース（U+FEFF）。NFKC 正規化は
// これらを分解・除去しない（`String.prototype.normalize('NFKC')` の実測で確認
// 済み）ため、別途除去する。ゼロ幅（非）結合子（U+200C・U+200D）は除去対象に
// 含めない（code-reviewer 指摘）: U+200D（ZWJ）は複数の絵文字を 1 グリフに
// 結合する絵文字シーケンス（家族・カップル・職業＋性別等）に必須で、除去すると
// 複数の独立した絵文字に分裂して selfIntro 等の自由記述欄の内容を保存時に
// 静かに壊す。U+200C（ZWNJ）もインド系スクリプトの正しい字形結合に使われうる。
// どちらも「見た目に現れない不正な文字」ではなく正当な用途を持つため対象外にする。
const ZERO_WIDTH_CHARACTERS_PATTERN = /[\u200B\uFEFF]/g;

/**
 * Issue 92: iOS 日本語キーボードでの入力（全角 `＠`・全角英数・不可視文字の
 * 混入）を吸収する。NFKC 正規化で全角英数・全角記号（全角 `＠` → `@` を含む）を
 * 半角へ解決し、続けてゼロ幅文字を除去する。trim より前に適用することで、
 * 「正規化後に文字数上限を超える」ケース（例: `㍻` は NFKC で `平成` の 2 文字へ
 * 展開される）も、この後段の長さ検証がそのまま拾う。
 * `src/screens/intro-card-links.ts` の `firstInvalidNamedLinkField`
 * （保存失敗時にどの名前付きリンク欄が原因かを絞り込む画面層の処理）が、
 * ここでの正規化を経ていない値で判定すると誤ったフィールドへ focus しうる
 * （code-reviewer 指摘）ため、export して同じ正規化を再利用できるようにする。
 */
export function normalizeInputText(value: string): string {
  return value.normalize('NFKC').replace(ZERO_WIDTH_CHARACTERS_PATTERN, '');
}

/** 空文字・空白のみは undefined に正規化する（Issue 79 詳細設計）。 */
function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = normalizeInputText(value).trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function validatedOptionalField(
  value: string | undefined,
  maxLength: number,
  fieldName: string,
  field: IntroCardField
): string | undefined {
  const normalized = normalizeOptional(value);
  if (normalized === undefined) return undefined;
  if (normalized.length > maxLength) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `${fieldName} は ${maxLength} 文字以下で入力してください。`,
      field
    );
  }
  return normalized;
}

function validatedName(value: string): string {
  const trimmed = normalizeInputText(value).trim();
  if (trimmed.length < 1) {
    throw new IntroCardError(
      'NAME_REQUIRED',
      '名前を入力してください。',
      'name'
    );
  }
  if (trimmed.length > INTRO_CARD_NAME_MAX_LENGTH) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `名前は ${INTRO_CARD_NAME_MAX_LENGTH} 文字以下で入力してください。`,
      'name'
    );
  }
  return trimmed;
}

/**
 * リンクが `http://` または `https://` から始まる形式かどうかを判定する。
 * `validatedLinks` 自身の判定と、画面層（`src/screens/intro-card-links.ts`）が
 * 保存失敗時にどの入力欄（X/GitHub/LinkedIn/Portfolio/自由リンク）が原因かを
 * 絞り込む処理（`firstInvalidNamedLinkField`）の両方が同じ正規表現を参照できる
 * よう、ここへ 1 本化する（判定基準の二重定義・drift を防ぐ）。
 */
export function isValidIntroCardLinkFormat(link: string): boolean {
  return URL_PATTERN.test(link);
}

/**
 * リンク 1 件分の形式（文字数上限・http/https 形式）を検証する。`validatedLinks`
 * の配列走査と、Issue 93 の `validateIntroCardFieldValue`（保存前の欄単位
 * バリデーション）の両方が、この 1 件分の判定を再利用する（判定基準の
 * 二重定義・drift を防ぐ）。呼び出し側で既に `normalizeInputText(...).trim()`
 * 済みの値を渡す前提（このため引数名は正規化前の生値ではなく `normalized`）。
 */
function assertValidLinkFormat(normalized: string): void {
  if (normalized.length > INTRO_CARD_LINK_MAX_LENGTH) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `リンクは ${INTRO_CARD_LINK_MAX_LENGTH} 文字以下で入力してください。`,
      'links'
    );
  }
  if (!isValidIntroCardLinkFormat(normalized)) {
    throw new IntroCardError(
      'INVALID_URL',
      'リンクは http:// または https:// から始まる URL にしてください。',
      'links'
    );
  }
}

function validatedLinks(
  links: readonly string[] | undefined
): readonly string[] | undefined {
  if (links === undefined) return undefined;
  const normalized = links
    .map((link) => normalizeInputText(link).trim())
    .filter((link) => link.length > 0);
  if (normalized.length === 0) return undefined;
  if (normalized.length > INTRO_CARD_MAX_LINKS) {
    throw new IntroCardError(
      'FIELD_TOO_LONG',
      `リンクは ${INTRO_CARD_MAX_LINKS} 件までにしてください。`,
      'links'
    );
  }
  for (const link of normalized) {
    assertValidLinkFormat(link);
  }
  return normalized;
}

function validatedEmail(value: string | undefined): string | undefined {
  const normalized = normalizeOptional(value);
  if (normalized === undefined) return undefined;
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new IntroCardError(
      'INVALID_EMAIL',
      'メールアドレスの形式が不正です。',
      'email'
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
      `電話番号は ${INTRO_CARD_PHONE_MAX_LENGTH} 文字以下で入力してください。`,
      'phone'
    );
  }
  if (!PHONE_PATTERN.test(normalized)) {
    throw new IntroCardError(
      'INVALID_PHONE',
      '電話番号に使える文字は数字と + - ( ) 空白だけです。',
      'phone'
    );
  }
  return normalized;
}

/**
 * Issue 104 PR #132（Codex 指摘 major）: `m`（会話テーマ ID）の件数・カタログ
 * 実在・重複検査を 1 か所へ共通化し、full decoder（本関数経由の
 * `createIntroCard`）・q-only decoder（`src/protocol/intro-card-url.ts` の
 * `strictPayloadRecord`）・viewer（`site/c/index.html`）の全経路が同じ基準を
 * 使う（`scripts/intro-card-viewer-decoder-parity.test.ts` が三者の実行結果を
 * 突き合わせる）。呼び出し側は配列形状（文字列配列であること）を先に検証済みで
 * ある前提とし、ここでは件数・重複・カタログ実在だけを fail-closed で検証する。
 * 無効な値を静かに間引かず（`links` の「不正な 1 件だけ弾く」とは異なり）、
 * 呼び出し側のバグ・改ざんの兆候として全体を拒否する。
 */
export function resolveCatalogThemeIds(
  values: readonly string[]
): readonly ClueId[] {
  if (values.length > INTRO_CARD_MAX_THEMES) {
    throw new IntroCardError(
      'INVALID_THEME_IDS',
      `会話テーマは ${INTRO_CARD_MAX_THEMES} 件までにしてください。`
    );
  }
  if (new Set(values).size !== values.length) {
    throw new IntroCardError(
      'INVALID_THEME_IDS',
      '同じ会話テーマを重複して指定することはできません。'
    );
  }
  const themeIds: ClueId[] = [];
  for (const value of values) {
    if (!isClueId(value)) {
      throw new IntroCardError(
        'INVALID_THEME_IDS',
        '会話テーマは版管理済みカタログから選んでください。'
      );
    }
    themeIds.push(value);
  }
  return themeIds;
}

/**
 * Issue 104: 会話テーマ ID は自由記述ではなく版管理済みカタログからの選択式の
 * ため、`normalizeOptional`（trim・正規化）は適用しない。`undefined` または
 * 空配列は「テーマ未設定」として `undefined` へ正規化する（他の optional array
 * である `links` と同じ契約）。それ以外は `resolveCatalogThemeIds` の共通検査
 * （件数・重複・カタログ実在）を通す。
 */
function validatedThemeIds(
  values: readonly string[] | undefined
): readonly ClueId[] | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return resolveCatalogThemeIds(values);
}

export function createIntroCard(input: CreateIntroCardInput): IntroCard {
  const name = validatedName(input.name);
  const title = validatedOptionalField(
    input.title,
    INTRO_CARD_TITLE_MAX_LENGTH,
    '肩書き',
    'title'
  );
  const organization = validatedOptionalField(
    input.organization,
    INTRO_CARD_ORGANIZATION_MAX_LENGTH,
    '所属',
    'organization'
  );
  const selfIntro = validatedOptionalField(
    input.selfIntro,
    INTRO_CARD_SELF_INTRO_MAX_LENGTH,
    '自己紹介',
    'selfIntro'
  );
  const links = validatedLinks(input.links);
  const email = validatedEmail(input.email);
  const phone = validatedPhone(input.phone);
  const themeIds = validatedThemeIds(input.themeIds);

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

/**
 * Issue 93: 保存前（入力中・フォーカスアウト時）に 1 欄だけを検証する入力。
 * `links` は画面に複数の入力欄（X/GitHub/LinkedIn/Portfolio/自由リンク）が
 * あるが、domain からは 1 件分の文字列を渡してもらう（名前付き欄は呼び出し側
 * `src/screens/intro-card-links.ts` が `normalizeNamedLink` を適用してから
 * 渡す。ここでは URL 形式・文字数上限だけを見る）。
 * altitude レビュー指摘: `{ field: Exclude<IntroCardField, 'links'>; value:
 * string } | { field: 'links'; value: string }`（1 つ目の member 自体が
 * `field` の union）と書くと、`field` ごとに独立した discriminated union
 * member にならないため、`Exclude<..., { field: 'name' }>` で `'name'` だけを
 * 型レベルで除外できない（`validateIntroCardOtherFieldValue` に `case 'name':
 * return;` という到達しない no-op が必要だった）。mapped type で
 * `IntroCardField` を distribute し、`field` ごとに真に独立した object 型の
 * union にすることで、`Exclude` が正しく機能し、呼び出し元の
 * `if (input.field === 'name')` 分岐による通常の型絞り込みだけで
 * `'name'` を除いた型が得られるようにする。
 */
export type IntroCardFieldValueInput = {
  [Field in IntroCardField]: { readonly field: Field; readonly value: string };
}[IntroCardField];

/**
 * 名前の「未入力」は保存時（`errorFieldKey==='name'`）にだけ案内する。
 * 真っさらな画面で名前欄をタップしてすぐ離れただけで赤字が出るのは、
 * 「急かさない」という望ましい体験に反するため、NAME_REQUIRED だけは
 * ここで握り潰す（文字数超過は validatedName をそのまま再利用するため
 * 引き続き案内する）。`validateIntroCardFieldValue` の Cognitive Complexity を
 * 抑えるため、name 用の特例だけをこの private 関数へ切り出す。
 */
function validateIntroCardNameFieldValue(value: string): string | null {
  try {
    validatedName(value);
    return null;
  } catch (error: unknown) {
    if (error instanceof IntroCardError) {
      return error.code === 'NAME_REQUIRED' ? null : error.message;
    }
    throw error;
  }
}

/**
 * name 以外の各欄を検証する。`validateIntroCardFieldValue` から
 * Cognitive Complexity を抑えるために切り出した（switch 本体自体は
 * `createIntroCard` の分岐をなぞるだけで、独自の判定ロジックは持たない）。
 * `IntroCardFieldValueInput` が `field` ごとに独立した discriminated union
 * member であるため、呼び出し元の `if (input.field === 'name') return ...;`
 * だけで `'name'` を除いた型がここへ渡り、到達しない no-op 分岐は不要。
 */
function validateIntroCardOtherFieldValue(
  input: Exclude<IntroCardFieldValueInput, { readonly field: 'name' }>
): void {
  switch (input.field) {
    case 'title':
      validatedOptionalField(
        input.value,
        INTRO_CARD_TITLE_MAX_LENGTH,
        '肩書き',
        'title'
      );
      return;
    case 'organization':
      validatedOptionalField(
        input.value,
        INTRO_CARD_ORGANIZATION_MAX_LENGTH,
        '所属',
        'organization'
      );
      return;
    case 'selfIntro':
      validatedOptionalField(
        input.value,
        INTRO_CARD_SELF_INTRO_MAX_LENGTH,
        '自己紹介',
        'selfIntro'
      );
      return;
    case 'email':
      validatedEmail(input.value);
      return;
    case 'phone':
      validatedPhone(input.value);
      return;
    default: {
      // input.field === 'links'（呼び出し側で正規化済みの 1 件分の値）。
      const normalized = normalizeInputText(input.value).trim();
      if (normalized.length === 0) return;
      assertValidLinkFormat(normalized);
    }
  }
}

/**
 * `createIntroCard` が使う private validator をそのまま呼び、例外を投げる
 * 代わりにメッセージ文字列（問題なければ `null`）を返す。保存時の検証と
 * 完全に同じ関数を再利用することで、画面側が独自にロジックを再実装して
 * 保存時の判定と drift する（Issue 92 で code-reviewer に指摘された bug
 * class）ことを構造的に防ぐ。
 */
export function validateIntroCardFieldValue(
  input: IntroCardFieldValueInput
): string | null {
  if (input.field === 'name') {
    return validateIntroCardNameFieldValue(input.value);
  }
  try {
    validateIntroCardOtherFieldValue(input);
    return null;
  } catch (error: unknown) {
    if (error instanceof IntroCardError) return error.message;
    throw error;
  }
}
