import {
  CLUE_IDS,
  type ClueCategory,
  type ClueId,
  clueById,
  LANGUAGE_CATALOG,
  LANGUAGE_CODES,
  type LanguageCode,
} from './clue-catalog';
import type { ConfirmedClue, PublicPassport } from './passport';
import type { ParticipantId } from './session-identifiers';
import { findFirstSharedConfirmedClue } from './shared-clue-match';

/**
 * Issue 12: 大量の弱い推薦ではなく、確認済みの共通点または相互補完から「今すぐ話せる理由」を
 * 参加者ごとに最大 1 つだけ導く、根拠付き Bridge 選定アルゴリズム。アルゴリズムと
 * Tie-break の詳細は `docs/design/bridge-selection.md` を正本とする。
 *
 * Layer 1（このファイルの前半）は Participant ID を持たない Public Passport のペアだけを
 * 見る純粋関数で、2 者間の既存 Live 経路（`rules-provider.ts` /
 * `interaction-discovery-provider.ts`）と、この下の Layer 2（`selectBridges`）の両方が
 * 同じ判定ロジックを共有する。Topic 判定は既存の `findFirstSharedConfirmedClue`
 * （`shared-clue-match.ts`）をそのまま再利用し、重複実装しない。
 */

export const MIN_BRIDGE_SELECTION_PARTICIPANTS = 2;
export const MAX_BRIDGE_SELECTION_PARTICIPANTS = 6;

/** 1 組の Pair / Triple 候補に必要な最小 Evidence 件数。これ未満は no-signal になる。 */
export const MIN_EVIDENCE_FOR_BRIDGE = 1;

// --- Layer 1: ID を持たない Public Passport ペアの純粋判定 -----------------------------

export interface OfferNeedComplementMatch {
  readonly category: ClueCategory;
  /** どちらの引数（a / b）が offers 側だったかを示す。 */
  readonly offerSide: 'a' | 'b';
  readonly offerClue: ConfirmedClue;
  readonly seekClue: ConfirmedClue;
}

interface OfferNeedMatch {
  readonly offer: ConfirmedClue;
  readonly seek: ConfirmedClue;
  readonly category: ClueCategory;
}

function firstMatchingSeekClue(
  seeker: PublicPassport,
  category: ClueCategory
): ConfirmedClue | undefined {
  for (const seekClueId of CLUE_IDS) {
    const seekDefinition = clueById(seekClueId);
    if (seekDefinition.passportField !== 'lookingFor') continue;
    if (seekDefinition.category !== category) continue;
    const seekClue = seeker.clues.find((clue) => clue.value === seekClueId);
    if (seekClue) return seekClue;
  }
  return undefined;
}

/**
 * offerer が offers で公開した手掛かりのうち、seeker が lookingFor で公開した手掛かりと
 * 同じ category を持つものをカタログ順で最初の 1 組だけ返す（Topic 判定と同じ規律）。
 */
function firstOfferNeedMatch(
  offerer: PublicPassport,
  seeker: PublicPassport
): OfferNeedMatch | undefined {
  for (const offerClueId of CLUE_IDS) {
    const offerDefinition = clueById(offerClueId);
    if (offerDefinition.passportField !== 'offers') continue;
    const offerClue = offerer.clues.find((clue) => clue.value === offerClueId);
    if (!offerClue) continue;
    const seekClue = firstMatchingSeekClue(seeker, offerDefinition.category);
    if (seekClue) {
      return {
        offer: offerClue,
        seek: seekClue,
        category: offerDefinition.category,
      };
    }
  }
  return undefined;
}

/**
 * a・b 間の Offer/Need 相互補完を両方向（a が提供・b が探す、b が提供・a が探す）で
 * 調べる。双方向とも独立した根拠になり得るため、最大 2 件を返す。
 */
