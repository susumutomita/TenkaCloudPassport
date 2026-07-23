import type { AgentModelInput } from './agent-model-provider';
import {
  type BridgeSelectionParticipant,
  type ParticipantBridgeResult,
  type SelectedBridge,
  selectBridges,
} from './bridge-selection';
import { CATALOG_VERSION, clueById, type LanguageCode } from './clue-catalog';
import type { ConversationSession } from './conversation-session';
import type { IntroCard } from './intro-card';
import type { ConfirmedClue, PublicPassport } from './passport';
import type { ParticipantId } from './session-identifiers';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェントの Evidence 抽出は新しい Provider
 * Contract を作らず、既存の `bridge-selection.ts`（N 者間 Fairness）と
 * `agent-model-provider.ts`（2 者間 Provider Contract、Rules / Local Agent 共通）を
 * そのまま再利用する。このファイルは両者の橋渡しを行うアダプタであり、
 * Fairness・Confidence の判定ロジックは複製しない。
 *
 * `selectBridges` が要求する `BridgeSelectionParticipant.passport: PublicPassport`
 * には `schemaVersion` / `catalogVersion` / `petName` が必須だが、Intro Card には
 * これらの自然な対応が無い。`petName` にはこのプレースホルダ定数を使う
 * （`evidenceNarrative`・`buildAgentModelDecisionFromEvidence` はどちらも
 * `petName` を読まないため、表示・Model への漏洩は無い）。
 */
export const CONVERSATION_AGENT_PLACEHOLDER_PET_NAME =
  'conversation-agent-participant';

/**
 * `IntroCard.themeIds`（会話テーマ、最大 3 件）を `PublicPassport.clues`
 * （`ConfirmedClue[]`）へ投影する。`languages` は Intro Card が持たないため常に
 * 空配列にする（`sharedLanguage` は空集合同士の共通言語を返さないため、この
 * フィールドだけを根拠に Evidence が水増しされることはない）。
 */
export function introCardToConversationPassport(
  card: IntroCard
): PublicPassport {
  const clues: readonly ConfirmedClue[] = (card.themeIds ?? []).map(
    (value) => ({
      value,
      category: clueById(value).category,
      source: 'owner-selected',
    })
  );
  return {
    schemaVersion: 2,
    catalogVersion: CATALOG_VERSION,
    petName: CONVERSATION_AGENT_PLACEHOLDER_PET_NAME,
    clues,
    languages: [],
  };
}

function toBridgeSelectionParticipant(participant: {
  readonly participantId: ParticipantId;
  readonly introCard: IntroCard;
}): BridgeSelectionParticipant {
  return {
    participantId: participant.participantId,
    passport: introCardToConversationPassport(participant.introCard),
  };
}

/**
 * `ConversationSession` の全参加者（自分 + 受信済みの相手）から、
 * `bridge-selection.ts` の Fairness Rule に従って自分に割り当てられた
 * `ParticipantBridgeResult`（`bridge` または `no-signal`）を返す唯一の入口。
 * Step A の UI は 2 者間（自分 + 1 名）に絞るが、この関数自体は
 * `MAX_BRIDGE_SELECTION_PARTICIPANTS` までの N 者間セッションをそのまま扱える。
 */
export function selectConversationBridge(
  session: ConversationSession
): ParticipantBridgeResult {
  const participants = [session.self, ...session.peers].map(
    toBridgeSelectionParticipant
  );
  const outcomes = selectBridges({ participants });
  const outcome = outcomes.find(
    (item) => item.participantId === session.self.participantId
  );
  return outcome?.result ?? { kind: 'no-signal' };
}

/**
 * 選定済みの Bridge から、既存の 2 者間 `AgentModelProvider` Contract
 * （`AgentModelInput` / `createAgentProviderSessionRunner`）へそのまま渡せる
 * 入力を組み立てる。
 *
 * `bridge.participantIds` が自分を含む厳密に 2 名（自分 + 相手 1 名）の場合だけ
 * `AgentModelInput` を返す。3 名以上の Bridge（Step B の N 者間セッションで
 * 起こり得る、`bridge-selection.ts` の 3 人 Bridge 統合）は、この Repo が持つ
 * `AgentModelInput` が 2 者間専用の Contract であるため対象外とし `null` を返す
 * （ADR-0036「N 者間の Evidence 抽出は Rules で全ペア同期計算し、Local Agent は
 * 最終選定後の 1 組にだけ適用する」）。呼び出し側は `null` のとき、Rules が
 * 既に計算済みの `bridge.reason` / `bridge.opener` をそのまま使う。
 */
export function buildConversationAgentModelInput(
  session: ConversationSession,
  bridge: SelectedBridge,
  deadlineAtWallClockMs: number,
  language?: LanguageCode
): AgentModelInput | null {
  if (bridge.participantIds.length !== 2) return null;
  if (!bridge.participantIds.includes(session.self.participantId)) {
    return null;
  }
  const peerId = bridge.participantIds.find(
    (participantId) => participantId !== session.self.participantId
  );
  const peer = session.peers.find(
    (candidate) => candidate.participantId === peerId
  );
  if (peer === undefined) return null;
  return {
    ownerPassport: introCardToConversationPassport(session.self.introCard),
    encounteredPassport: introCardToConversationPassport(peer.introCard),
    ...(language === undefined ? {} : { language }),
    deadlineAtWallClockMs,
  };
}
