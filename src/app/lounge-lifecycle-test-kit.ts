import { RULES_INTERACTION_PROVIDER } from '../domain/interaction-discovery-provider';
import {
  type ActiveLounge,
  completeLounge,
  evaluateLounge,
} from '../domain/lounge';
import {
  createLoungeRoom,
  joinLoungeRoom,
  markParticipantReady,
  startLoungeFromRoom,
} from '../domain/lounge-room';
import {
  createLocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import { RULES_PROVIDER } from '../domain/rules-provider';
import { createSessionIdentifiers } from '../domain/session-identifiers';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import {
  beginPetInteraction,
  submitOwnerQuestionAnswer,
} from './pet-interaction-flow';

/**
 * `lounge-privacy-regression.test.ts`（Issue 9）が、「Room の forming から
 * Bridge 確定・完全破棄までのフル行程を、実際に `PassportApp` が呼ぶのと同じ Use Case
 * 関数の並びで実行する」ヘルパーと Lounge 由来の禁止語彙一覧を必要とするため、ここへ集約する
 * （`src/app/storage-test-kit.ts` / `src/screens/accessibility-test-kit.ts` と同じ集約方針）。
 * 以前は `backup-export-privacy-regression.test.ts`（Issue 14）も利用していたが、
 * JSON Backup 機能自体を Issue 118 / ADR-0033 で削除したためこのファイルも削除済みである。
 */
const LOUNGE_LIFECYCLE_CLOCK = {
  wallClockMs: 1_700_000_000_000,
  monotonicMs: 10_000,
};

/**
 * `LocalPrivateProfile`（`src/domain/passport.ts`）が持つ最上位 key の allowlist。
 * Storage / Backup へ書き込まれた JSON がこれ以外の key を持つ場合、Lounge / Bridge / Peer 由来の
 * データが紛れ込んでいる可能性がある。
 */
export const ALLOWED_LOCAL_PROFILE_KEYS: readonly string[] = [
  'schemaVersion',
  'catalogVersion',
  'petName',
  'petEmoji',
  'ownerAlias',
  'candidateClues',
  'excludedTopics',
  'languages',
].sort();

export const LOUNGE_FORBIDDEN_VOCABULARY: readonly string[] = [
  'loungeId',
  'expiresAtWallClockMs',
  'startedAtMonotonicMs',
  'ownerPassport',
  'encounteredPassport',
  'outcome',
  'messageKey',
  'evidence',
  'no-signal',
  'participantId',
  'ROOM_CAPACITY',
  'Bridge',
  // Issue 11: Owner Question / Pet Interaction 由来の語彙。clarifying を経由した
  // Bridge 確定でもこれらが Storage / Backup へ漏れないことを固定する。`"candidateClue":`
  // （単数形 + コロン）は Local Private Profile の `candidateClues`（複数形）フィールドと
  // 前方一致で衝突しないよう区別する。
  'confirm-shared-clue',
  'clarifying',
  '"candidateClue":',
  'questionId',
  'sharingConsent',
  'purpose',
  'canOffer',
];

/**
 * Room の forming から双方 Ready（Active Lounge 開始直前）までの手順は、Bridge 確定
 * シナリオでも Owner Question の `clarifying` シナリオでも同一である。この共通手順を
 * 1 箇所へ集約し、複数の Lifecycle 関数の重複を避ける。
 */
export function startActiveLounge(): ActiveLounge {
  const hostIdentifiers = createSessionIdentifiers(webCryptoRandomBytes);
  const guestIdentifiers = createSessionIdentifiers(webCryptoRandomBytes);
  const sharedClueIds = ['open-source'];
  const hostProfile = createLocalPrivateProfile({
    petName: 'ホスト',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: sharedClueIds,
    selectedForPassportClueIds: sharedClueIds,
    languageCodes: [],
  });
  const guestProfile = createLocalPrivateProfile({
    petName: 'ゲスト',
    petEmoji: '🐶',
    ownerAlias: '',
    candidateClueIds: sharedClueIds,
    selectedForPassportClueIds: sharedClueIds,
    languageCodes: [],
  });
  const hostPassport = projectPublicPassport(hostProfile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds: sharedClueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });
  const guestPassport = projectPublicPassport(guestProfile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds: sharedClueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });

  const room = createLoungeRoom({
    loungeId: hostIdentifiers.loungeId,
    clock: LOUNGE_LIFECYCLE_CLOCK,
  });
  const joinedHost = joinLoungeRoom(room, {
    participantId: hostIdentifiers.participantId,
    publicPassport: hostPassport,
    clock: LOUNGE_LIFECYCLE_CLOCK,
  });
  const joinedGuest = joinLoungeRoom(joinedHost, {
    participantId: guestIdentifiers.participantId,
    publicPassport: guestPassport,
    clock: LOUNGE_LIFECYCLE_CLOCK,
  });
  const hostReady = markParticipantReady(joinedGuest, {
    participantId: hostIdentifiers.participantId,
    clock: LOUNGE_LIFECYCLE_CLOCK,
  });
  const bothReady = markParticipantReady(hostReady, {
    participantId: guestIdentifiers.participantId,
    clock: LOUNGE_LIFECYCLE_CLOCK,
  });
  if (bothReady.status !== 'ready') throw new Error('ready が必要です。');

  const active = startLoungeFromRoom(bothReady);
  if (active.status !== 'active') throw new Error('active が必要です。');
  return active;
}