export function offerNeedComplementMatches(
  a: PublicPassport,
  b: PublicPassport
): readonly OfferNeedComplementMatch[] {
  const matches: OfferNeedComplementMatch[] = [];
  const aOffers = firstOfferNeedMatch(a, b);
  if (aOffers) {
    matches.push({
      category: aOffers.category,
      offerSide: 'a',
      offerClue: aOffers.offer,
      seekClue: aOffers.seek,
    });
  }
  const bOffers = firstOfferNeedMatch(b, a);
  if (bOffers) {
    matches.push({
      category: bOffers.category,
      offerSide: 'b',
      offerClue: bOffers.offer,
      seekClue: bOffers.seek,
    });
  }
  return matches;
}

/**
 * `offerNeedComplementMatches` の先頭 1 件（カタログ順で最初に見つかった相互補完）だけを
 * 返す。Topic 判定（`findFirstSharedConfirmedClue`）と同じ「複数あっても代表 1 件」という
 * 規律で、2 者間 Live 経路（`rules-provider.ts` / `interaction-discovery-provider.ts`）が
 * 同じ 1 行を重複させないための共有ヘルパー。
 */
export function firstOfferNeedComplementMatch(
  a: PublicPassport,
  b: PublicPassport
): OfferNeedComplementMatch | undefined {
  return offerNeedComplementMatches(a, b)[0];
}

/** a・b で共有する Language をカタログ順で最初の 1 件だけ返す。 */
export function sharedLanguage(
  a: PublicPassport,
  b: PublicPassport
): LanguageCode | undefined {
  const bLanguages = new Set(b.languages);
  return LANGUAGE_CODES.find(
    (code) => a.languages.includes(code) && bLanguages.has(code)
  );
}

// --- Layer 2: Participant ID を伴う N 者間 Bridge 選定 ----------------------------------

export interface SharedTopicEvidence {
  readonly kind: 'shared-topic';
  readonly evidenceId: string;
  readonly clueId: ClueId;
}

export interface OfferNeedComplementEvidence {
  readonly kind: 'offer-need-complement';
  readonly evidenceId: string;
  readonly category: ClueCategory;
  readonly offer: {
    readonly participantId: ParticipantId;
    readonly clueId: ClueId;
  };
  readonly seek: {
    readonly participantId: ParticipantId;
    readonly clueId: ClueId;
  };
}

export interface SharedLanguageEvidence {
  readonly kind: 'shared-language';
  readonly evidenceId: string;
  readonly language: LanguageCode;
}

export type BridgeEvidence =
  | SharedTopicEvidence
  | OfferNeedComplementEvidence
  | SharedLanguageEvidence;

export type BridgeConfidence = 'promising' | 'possible';

export interface SelectedBridge {
  /** この Bridge に参加する全員（自分自身も含む）。「誰と話すか」は自分以外を指す。 */
  readonly participantIds: readonly ParticipantId[];
  readonly reason: string;
  readonly opener: string;
  readonly evidenceIds: readonly string[];
  readonly confidence: BridgeConfidence;
}

export type ParticipantBridgeResult =
  | { readonly kind: 'bridge'; readonly bridge: SelectedBridge }
  | { readonly kind: 'no-signal' };

export interface ParticipantBridgeOutcome {
  readonly participantId: ParticipantId;
  readonly result: ParticipantBridgeResult;
}

export interface BridgeSelectionParticipant {
  readonly participantId: ParticipantId;
  readonly passport: PublicPassport;
}

export interface BridgeSelectionInput {
  readonly participants: readonly BridgeSelectionParticipant[];
  /** Owner が過去に拒否した参加者の組。この組を含む新規 Bridge は生成しない。 */
  readonly excludedPairs?: ReadonlySet<string>;
}

export type BridgeSelectionErrorCode =
  | 'INVALID_PARTICIPANT_COUNT'
  | 'DUPLICATE_PARTICIPANT';

export class BridgeSelectionError extends Error {
  readonly code: BridgeSelectionErrorCode;

  constructor(code: BridgeSelectionErrorCode, message: string) {
    super(message);
    this.name = 'BridgeSelectionError';
    this.code = code;
  }
}

