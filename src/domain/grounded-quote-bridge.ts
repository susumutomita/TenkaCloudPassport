import {
  containsContactLikeText,
  containsForbiddenTextUnicode,
} from './text-content-guards';

/**
 * Issue 147: 端末内モデルが「共通点を見つけた」と言うとき、その根拠を検証可能にする層。
 *
 * ADR-0036 以来の Provider Contract は、モデルの出力を Rules が導出済みの Evidence ID
 * の部分集合に制限してきた。幻覚（実在しない共通点の断定）を構造で防ぐためだが、その
 * 代償として、モデルは Rules が見つけられなかった共通点を出せず、結果はカタログ
 * checkbox の一致そのものになっていた。
 *
 * ここでは別の方法で同じ保証を得る。モデルには自分の言葉で書かせず、両者の自己紹介文
 * から根拠になった箇所を「そのまま抜き出させる」。表示に使う断片が入力文の部分文字列で
 * あることを機械的に照合できるため、モデルが事実を創作する余地が無い。どの断片と
 * どの断片を結び付けるか（「低山を歩く」と「アウトドアが好き」は同じ話題だ、という
 * 意味的な判断）だけがモデルの仕事になり、そこが checkbox 一致では届かない部分になる。
 *
 * 正本は `docs/design/agent-model-provider-contract.md`。
 */

/**
 * 引用 1 件の上限。長くすると自己紹介文の丸ごと転記に近づき、「共通点の提示」ではなく
 * 「相手の文章の再掲」になるため短く抑える。日本語 1 文に収まる長さを目安にした。
 */
export const AGENT_MODEL_QUOTE_MAX_CHARS = 40;

/**
 * モデルへ渡す自己紹介文 1 人分の上限。`IntroCard` の `selfIntro`（300）に `title`
 * （50）と `organization`（50）と区切りを足した長さを収める。
 */
export const AGENT_MODEL_PROFILE_TEXT_MAX_CHARS = 420;

export interface GroundedQuoteBridgeInput {
  /** 自分の自己紹介文。未設定なら引用の根拠を確かめられない。 */
  readonly ownerProfileText?: string | undefined;
  /** 相手の自己紹介文。未設定なら引用の根拠を確かめられない。 */
  readonly encounteredProfileText?: string | undefined;
  /** Native 境界から来る未検証値。型を信用せずこの関数で確かめる。 */
  readonly ownerQuote: unknown;
  readonly peerQuote: unknown;
}

export interface VerifiedGroundedQuoteBridge {
  readonly ownerQuote: string;
  readonly peerQuote: string;
}

/** 引用 1 件を、対応する自己紹介文に実在する表示可能な断片へ正規化する。 */
function verifyQuote(
  quote: unknown,
  profileText: string | undefined
): string | null {
  if (profileText === undefined || typeof quote !== 'string') return null;
  const trimmed = quote.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > AGENT_MODEL_QUOTE_MAX_CHARS) return null;
  if (containsForbiddenTextUnicode(trimmed)) return null;
  if (containsContactLikeText(trimmed)) return null;
  return profileText.includes(trimmed) ? trimmed : null;
}

/**
 * モデルが挙げた 2 つの引用を検証する。どちらか一方でも「対応する自己紹介文の中に
 * そのまま存在する」と言えなければ `null` を返し、呼び出し側は Rules の結果へ倒す。
 * 静かに握り潰すのではなく、根拠を確かめられない主張は表示しない、という判断である。
 */
export function verifyGroundedQuoteBridge(
  input: GroundedQuoteBridgeInput
): VerifiedGroundedQuoteBridge | null {
  const ownerQuote = verifyQuote(input.ownerQuote, input.ownerProfileText);
  if (ownerQuote === null) return null;
  const peerQuote = verifyQuote(input.peerQuote, input.encounteredProfileText);
  if (peerQuote === null) return null;
  return { ownerQuote, peerQuote };
}
