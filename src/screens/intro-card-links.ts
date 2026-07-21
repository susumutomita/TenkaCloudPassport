import {
  INTRO_CARD_LINK_MAX_LENGTH,
  INTRO_CARD_MAX_LINKS,
  isValidIntroCardLinkFormat,
  normalizeInputText,
} from '../domain/intro-card';

/**
 * Issue 90: カード編集画面のリンク欄を「1 行 1 リンクの改行区切り textarea」から
 * 「X / GitHub / LinkedIn / Portfolio の名前付き単一行入力 4 つ + 自由リンクの
 * 動的追加」へ変更する。`src/domain/intro-card.ts` の `IntroCard.links`
 * （`readonly string[]`・上限 5・`https?://` 検証）は変更しない契約のため、
 * ユーザー名だけの入力を URL へ補完する正規化・件数計算・load 時の逆分類は
 * すべてこの画面層の純粋関数へ切り出す。`IntroCardEditScreen.tsx`（表示・
 * 活性判定）と `PassportApp.tsx`（保存時の配列組み立て・load 時の逆分類）の
 * 両方から import し、ロジックを重複させない。
 */
export type NamedLinkService = 'x' | 'github' | 'linkedin';

const NAMED_LINK_URL_PREFIX: Record<NamedLinkService, string> = {
  x: 'https://x.com/',
  github: 'https://github.com/',
  linkedin: 'https://www.linkedin.com/in/',
};

const HTTP_URL_PATTERN = /^https?:\/\//i;

/**
 * code-reviewer 指摘: スキームだけ省いてドメインごと貼り付けた入力
 * （例: `github.com/taro`）を無条件にサービス prefix へ通すと
 * `https://github.com/github.com/taro` のようにドメインが二重になる。
 * サービスのドメインで始まる入力は「スキームだけ補う」扱いにする。
 */
const NAMED_LINK_BARE_DOMAIN_PATTERN: Record<NamedLinkService, RegExp> = {
  x: /^(www\.)?(x\.com|twitter\.com)(\/|$)/i,
  github: /^(www\.)?github\.com(\/|$)/i,
  linkedin: /^(www\.)?linkedin\.com(\/|$)/i,
};

/**
 * 入力値が `http`/`https` から始まらない場合、サービス別の URL prefix を補う
 * （ユーザー名だけの入力を許可する、Issue 90 追記 2 の設計）。空文字はそのまま
 * 空文字を返す（未入力欄として扱う）。code-reviewer 指摘を踏まえ、ドメインごと
 * 貼り付けた入力はスキームだけ補い、X の伝統的な `@` 付きハンドルは `@` を
 * 落としてから補完する（`https://x.com/@taro` という不正なパスを防ぐ）。
 */
export function normalizeNamedLink(
  service: NamedLinkService,
  value: string
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  if (HTTP_URL_PATTERN.test(trimmed)) return trimmed;
  if (NAMED_LINK_BARE_DOMAIN_PATTERN[service].test(trimmed)) {
    return `https://${trimmed}`;
  }
  const handle = service === 'x' ? trimmed.replace(/^@/, '') : trimmed;
  return `${NAMED_LINK_URL_PREFIX[service]}${handle}`;
}

export interface IntroCardLinksDraft {
  readonly x: string;
  readonly github: string;
  readonly linkedin: string;
  readonly portfolio: string;
  readonly otherLinks: readonly string[];
}

/**
 * 保存時に domain（`createIntroCard`）へ渡す `links` 配列を組み立てる。
 * Portfolio と自由リンクは完全な URL 入力を前提にし、自動補完しない
 * （Issue 90 詳細設計: 「Portfolio は URL のみ」）。空欄はここで除外する。
 */
export function buildIntroCardLinks(
  draft: IntroCardLinksDraft
): readonly string[] {
  const named = [
    normalizeNamedLink('x', draft.x),
    normalizeNamedLink('github', draft.github),
    normalizeNamedLink('linkedin', draft.linkedin),
    draft.portfolio.trim(),
  ];
  const other = draft.otherLinks.map((link) => link.trim());
  return [...named, ...other].filter((link) => link.length > 0);
}