/** Owner Rejection の Exclusion Set を組み立てる正規化済み Pair Key。 */
export function bridgePairKey(a: ParticipantId, b: ParticipantId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isPairExcluded(
  a: ParticipantId,
  b: ParticipantId,
  excludedPairs: ReadonlySet<string>
): boolean {
  return excludedPairs.has(bridgePairKey(a, b));
}

function canonicalOrder(
  a: BridgeSelectionParticipant,
  b: BridgeSelectionParticipant
): readonly [BridgeSelectionParticipant, BridgeSelectionParticipant] {
  return a.participantId < b.participantId ? [a, b] : [b, a];
}

/**
 * 2 者間の全 Evidence（Topic 共通・Offer/Need 相互補完・共通 Language）を、参加者の
 * 入力順序に依存しない正規化済み順序（`canonicalOrder`）で組み立てる。
 */
function buildPairEvidence(
  a: BridgeSelectionParticipant,
  b: BridgeSelectionParticipant
): readonly BridgeEvidence[] {
  const [lo, hi] = canonicalOrder(a, b);
  const evidence: BridgeEvidence[] = [];

  const topic = findFirstSharedConfirmedClue({
    ownerPassport: lo.passport,
    encounteredPassport: hi.passport,
  });
  if (topic) {
    evidence.push({
      kind: 'shared-topic',
      evidenceId: `topic:${topic.value}:${lo.participantId}:${hi.participantId}`,
      clueId: topic.value,
    });
  }

  for (const match of offerNeedComplementMatches(lo.passport, hi.passport)) {
    const offerParticipantId =
      match.offerSide === 'a' ? lo.participantId : hi.participantId;
    const seekParticipantId =
      match.offerSide === 'a' ? hi.participantId : lo.participantId;
    evidence.push({
      kind: 'offer-need-complement',
      evidenceId: `complement:${match.category}:${offerParticipantId}:${match.offerClue.value}:${seekParticipantId}:${match.seekClue.value}`,
      category: match.category,
      offer: {
        participantId: offerParticipantId,
        clueId: match.offerClue.value,
      },
      seek: { participantId: seekParticipantId, clueId: match.seekClue.value },
    });
  }

  const language = sharedLanguage(lo.passport, hi.passport);
  if (language) {
    evidence.push({
      kind: 'shared-language',
      evidenceId: `language:${language}:${lo.participantId}:${hi.participantId}`,
      language,
    });
  }

  return evidence;
}

/**
 * Evidence 種別と件数から `promising | possible` の定性的 Confidence を導く。数値の
 * 人物 Score は一切扱わない。2 件以上の独立した Evidence があれば `promising`。1 件だけの
 * 場合は、Offer/Need 相互補完（双方が動ける具体的な理由）だけを `promising` とし、
 * Topic 共通・共通 Language 単独は `possible` とする。
 */
export function bridgeConfidence(
  evidence: readonly BridgeEvidence[]
): BridgeConfidence {
  const [only] = evidence;
  if (!only) {
    throw new Error('Confidence の判定には 1 件以上の Evidence が必要です。');
  }
  if (evidence.length >= 2) return 'promising';
  return only.kind === 'offer-need-complement' ? 'promising' : 'possible';
}

function evidenceNarrative(evidence: BridgeEvidence): {
  readonly reason: string;
  readonly opener: string;
} {
  if (evidence.kind === 'shared-topic') {
    const label = clueById(evidence.clueId).label;
    return {
      reason: `お互いが「${label}」という確認済みの共通点を公開しています。`,
      opener: `「${label}」について話しかけてみましょう。`,
    };
  }
  if (evidence.kind === 'offer-need-complement') {
    const offerLabel = clueById(evidence.offer.clueId).label;
    const seekLabel = clueById(evidence.seek.clueId).label;
    return {
      reason: `一方が提供できる「${offerLabel}」と、もう一方が探している「${seekLabel}」が結び付きます。`,
      opener: `「${offerLabel}」を手掛かりに話しかけてみましょう。`,
    };
  }
  const label = LANGUAGE_CATALOG[evidence.language].label;
  return {
    reason: `共通して使える言語「${label}」があります。`,
    opener: `「${label}」で話しかけてみましょう。`,
  };
}

/**
 * Evidence の集合から `SelectedBridge`（誰と話すか・確認済みの理由・最初の一言・
 * 使用した Evidence ID・定性的 Confidence）を組み立てる。全 Claim は `evidenceIds` に
 * 挙げた Evidence だけから構成し、参加者の自由記述（Owner Alias 等）は一切参照しない。
 * `selectBridges` の内部でも使う、この Bridge Contract の唯一の組み立て関数。
 */
export function buildSelectedBridgeFromEvidence(
  participantIds: readonly ParticipantId[],
  evidence: readonly BridgeEvidence[]
): SelectedBridge {
  const narratives = evidence.map(evidenceNarrative);
  const [firstNarrative] = narratives;
  if (!firstNarrative) {
    throw new Error('Bridge の生成には 1 件以上の Evidence が必要です。');
  }
  return {
    participantIds,
    reason: narratives.map((narrative) => narrative.reason).join(''),
    opener: firstNarrative.opener,
    evidenceIds: evidence.map((item) => item.evidenceId),
    confidence: bridgeConfidence(evidence),
  };
}

interface PairCandidate {
  readonly participants: readonly [
    BridgeSelectionParticipant,
    BridgeSelectionParticipant,
  ];
  readonly evidence: readonly BridgeEvidence[];
}

/**
 * Pair 候補の優先順位。Fairness Rule の Tie-break は、Input 順序ではなく Evidence の
 * 内容（Confidence → Evidence 件数）と、正規化した参加者 ID の辞書順だけで決まる。
 * 参加者 ID は同じ組み合わせなら常に同じ値になるため、この比較は入力配列の順序を
 * 変えても同じ結果を返す（Order-independence）。
 */
function comparePairCandidates(x: PairCandidate, y: PairCandidate): number {
  const xConfidence = bridgeConfidence(x.evidence);
  const yConfidence = bridgeConfidence(y.evidence);
  if (xConfidence !== yConfidence) {
    return xConfidence === 'promising' ? -1 : 1;
  }
  if (x.evidence.length !== y.evidence.length) {
    return y.evidence.length - x.evidence.length;
  }
  const [xLo, xHi] = x.participants;
  const [yLo, yHi] = y.participants;
  const xKey = bridgePairKey(xLo.participantId, xHi.participantId);
  const yKey = bridgePairKey(yLo.participantId, yHi.participantId);
  return xKey < yKey ? -1 : 1;
}

function buildPairCandidates(
  participants: readonly BridgeSelectionParticipant[],
  excludedPairs: ReadonlySet<string>
): readonly PairCandidate[] {
  const candidates: PairCandidate[] = [];
  for (const [index, a] of participants.entries()) {
    for (const b of participants.slice(index + 1)) {
      if (isPairExcluded(a.participantId, b.participantId, excludedPairs)) {
        continue;
      }
      const evidence = buildPairEvidence(a, b);
      if (evidence.length < MIN_EVIDENCE_FOR_BRIDGE) continue;
      candidates.push({ participants: canonicalOrder(a, b), evidence });
    }
  }
  return candidates.sort(comparePairCandidates);
}

/**
 * Fairness Rule「各参加者は主要 Bridge に最大 1 回だけ登場する」を、優先順位順に候補を
 * 走査する欲張り法で満たす。両者がまだ未確定の Pair だけを確定させ、どちらか一方が
 * 既に確定していれば skip する。
 */
function assignPairsGreedily(candidates: readonly PairCandidate[]): {
  readonly assignedPairs: readonly PairCandidate[];
  readonly claimed: ReadonlySet<ParticipantId>;
} {
  const claimed = new Set<ParticipantId>();
  const assignedPairs: PairCandidate[] = [];
  for (const candidate of candidates) {
    const [a, b] = candidate.participants;
    if (claimed.has(a.participantId) || claimed.has(b.participantId)) {
      continue;
    }
    claimed.add(a.participantId);
    claimed.add(b.participantId);
    assignedPairs.push(candidate);
  }
  return { assignedPairs, claimed };
}

function findLoneLeftover(
  participants: readonly BridgeSelectionParticipant[],
  claimed: ReadonlySet<ParticipantId>
): BridgeSelectionParticipant | undefined {
  const unclaimed = participants.filter(
    (participant) => !claimed.has(participant.participantId)
  );
  if (unclaimed.length !== 1) return undefined;
  return unclaimed[0];
}

interface TripleMerge {
  readonly pairIndex: number;
  readonly participantIds: readonly ParticipantId[];
  readonly evidence: readonly BridgeEvidence[];
}

/**
 * 3 人 Bridge は 3 つの辺（X-Y、lonely-X、lonely-Y）それぞれの Evidence を独立に計算する。
 * 3 人が同じ確認済み手掛かり・同じ Language を持つ場合、これは 3 辺すべてから同じ 1 つの
 * 事実として検出されてしまう。事実そのもの（Evidence の内容）が同じなら、どの辺から
 * 見つかったかに関わらず 1 件として数える鍵。Offer/Need 相互補完は Offerer / Seeker が
 * 常に特定の 2 名に固定される（辺をまたいで同じ 2 名・同じ手掛かりが重複することはない）
 * ため、Participant ID を鍵に含めても実質的な去重は起きない。
 */
function evidenceFactKey(evidence: BridgeEvidence): string {
  if (evidence.kind === 'shared-topic') return `topic:${evidence.clueId}`;
  if (evidence.kind === 'shared-language') {
    return `language:${evidence.language}`;
  }
  return [
    'complement',
    evidence.category,
    evidence.offer.participantId,
    evidence.offer.clueId,
    evidence.seek.participantId,
    evidence.seek.clueId,
  ].join(':');
}

/**
 * 3 人 Bridge へ統合する際、複数の辺から重複して検出された同一の事実を 1 件へ去重する。
 * `shared-topic` / `shared-language` は特定のペアではなく Bridge の全員に関する事実なので、
 * 去重後の Evidence ID も全員の Participant ID で再構成する（元は 1 辺の 2 名だけを
 * 指していた ID をそのまま残さない）。去重しなければ、同じ事実が Evidence 件数を水増しして
 * Confidence を実際より強く見せ、`reason` にも同じ文が複数回並んでしまう。
 */
function dedupeGroupEvidence(
  participantIds: readonly ParticipantId[],
  evidence: readonly BridgeEvidence[]
): readonly BridgeEvidence[] {
  const groupScope = participantIds.join(',');
  const seenFactKeys = new Set<string>();
  const deduped: BridgeEvidence[] = [];
  for (const item of evidence) {
    const factKey = evidenceFactKey(item);
    if (seenFactKeys.has(factKey)) continue;
    seenFactKeys.add(factKey);
    if (item.kind === 'shared-topic') {
      deduped.push({
        kind: 'shared-topic',
        evidenceId: `topic:${item.clueId}:${groupScope}`,
        clueId: item.clueId,
      });
    } else if (item.kind === 'shared-language') {
      deduped.push({
        kind: 'shared-language',
        evidenceId: `language:${item.language}:${groupScope}`,
        language: item.language,
      });
    } else {
      deduped.push(item);
    }
  }
  return deduped;
}

/**
 * Fairness Rule「奇数人数では全員に意味がある場合だけ 3 人 Bridge を許す」を、
 * Pair 優先の欲張り法で残った 1 名だけに限定して扱う。すでに確定した Pair のどちらかに
 * Evidence で繋がっていれば、その Pair を 3 人 Bridge へ昇格させる（全員が Evidence を
 * 持つことを保証する）。除外された組合せへは統合しない。
 *
 * N ≤ 6（`MAX_BRIDGE_SELECTION_PARTICIPANTS`）であるため、この統合 1 回につき
 * `buildPairEvidence` を最大 2 回（lonely-X、lonely-Y）再計算しても、実質的な
 * 性能上の懸念にはならない。
 */
function findTripleMerge(
  lonely: BridgeSelectionParticipant,
  assignedPairs: readonly PairCandidate[],
  excludedPairs: ReadonlySet<string>
): TripleMerge | undefined {
  for (const [pairIndex, pair] of assignedPairs.entries()) {
    const [x, y] = pair.participants;
    if (
      isPairExcluded(lonely.participantId, x.participantId, excludedPairs) ||
      isPairExcluded(lonely.participantId, y.participantId, excludedPairs)
    ) {
      continue;
    }
    const lonelyXEvidence = buildPairEvidence(lonely, x);
    const lonelyYEvidence = buildPairEvidence(lonely, y);
    if (lonelyXEvidence.length === 0 && lonelyYEvidence.length === 0) {
      continue;
    }
    const participantIds = [
      x.participantId,
      y.participantId,
      lonely.participantId,
    ].sort();
    return {
      pairIndex,
      participantIds,
      evidence: dedupeGroupEvidence(participantIds, [
        ...pair.evidence,
        ...lonelyXEvidence,
        ...lonelyYEvidence,
      ]),
    };
  }
  return undefined;
}

function assertValidParticipants(
  participants: readonly BridgeSelectionParticipant[]
): void {
  if (
    participants.length < MIN_BRIDGE_SELECTION_PARTICIPANTS ||
    participants.length > MAX_BRIDGE_SELECTION_PARTICIPANTS
  ) {
    throw new BridgeSelectionError(
      'INVALID_PARTICIPANT_COUNT',
      `参加者は ${MIN_BRIDGE_SELECTION_PARTICIPANTS} 名以上 ${MAX_BRIDGE_SELECTION_PARTICIPANTS} 名以下にしてください。`
    );
  }
  const seen = new Set<ParticipantId>();
  for (const participant of participants) {
    if (seen.has(participant.participantId)) {
      throw new BridgeSelectionError(
        'DUPLICATE_PARTICIPANT',
        '同じ参加者を重複して指定することはできません。'
      );
    }
    seen.add(participant.participantId);
  }
}

/**
 * 唯一の公開 Entry Point。2〜6 名の Public Passport（+ Owner Rejection の除外集合）から、
 * 参加者ごとに最大 1 件の主要 Bridge、または `no-signal` を決定的に返す。アルゴリズムの
 * 詳細（Evidence 種別・Confidence 規則・Fairness の Tie-break・3 人 Bridge の条件）は
 * `docs/design/bridge-selection.md` を参照する。
 */
export function selectBridges(
  input: BridgeSelectionInput
): readonly ParticipantBridgeOutcome[] {
  const { participants } = input;
  const excludedPairs = input.excludedPairs ?? new Set<string>();
  assertValidParticipants(participants);

  const candidates = buildPairCandidates(participants, excludedPairs);
  const { assignedPairs, claimed } = assignPairsGreedily(candidates);
  const lonely = findLoneLeftover(participants, claimed);
  const merge = lonely
    ? findTripleMerge(lonely, assignedPairs, excludedPairs)
    : undefined;

  const outcomeById = new Map<ParticipantId, ParticipantBridgeResult>();
  if (merge) {
    const bridge = buildSelectedBridgeFromEvidence(
      merge.participantIds,
      merge.evidence
    );
    for (const id of merge.participantIds) {
      outcomeById.set(id, { kind: 'bridge', bridge });
    }
  }

  for (const [index, pair] of assignedPairs.entries()) {
    if (merge && index === merge.pairIndex) continue;
    const [a, b] = pair.participants;
    const bridge = buildSelectedBridgeFromEvidence(
      [a.participantId, b.participantId],
      pair.evidence
    );
    outcomeById.set(a.participantId, { kind: 'bridge', bridge });
    outcomeById.set(b.participantId, { kind: 'bridge', bridge });
  }

  return participants
    .map((participant) => participant.participantId)
    .sort()
    .map((participantId) => ({
      participantId,
      result: outcomeById.get(participantId) ?? { kind: 'no-signal' },
    }));
}
