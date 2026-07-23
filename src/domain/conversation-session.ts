import {
  MAX_BRIDGE_SELECTION_PARTICIPANTS,
  MIN_BRIDGE_SELECTION_PARTICIPANTS,
} from './bridge-selection';
import type { IntroCard } from './intro-card';
import type { ParticipantId } from './session-identifiers';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェントが保持する、受信した自己紹介カード
 * (Intro Card) の非永続セッション。
 *
 * Storage Port を一切持たない（このファイルに `Promise` を返す関数は無く、
 * ディスク・バックアップへ書き込む経路が存在しない）。QR 再スキャン・手動貼り付けで
 * 取り込んだ他者の Intro Card はプロセス生存中のメモリだけに保持し、明示的な
 * セッション終了操作・画面遷移・アプリ終了で（この plain object への参照を手放す
 * だけで）即時に破棄される。
 *
 * [ADR-0026](../../docs/adr/0026-intro-card-pivot.md) の「アプリ側は相手の情報を
 * 受信・保存・パースしない。相互交換は Step 1 のスコープ外である」という記述は、
 * この会話エージェントが明示的に受信する Intro Card の範囲に限り
 * [ADR-0036](../../docs/adr/0036-on-device-conversation-agent.md) が supersede
 * する。ADR-0007 が定める Lounge / Public Passport / Pet Message の匿名性契約と、
 * Intro Card 自体の「Owner が自分自身について明示入力する」という ADR-0026 の
 * それ以外の契約は一切変更しない。
 *
 * 参加者数の上限は `bridge-selection.ts` の `MAX_BRIDGE_SELECTION_PARTICIPANTS`
 * をそのまま再利用する（新しい上限を作らない）。Step A の UI は 2 者間（自分 + 1 名）
 * に絞るが、この domain 型自体は将来の N 者間セッション（Step B）を見越して
 * 上限まで participant を保持できる形にする。
 */

export interface ConversationSessionParticipant {
  readonly participantId: ParticipantId;
  readonly introCard: IntroCard;
}

export interface ConversationSession {
  readonly self: ConversationSessionParticipant;
  readonly peers: readonly ConversationSessionParticipant[];
}

export type ConversationSessionErrorCode =
  | 'DUPLICATE_PARTICIPANT'
  | 'SESSION_FULL';

export class ConversationSessionError extends Error {
  readonly code: ConversationSessionErrorCode;

  constructor(code: ConversationSessionErrorCode, message: string) {
    super(message);
    this.name = 'ConversationSessionError';
    this.code = code;
  }
}

/** 自分自身の Intro Card だけを持つ、相手未受信のセッションを作る。 */
export function createConversationSession(
  self: ConversationSessionParticipant
): ConversationSession {
  return { self, peers: [] };
}

function hasParticipant(
  session: ConversationSession,
  participantId: ParticipantId
): boolean {
  return (
    session.self.participantId === participantId ||
    session.peers.some((peer) => peer.participantId === participantId)
  );
}

/**
 * QR 再スキャン・手動貼り付けで受信した相手の Intro Card をメモリへ追加する。
 * 合計人数（自分 + peers）が `MAX_BRIDGE_SELECTION_PARTICIPANTS` を超える場合、
 * または既に同じ participantId が存在する場合は追加しない。
 */
export function addConversationSessionPeer(
  session: ConversationSession,
  peer: ConversationSessionParticipant
): ConversationSession {
  if (hasParticipant(session, peer.participantId)) {
    throw new ConversationSessionError(
      'DUPLICATE_PARTICIPANT',
      '同じ参加者を重複して追加することはできません。'
    );
  }
  if (session.peers.length + 1 >= MAX_BRIDGE_SELECTION_PARTICIPANTS) {
    throw new ConversationSessionError(
      'SESSION_FULL',
      `会話エージェントの参加者は ${MAX_BRIDGE_SELECTION_PARTICIPANTS} 名までです。`
    );
  }
  return { ...session, peers: [...session.peers, peer] };
}

/** 誤って読み込んだ・気が変わった相手の Intro Card をメモリから外す。 */
export function removeConversationSessionPeer(
  session: ConversationSession,
  participantId: ParticipantId
): ConversationSession {
  return {
    ...session,
    peers: session.peers.filter((peer) => peer.participantId !== participantId),
  };
}

/**
 * 明示的な「終了する」操作・画面遷移で呼ぶ。受信済みの相手カードだけを消し、
 * 自分自身の Intro Card は保持したまま次のセッションを始められるようにする
 * （セッション自体を破棄したい場合は、呼び出し側がこの戻り値への参照ごと破棄する）。
 */
export function clearConversationSessionPeers(
  session: ConversationSession
): ConversationSession {
  return { ...session, peers: [] };
}

/** 自分自身を含む全参加者。`bridge-selection.ts` の入力を組み立てる際に使う。 */
export function conversationSessionParticipants(
  session: ConversationSession
): readonly ConversationSessionParticipant[] {
  return [session.self, ...session.peers];
}

/**
 * `MIN_BRIDGE_SELECTION_PARTICIPANTS`（2 名）未満では会話エージェントを起動
 * できない（設計文書のエッジケース: 「参加者が 2 名未満（自分のカードしか
 * 無い）」）。
 */
export function canStartConversationAgent(
  session: ConversationSession
): boolean {
  return (
    conversationSessionParticipants(session).length >=
    MIN_BRIDGE_SELECTION_PARTICIPANTS
  );
}