/**
 * 保存対象になる件数（空欄は数えない）。「その他のリンクを追加」ボタンの
 * 活性判定と件数表示（`current / 5 件`）の両方が同じ値を使う。
 */
export function nonEmptyLinkCount(draft: IntroCardLinksDraft): number {
  return buildIntroCardLinks(draft).length;
}

/** 上限（`INTRO_CARD_MAX_LINKS`）に達していなければ自由リンクを追加してよい。 */
export function canAddOtherLink(draft: IntroCardLinksDraft): boolean {
  return nonEmptyLinkCount(draft) < INTRO_CARD_MAX_LINKS;
}

/** 編集画面のリンク系入力欄を一意に指す key（focus・エラー表示の対象を絞り込む用）。 */
export type IntroCardLinkFieldKey =
  | 'linkX'
  | 'linkGithub'
  | 'linkLinkedin'
  | 'linkPortfolio'
  | `otherLink-${number}`;

/**
 * Issue 93: 保存前（onBlur）の即時バリデーション用に、リンク系入力欄 1 つ分の
 * 値を domain の `validateIntroCardFieldValue({ field: 'links', ... })` へ
 * 渡す前の形へそろえる。X/GitHub/LinkedIn はユーザー名だけの入力を許可する
 * 契約（Issue 90）があるため、`normalizeNamedLink` を適用しないまま検証すると
 * 正しい入力を誤って無効判定してしまう（`firstInvalidNamedLinkField` が保存時に
 * 踏む正規化パイプラインと同じものを、保存前にも適用する）。Portfolio・自由
 * リンクは常に完全な URL を前提にしており補完しないため、そのまま返す。
 */
export function normalizedLinkFieldValue(
  key: IntroCardLinkFieldKey,
  rawValue: string
): string {
  if (key === 'linkX') return normalizeNamedLink('x', rawValue);
  if (key === 'linkGithub') return normalizeNamedLink('github', rawValue);
  if (key === 'linkLinkedin') return normalizeNamedLink('linkedin', rawValue);
  return rawValue;
}

/**
 * `NamedLinkService` から対応する編集画面欄の key への対応表。
 * `NAMED_LINK_URL_PREFIX` 等と同じ「サービス種別をキーにした table」の
 * 方針を踏襲し、`firstInvalidNamedLinkField` が 3 サービス分の候補を
 * コピペで並べ直さずに済むようにする（simplify レビュー指摘）。
 */
const NAMED_LINK_FIELD_KEY: Record<NamedLinkService, IntroCardLinkFieldKey> = {
  x: 'linkX',
  github: 'linkGithub',
  linkedin: 'linkLinkedin',
};

const NAMED_LINK_SERVICES: readonly NamedLinkService[] = [
  'x',
  'github',
  'linkedin',
];

/**
 * Issue 92: 保存失敗（`INVALID_URL`・リンク単体の文字数超過）の原因になった、
 * X / GitHub / LinkedIn / Portfolio / 自由リンクのどの入力欄かを 1 件だけ
 * 特定する。`buildIntroCardLinks` と同じ順序（X → GitHub → LinkedIn →
 * Portfolio → 自由リンク）で走査し、`createIntroCard`（`validatedLinks`）が
 * 実際に検証する正規化後の値と完全に同じパイプラインを再現する: named 欄は
 * `normalizeNamedLink` 適用後、続けて `normalizeInputText`（NFKC + ゼロ幅除去、
 * domain と共有）を通してから domain と同じ判定関数・上限定数
 * （`isValidIntroCardLinkFormat` / `INTRO_CARD_LINK_MAX_LENGTH`、どちらも
 * domain の export を再利用し二重定義しない）で判定する。
 * code-reviewer 指摘: `normalizeInputText` を経ずに判定すると、全角文字を含むが
 * 正規化後は有効なリンクを「無効」と誤判定し、domain が実際に失敗した箇所とは
 * 異なる欄へ focus してしまう不具合があったため、ここで揃える。
 * 「件数超過（5 件超）」はどの 1 欄の問題でもなく、domain（`validatedLinks`）も
 * 個々のリンクの形式より先に件数だけを見て `FIELD_TOO_LONG` を投げるため、
 * ここでも先に判定して `undefined` を返す（呼び出し側は既存の `overLinkCount`、
 * byte 予算超過と同じ見た目の赤字件数表示に委ねる）。これを省くと、件数超過が
 * 真因でも「たまたま形式が壊れている別リンク」の欄へ focus し、直下に無関係な
 * 「5 件までに」というメッセージが出てしまう（code-reviewer 指摘）。
 */
