import type { AgentModelInput } from './agent-model-provider';
import {
  type BridgeSelectionParticipant,
  type ParticipantBridgeResult,
  type SelectedBridge,
  selectBridges,
} from './bridge-selection';
import { CATALOG_VERSION, clueById, type LanguageCode } from './clue-catalog';
import type {
  ConversationSession,
  ConversationSessionParticipant,
} from './conversation-session';
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

/**
 * Issue 147: 自己紹介カードの自由記述を、端末内モデルへ渡す 1 人分のテキストへまとめる。
 *
 * ここまでの実装は `themeIds`（カタログ checkbox、最大 3 件）しかモデルへ渡しておらず、
 * 「エージェントが共通点を探す」と言いながら実体は checkbox の共通集合だった。肩書き・
 * 所属・自己紹介文は、まさに人が共通点を見つける手掛かりであり、これを渡さない限り
 * モデルに読む材料が無い。氏名・メール・電話・リンクは共通点の根拠にする必要が無く、
 * 渡す理由も無いため含めない。
 *
 * 区切りは制御文字を使わない（`model-safety-boundary.ts` の Unicode 検査が制御文字を
 * 拒否するため、改行では渡せない）。
 */
const PROFILE_TEXT_SEPARATOR = ' / ';

export function introCardProfileText(card: IntroCard): string | undefined {
  const parts = [card.title, card.organization, card.selfIntro]
    .map((part) => part?.trim())
    .filter((part): part is string => part !== undefined && part.length > 0);
  if (parts.length === 0) return undefined;
  return parts.join(PROFILE_TEXT_SEPARATOR);
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
 * Step B（Issue 104 受入基準「最も根拠の強い 1 組へ会話理由と最初の質問を提示する」）:
 * 選定済み Bridge のうち自分以外の参加者の表示名を `participantIds` の順で返す。
 * 参加者が 3 名以上いるセッションでは「誰と誰の組が選ばれたか」が画面から
 * 読み取れないと結果が使えないため、UI はこの名前を Reason / Opener と併記する。
 * `session.peers` に存在しない ID（Bridge と session の不整合）は名前を作れないため
 * 除外する（`buildConversationAgentModelInput` の同種の防御と同じ扱い）。
 */
export function conversationBridgePartnerNames(
  session: ConversationSession,
  bridge: SelectedBridge
): readonly string[] {
  return bridge.participantIds
    .filter((participantId) => participantId !== session.self.participantId)
    .map(
      (participantId) =>
        session.peers.find(
          (candidate) => candidate.participantId === participantId
        )?.introCard.name
    )
    .filter((name): name is string => name !== undefined);
}

/**
 * `buildConversationAgentModelInput`（Bridge 前提）と
 * `buildConversationAgentModelInputWithoutBridge`（ADR-0047、Bridge 無し）が共有する
 * 組み立てロジック。Passport 投影・profile text 同梱・deadline・language の規則は
 * ここ 1 箇所だけに書き、両関数のどちらかだけを直して規則がドリフトすることを防ぐ。
 */
function assembleAgentModelInput(
  ownerCard: IntroCard,
  peerCard: IntroCard,
  deadlineAtWallClockMs: number,
  language?: LanguageCode
): AgentModelInput {
  const ownerProfileText = introCardProfileText(ownerCard);
  const encounteredProfileText = introCardProfileText(peerCard);
  return {
    ownerPassport: introCardToConversationPassport(ownerCard),
    encounteredPassport: introCardToConversationPassport(peerCard),
    ...(language === undefined ? {} : { language }),
    // Issue 147: 片方でも自由記述が無ければ引用の照合が成立しないため、両方揃った
    // ときだけ渡す（`model-safety-boundary.ts` も同じ条件で grounded-bridge を出す）。
    ...(ownerProfileText !== undefined && encounteredProfileText !== undefined
      ? { ownerProfileText, encounteredProfileText }
      : {}),
    deadlineAtWallClockMs,
  };
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
  return assembleAgentModelInput(
    session.self.introCard,
    peer.introCard,
    deadlineAtWallClockMs,
    language
  );
}

/**
 * ADR-0047: ADR-0043 は「themeIds（Rules bridge）の一致が 1 件も無いペアでも、
 * 自己紹介文が重なっていれば共通点を提示できる」ことを約束したが、
 * `planConversationAgentStart` は `selectConversationBridge` が `no-signal` を
 * 返した時点でモデルを一度も呼ばずに `no-signal` を確定させていた。この関数は
 * Rules bridge の有無に関わらず、自分 + 相手 1 名の IntroCard から直接
 * `AgentModelInput` を組み立てる入口を提供する。
 *
 * 「両者の自由記述（`introCardProfileText`: title / organization / selfIntro の
 * 連結）が揃っているか」だけを判定し、揃っていなければ `null` を返す。揃っていない
 * 場合、themeIds も一致していない前提の下では Rules も Evidence 0 件で必ず
 * `no-signal` になり、モデルを呼んでも結果が変わらないためである
 * （ADR-0023 の単一 Native Lane を無駄に占有しない）。
 *
 * 「peers がちょうど 1 名か」の判定は呼び出し側（`planConversationAgentStart`）が
 * 持つ。N 者間セッション（peers 2 名以上）への適用は ADR-0036「Local Agent は
 * 最終選定後の 1 組にだけ適用する」の範囲外のため、この関数はそのまま単一の
 * peer を受け取るだけの形にし、参加者数の判定ロジックを複製しない。
 */
export function buildConversationAgentModelInputWithoutBridge(
  self: ConversationSessionParticipant,
  peer: ConversationSessionParticipant,
  deadlineAtWallClockMs: number,
  language?: LanguageCode
): AgentModelInput | null {
  const input = assembleAgentModelInput(
    self.introCard,
    peer.introCard,
    deadlineAtWallClockMs,
    language
  );
  if (
    input.ownerProfileText === undefined ||
    input.encounteredProfileText === undefined
  ) {
    return null;
  }
  return input;
}
