import { createIntroCard, type IntroCard } from '../domain/intro-card';
import { decodeIntroCardUrlFragment } from '../protocol/intro-card-url';
import type { ConversationExampleViewState } from './conversation-example-flow';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェント（Step A）の画面が必要とする、
 * Provider Contract そのものには属さない小さな純粋関数群。QR 再スキャン・
 * 手動貼り付けのどちらから得た文字列も同じ 1 関数（`decodeConversationAgentPeerCard`）
 * へ通し、`AgentModelInput` の組み立ては `src/domain/conversation-agent-evidence.ts`
 * にそのまま任せる（重複実装しない）。
 */

export interface ConversationExampleResultView {
  readonly state: ConversationExampleViewState;
  readonly onGenerate: () => void;
  readonly onCancel: () => void;
}

export type ConversationAgentResultState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'no-signal' }
  | {
      readonly kind: 'bridge';
      readonly reason: string;
      readonly opener: string;
      /**
       * Step B（Issue 104 受入基準）: 3 名以上のセッションでは「全ペアを評価した
       * 結果どの 1 組が選ばれたか」が分からないと結果を使えない。自分以外の
       * Bridge 参加者の表示名を持ち、画面が Reason / Opener と併記する。
       * 2 者間セッションでも常に 1 件入る。
       */
      readonly partnerNames: readonly string[];
    }
  | { readonly kind: 'error'; readonly message: string };

export type ConversationAgentPresentedResultState =
  | Exclude<ConversationAgentResultState, { readonly kind: 'bridge' }>
  | (Extract<ConversationAgentResultState, { readonly kind: 'bridge' }> & {
      readonly conversationExample: ConversationExampleResultView;
    });

export const INITIAL_CONVERSATION_AGENT_RESULT: ConversationAgentResultState = {
  kind: 'idle',
};

/** Hook が持つ Bridge 本体と会話例状態を、画面へ渡す 1 つの View Model に合成する。 */
export function presentConversationAgentResult(
  result: ConversationAgentResultState,
  conversationExample: ConversationExampleResultView
): ConversationAgentPresentedResultState {
  return result.kind === 'bridge' ? { ...result, conversationExample } : result;
}

/**
 * QR 再スキャン（`QrScannerPort.scan()` の生文字列）・手動貼り付けのどちらから
 * 得た入力も受理する。完全な自己紹介ページ URL
 * （`https://card.tenkacloud.com/c/#<fragment>`）だけでなく、フラグメント単体を
 * 貼り付けた場合（メッセージアプリ等がリンクの一部だけをコピーさせる場合がある）
 * も同じ 1 経路で扱う。不正な入力は `decodeIntroCardUrlFragment` が投げる
 * `IntroCardError`（`INVALID_SHARE_URL` 等）をそのまま伝える。
 */
export function decodeConversationAgentPeerCard(raw: string): IntroCard {
  const trimmed = raw.trim();
  const hashIndex = trimmed.lastIndexOf('#');
  const fragment = hashIndex === -1 ? trimmed : trimmed.slice(hashIndex + 1);
  return decodeIntroCardUrlFragment(fragment);
}

/**
 * 設計文書「審査官が単独で試せる審査戦略」: App Store 審査官が 2 台目の端末・
 * 2 人目の協力者を用意できなくても、この機能を単独で実演できるよう同梱する
 * 固定サンプル。実在人物の氏名・連絡先は使わない（審査メモにも明記する）。
 * QR 生成・URL 往復を経ず、`ConversationSession` へ直接注入するテスト専用の
 * 内部経路からだけ使う（画面から直接 import せず、この 1 か所を正本にする）。
 *
 * 自由記述（title・selfIntro）を持たせる理由（ADR-0043、owner 実機で観測）:
 * grounded-quote 経路は両者の自由記述が揃ったときだけ発火する。サンプルが
 * themeIds だけだと、owner がテーマを合わせない限り必ず no-signal になり、
 * 端末内 LLM の引用提示をサンプルで実演できなかった。本文は架空の内容で、
 * 話題の幅（趣味・仕事・学び）を持たせて owner 側の自己紹介文と意味的に
 * 重なりやすくする。引用は本文の部分文字列としてそのまま画面に出るため、
 * URL・メールアドレス・長い数字列は含めない（テストで契約として固定）。
 */
export const CONVERSATION_AGENT_SAMPLE_PEER_CARD: IntroCard = createIntroCard({
  name: 'Sample Explorer',
  title: 'フィールドリサーチャー',
  selfIntro:
    '週末は近くの低い山を歩いて、自然の中で考えごとをするのが好きです。' +
    'ふだんはクラウド基盤の運用を担当していて、オープンソースのツールを日常的に使っています。' +
    '最近はアクセシビリティの勉強会に顔を出して、誰にでも使いやすい画面の作り方を学んでいます。' +
    '淹れたてのコーヒーと、地域の小さなイベントに出かけることも楽しみにしています。',
  themeIds: ['open-source', 'accessibility', 'cloud-infrastructure'],
});