export function firstInvalidNamedLinkField(
  draft: IntroCardLinksDraft
): IntroCardLinkFieldKey | undefined {
  if (nonEmptyLinkCount(draft) > INTRO_CARD_MAX_LINKS) return undefined;

  const candidates: ReadonlyArray<{
    readonly key: IntroCardLinkFieldKey;
    readonly value: string;
  }> = [
    ...NAMED_LINK_SERVICES.map((service) => ({
      key: NAMED_LINK_FIELD_KEY[service],
      value: normalizeInputText(
        normalizeNamedLink(service, draft[service])
      ).trim(),
    })),
    { key: 'linkPortfolio', value: normalizeInputText(draft.portfolio).trim() },
    ...draft.otherLinks.map((link, index) => ({
      key: `otherLink-${index}` as const,
      value: normalizeInputText(link).trim(),
    })),
  ];
  for (const candidate of candidates) {
    if (candidate.value.length === 0) continue;
    if (
      !isValidIntroCardLinkFormat(candidate.value) ||
      candidate.value.length > INTRO_CARD_LINK_MAX_LENGTH
    ) {
      return candidate.key;
    }
  }
  return undefined;
}

/** 自由リンク欄の末尾に空の入力行を 1 件追加する。 */
export function addOtherLink(otherLinks: readonly string[]): readonly string[] {
  return [...otherLinks, ''];
}

/** 指定 index の自由リンク欄を削除する。 */
export function removeOtherLink(
  otherLinks: readonly string[],
  index: number
): readonly string[] {
  return otherLinks.filter((_, i) => i !== index);
}

/** 指定 index の自由リンク欄の値を更新する。 */
export function updateOtherLink(
  otherLinks: readonly string[],
  index: number,
  value: string
): readonly string[] {
  return otherLinks.map((link, i) => (i === index ? value : link));
}

export interface ClassifiedIntroCardLinks {
  readonly x: string;
  readonly github: string;
  readonly linkedin: string;
  readonly portfolio: string;
  readonly otherLinks: readonly string[];
}

const HOST_SERVICE_MATCHERS: ReadonlyArray<{
  readonly hosts: readonly string[];
  readonly service: NamedLinkService;
}> = [
  { hosts: ['x.com', 'twitter.com'], service: 'x' },
  { hosts: ['github.com'], service: 'github' },
  { hosts: ['linkedin.com'], service: 'linkedin' },
];

/** `URL` で解析できない値（保存済みデータの想定外の壊れ方）は `undefined` を返す。 */
function hostnameOf(link: string): string | undefined {
  try {
    return new URL(link).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

function matchedServiceOf(link: string): NamedLinkService | undefined {
  const host = hostnameOf(link);
  if (host === undefined) return undefined;
  return HOST_SERVICE_MATCHERS.find((entry) => entry.hosts.includes(host))
    ?.service;
}

/**
 * 保存済みの `links`（フラット配列、サービス種別のタグ無し）を編集画面の
 * 4 名前付き欄 + 自由リンクへ振り分ける。hostname が既知サービスに一致する
 * 最初の 1 件だけをその欄に割り当て、残り（2 件目以降の同一サービスや
 * 未知サービス）は自由リンクにする。Portfolio は任意ドメインを取りうり
 * hostname から判定できないため、常に空欄から始める（総件数は自由リンク側で
 * 保持されるためデータは失わない）。
 */
export function classifyIntroCardLinks(
  links: readonly string[]
): ClassifiedIntroCardLinks {
  let x = '';
  let github = '';
  let linkedin = '';
  const otherLinks: string[] = [];

  for (const link of links) {
    const service = matchedServiceOf(link);
    if (service === 'x' && x === '') {
      x = link;
    } else if (service === 'github' && github === '') {
      github = link;
    } else if (service === 'linkedin' && linkedin === '') {
      linkedin = link;
    } else {
      otherLinks.push(link);
    }
  }

  return { x, github, linkedin, portfolio: '', otherLinks };
}
