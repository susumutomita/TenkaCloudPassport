import { INTRO_CARD_MAX_LINKS } from '../domain/intro-card';

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