/**
 * Room の forming から Bridge が確定して完全破棄されるまでのフル行程を、実際に
 * `PassportApp` が呼ぶのと同じ Use Case 関数の並びで実行する。この行程のどの関数も
 * `LocalProfileStoragePort` を一切呼ばないため、Storage には Owner の Local Profile 以外
 * 何も増えないはずである、という Privacy 契約を Regression Test として固定できる。
 *
 * 戻り値は `completeLounge` 直前の `retired` Lounge であり、呼び出し側が
 * Export のタイミングテスト（`retired` の瞬間・`completeLounge` 後の `destroyed` の瞬間）を
 * 使い分けられるようにする。
 */
export function runFullLoungeLifecycleWithBridge() {
  const active = startActiveLounge();
  const retired = evaluateLounge(active, RULES_PROVIDER, {
    wallClockMs: LOUNGE_LIFECYCLE_CLOCK.wallClockMs + 1_000,
    monotonicMs: LOUNGE_LIFECYCLE_CLOCK.monotonicMs + 1_000,
  });
  if (retired.status !== 'retired' || retired.outcome.kind !== 'bridge')
    throw new Error('Bridge が確定した retired が必要です。');
  return {
    retired,
    destroyed: completeLounge(retired),
  };
}

/**
 * Issue 11: Owner Question の `clarifying` を経由して Owner が「答える」（yes）を最終
 * Consent まで確定した場合も、実際に `PassportApp` が呼ぶのと同じ `pet-interaction-flow.ts`
 * の関数列だけで Bridge が確定し、`LocalProfileStoragePort` を一切呼ばないことを固定する。
 * Owner Question への回答（Owner Answer）と任意メモは Lounge 終了後の Storage / Backup の
 * どちらにも存在しないという受け入れ条件を、この経路でも検証する。
 */
export function runFullLoungeLifecycleWithClarifyingQuestion() {
  const active = startActiveLounge();
  const evaluationClock = {
    wallClockMs: LOUNGE_LIFECYCLE_CLOCK.wallClockMs + 1_000,
    monotonicMs: LOUNGE_LIFECYCLE_CLOCK.monotonicMs + 1_000,
  };
  const begun = beginPetInteraction(
    active,
    RULES_INTERACTION_PROVIDER,
    evaluationClock
  );
  if (begun.interaction?.phase !== 'clarifying')
    throw new Error('clarifying の候補が必要です。');
  // Owner が「答える」を選び、最終確認を経て 'yes' を確定した状態を模す
  // （メモは常に任意であり、選択肢だけでも回答が完結することの一環として省略する）。
  const answered = submitOwnerQuestionAnswer(
    begun.interaction,
    active,
    'yes',
    evaluationClock
  );
  if (
    answered.lounge.status !== 'retired' ||
    answered.lounge.outcome.kind !== 'bridge'
  )
    throw new Error('Bridge が確定した retired が必要です。');
  return {
    retired: answered.lounge,
    destroyed: completeLounge(answered.lounge),
  };
}
