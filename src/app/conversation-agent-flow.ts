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
  return result.kind === 'bridge'
    ? { ...result, conversationExample }
    : result;
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
 */
export const CONVERSATION_AGENT_SAMPLE_PEER_CARD: IntroCard = createIntroCard({
  name: 'Sample Explorer',
  themeIds: ['open-source', 'accessibility', 'cloud-infrastructure'],
});
