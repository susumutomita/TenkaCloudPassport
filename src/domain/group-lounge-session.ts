import {
  MAX_BRIDGE_SELECTION_PARTICIPANTS,
  MIN_BRIDGE_SELECTION_PARTICIPANTS,
  type ParticipantBridgeOutcome,
  selectBridges,
} from './bridge-selection';
import { type ClockSnapshot, hasElapsedTtl, isValidClock } from './clock-guard';
import { LOUNGE_TTL_MS } from './lounge';
import type { PublicPassport } from './passport';
import { INTERACTION_DEADLINE_MS } from './pet-interaction';
import {
  isLoungeId,
  isParticipantId,
  isRoundId,
  type LoungeId,
  type ParticipantId,
  type RoundId,
} from './session-identifiers';

/**
 * Issue 24 の Host-authoritative Group Coordinator。Wire の認証、Schema、順序、Rate Limit は
 * Peer Protocol 1.2 に任せ、ここでは受理済み Domain Event から Membership と現在 Round だけを
 * 純粋関数で更新する。正本は `docs/design/group-lounge-reliability.md`。
 */
export const GROUP_MIN_PARTICIPANTS = MIN_BRIDGE_SELECTION_PARTICIPANTS;
export const GROUP_MAX_PARTICIPANTS = MAX_BRIDGE_SELECTION_PARTICIPANTS;
export const GROUP_DISCONNECT_GRACE_MS = 5_000;
export const GROUP_MODEL_DEADLINE_MS = INTERACTION_DEADLINE_MS;
export const GROUP_MAX_DEPARTED_PARTICIPANTS = 64;
export const GROUP_MAX_ROUNDS = 64;
export const GROUP_MAX_CONNECTION_GENERATION = 2_147_483_647;
export const GROUP_MAX_MEMBERSHIP_REVISION = 2_147_483_647;

export interface GroupParticipantInput {
  readonly participantId: ParticipantId;
  readonly publicPassport: PublicPassport;
}

export type GroupParticipantConnection =
  | { readonly status: 'connected' }
  | {
      readonly status: 'grace';
      readonly disconnectedAtMonotonicMs: number;
      readonly reconnectDeadlineAtWallClockMs: number;
    };

export interface GroupParticipant extends GroupParticipantInput {
  readonly connection: GroupParticipantConnection;
  readonly connectionGeneration: number;
  readonly readyForRoundId: RoundId | null;
}

interface GroupLoungeBase {
  readonly loungeId: LoungeId;
  readonly hostParticipantId: ParticipantId;
  readonly membershipRevision: number;
  readonly expiresAtWallClockMs: number;
  readonly loungeStartedAtMonotonicMs: number;
  readonly participants: readonly GroupParticipant[];
  readonly departedParticipantIds: readonly ParticipantId[];
  readonly usedRoundIds: readonly RoundId[];
}

export interface FormingGroupLounge extends GroupLoungeBase {
  readonly status: 'forming';
  readonly roundId: RoundId;
}

export interface EvaluatingGroupLounge extends GroupLoungeBase {
  readonly status: 'evaluating';
  readonly roundId: RoundId;
  readonly activeParticipantIds: readonly ParticipantId[];
  readonly modelStartedAtMonotonicMs: number;
  readonly modelDeadlineAtWallClockMs: number;
}

export interface SettledGroupLounge extends GroupLoungeBase {
  readonly status: 'settled';
  readonly roundId: RoundId;
  readonly outcomes: readonly ParticipantBridgeOutcome[];
  readonly settledBy: 'signals-complete' | 'deadline-fallback';
}

export type GroupLoungeDestructionReason =
  | 'host-ended'
  | 'host-lost'
  | 'expired'
  | 'app-backgrounded'
  | 'completed'
  | 'identity-churn-limit'
  | 'round-limit';

export interface DestroyedGroupLounge {
  readonly status: 'destroyed';
  readonly reason: GroupLoungeDestructionReason;
}

export type GroupLoungeSession =
  | FormingGroupLounge
  | EvaluatingGroupLounge
  | SettledGroupLounge
  | DestroyedGroupLounge;

type ActiveGroupLounge = Exclude<GroupLoungeSession, DestroyedGroupLounge>;

export type GroupLoungeSessionErrorCode =
  | 'INVALID_CLOCK'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_CONNECTION_GENERATION'
  | 'PARTICIPANT_NOT_FOUND'
  | 'PARTICIPANT_CONFLICT'
  | 'PARTICIPANT_DISCONNECTED'
  | 'LOUNGE_FULL'
  | 'IDENTITY_CHURN_LIMIT'
  | 'MEMBERSHIP_REVISION_EXHAUSTED'
  | 'ROUND_NOT_SETTLED'
  | 'ROUND_ID_REUSED';

export class GroupLoungeSessionError extends Error {
  readonly code: GroupLoungeSessionErrorCode;

  constructor(code: GroupLoungeSessionErrorCode, message: string) {
    super(message);
    this.name = 'GroupLoungeSessionError';
    this.code = code;
  }
}

function assertValidClock(clock: ClockSnapshot): void {
  if (!isValidClock(clock)) {
    throw new GroupLoungeSessionError(
      'INVALID_CLOCK',
      'Group Lounge の時計は有限値である必要があります。'
    );
  }
}

function assertValidConfiguration(
  loungeId: LoungeId,
  hostParticipantId: ParticipantId,
  roundId: RoundId
): void {
  if (
    !isLoungeId(loungeId) ||
    !isParticipantId(hostParticipantId) ||
    !isRoundId(roundId)
  ) {
    throw new GroupLoungeSessionError(
      'INVALID_CONFIGURATION',
      'Lounge、Host Participant、Round には 128 bit の Session ID が必要です。'
    );
  }
}

function connectedParticipant(
  participant: GroupParticipantInput
): GroupParticipant {
  return {
    ...participant,
    connection: { status: 'connected' },
    connectionGeneration: 0,
    readyForRoundId: null,
  };
}

function sortedParticipants(
  participants: readonly GroupParticipant[]
): readonly GroupParticipant[] {
  return [...participants].sort((left, right) =>
    left.participantId < right.participantId ? -1 : 1
  );
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function publicPassportsEqual(
  left: PublicPassport,
  right: PublicPassport
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.catalogVersion === right.catalogVersion &&
    left.petName === right.petName &&
    left.petEmoji === right.petEmoji &&
    left.ownerAlias === right.ownerAlias &&
    left.clues.length === right.clues.length &&
    left.clues.every((clue, index) => {
      const other = right.clues[index];
      return (
        clue.value === other?.value &&
        clue.category === other.category &&
        clue.source === other.source
      );
    }) &&
    stringArraysEqual(left.languages, right.languages)
  );
}

function nextMembershipRevision(revision: number): number {
  if (revision >= GROUP_MAX_MEMBERSHIP_REVISION) {
    throw new GroupLoungeSessionError(
      'MEMBERSHIP_REVISION_EXHAUSTED',
      'Membership revision の上限に達したため更新できません。'
    );
  }
  return revision + 1;
}

function assertValidConnectionGeneration(generation: number): void {
  if (
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    generation > GROUP_MAX_CONNECTION_GENERATION
  ) {
    throw new GroupLoungeSessionError(
      'INVALID_CONNECTION_GENERATION',
      'Connection generation は範囲内の非負整数である必要があります。'
    );
  }
}

function hasLoungeExpired(
  state: ActiveGroupLounge,
  clock: ClockSnapshot
): boolean {
  return hasElapsedTtl(
    state.loungeStartedAtMonotonicMs,
    state.expiresAtWallClockMs,
    clock,
    LOUNGE_TTL_MS
  );
}

function hasGraceExpired(
  participant: GroupParticipant,
  clock: ClockSnapshot
): boolean {
  if (participant.connection.status !== 'grace') return false;
  return hasElapsedTtl(
    participant.connection.disconnectedAtMonotonicMs,
    participant.connection.reconnectDeadlineAtWallClockMs,
    clock,
    GROUP_DISCONNECT_GRACE_MS
  );
}

function hasModelDeadlineElapsed(
  state: EvaluatingGroupLounge,
  clock: ClockSnapshot
): boolean {
  return hasElapsedTtl(
    state.modelStartedAtMonotonicMs,
    state.modelDeadlineAtWallClockMs,
    clock,
    GROUP_MODEL_DEADLINE_MS
  );
}

function canStartRound(state: FormingGroupLounge): boolean {
  return (
    state.participants.length >= GROUP_MIN_PARTICIPANTS &&
    state.participants.every(
      (participant) =>
        participant.connection.status === 'connected' &&
        participant.readyForRoundId === state.roundId
    )
  );
}

function startRoundIfReady(
  state: FormingGroupLounge,
  clock: ClockSnapshot
): FormingGroupLounge | EvaluatingGroupLounge {
  if (!canStartRound(state)) return state;
  return {
    ...state,
    status: 'evaluating',
    activeParticipantIds: state.participants.map(
      (participant) => participant.participantId
    ),
    modelStartedAtMonotonicMs: clock.monotonicMs,
    modelDeadlineAtWallClockMs: clock.wallClockMs + GROUP_MODEL_DEADLINE_MS,
  };
}

function outcomesForActiveParticipants(
  state: EvaluatingGroupLounge
): readonly ParticipantBridgeOutcome[] {
  const activeIds = new Set(state.activeParticipantIds);
  const activeParticipants = state.participants
    .filter((participant) => activeIds.has(participant.participantId))
    .map((participant) => ({
      participantId: participant.participantId,
      passport: participant.publicPassport,
    }));
  if (activeParticipants.length < GROUP_MIN_PARTICIPANTS) {
    return activeParticipants.map((participant) => ({
      participantId: participant.participantId,
      result: { kind: 'no-signal' },
    }));
  }
  return selectBridges({ participants: activeParticipants });
}

function settleEvaluatingRound(
  state: EvaluatingGroupLounge,
  settledBy: SettledGroupLounge['settledBy']
): SettledGroupLounge {
  return {
    status: 'settled',
    loungeId: state.loungeId,
    hostParticipantId: state.hostParticipantId,
    membershipRevision: state.membershipRevision,
    expiresAtWallClockMs: state.expiresAtWallClockMs,
    loungeStartedAtMonotonicMs: state.loungeStartedAtMonotonicMs,
    participants: state.participants,
    departedParticipantIds: state.departedParticipantIds,
    usedRoundIds: state.usedRoundIds,
    roundId: state.roundId,
    outcomes: outcomesForActiveParticipants(state),
    settledBy,
  };
}

function outcomesAfterParticipantDeparture(
  outcomes: readonly ParticipantBridgeOutcome[],
  participantId: ParticipantId
): readonly ParticipantBridgeOutcome[] {
  return outcomes
    .filter((outcome) => outcome.participantId !== participantId)
    .map((outcome): ParticipantBridgeOutcome => {
      if (
        outcome.result.kind === 'bridge' &&
        outcome.result.bridge.participantIds.includes(participantId)
      ) {
        return {
          participantId: outcome.participantId,
          result: { kind: 'no-signal' },
        };
      }
      return outcome;
    });
}

function removeGuest(
  state: ActiveGroupLounge,
  participantId: ParticipantId
): GroupLoungeSession {
  if (state.departedParticipantIds.length >= GROUP_MAX_DEPARTED_PARTICIPANTS) {
    return { status: 'destroyed', reason: 'identity-churn-limit' };
  }
  const participants = state.participants.filter(
    (participant) => participant.participantId !== participantId
  );
  const membership = {
    membershipRevision: nextMembershipRevision(state.membershipRevision),
    participants,
    departedParticipantIds: [...state.departedParticipantIds, participantId],
  };
  if (state.status === 'evaluating') {
    return {
      ...state,
      ...membership,
      activeParticipantIds: state.activeParticipantIds.filter(
        (id) => id !== participantId
      ),
    };
  }
  if (state.status === 'settled') {
    return {
      ...state,
      ...membership,
      outcomes: outcomesAfterParticipantDeparture(
        state.outcomes,
        participantId
      ),
    };
  }
  return { ...state, ...membership };
}

function removeExpiredGuests(
  state: ActiveGroupLounge,
  clock: ClockSnapshot
): GroupLoungeSession {
  const expiredGuestIds = state.participants
    .filter(
      (participant) =>
        participant.participantId !== state.hostParticipantId &&
        hasGraceExpired(participant, clock)
    )
    .map((participant) => participant.participantId);
  let current: GroupLoungeSession = state;
  for (const participantId of expiredGuestIds) {
    if (current.status === 'destroyed') return current;
    current = removeGuest(current, participantId);
  }
  return current;
}

export interface CreateGroupLoungeSessionInput {
  readonly loungeId: LoungeId;
  readonly host: GroupParticipantInput;
  readonly roundId: RoundId;
  readonly clock: ClockSnapshot;
}

export function createGroupLoungeSession(
  input: CreateGroupLoungeSessionInput
): FormingGroupLounge {
  assertValidClock(input.clock);
  assertValidConfiguration(
    input.loungeId,
    input.host.participantId,
    input.roundId
  );
  return {
    status: 'forming',
    loungeId: input.loungeId,
    hostParticipantId: input.host.participantId,
    membershipRevision: 0,
    expiresAtWallClockMs: input.clock.wallClockMs + LOUNGE_TTL_MS,
    loungeStartedAtMonotonicMs: input.clock.monotonicMs,
    participants: [connectedParticipant(input.host)],
    departedParticipantIds: [],
    usedRoundIds: [input.roundId],
    roundId: input.roundId,
  };
}

export function advanceGroupLoungeSession(
  state: GroupLoungeSession,
  clock: ClockSnapshot
): GroupLoungeSession {
  if (state.status === 'destroyed') return state;
  assertValidClock(clock);
  if (hasLoungeExpired(state, clock)) {
    return { status: 'destroyed', reason: 'expired' };
  }
  const host = state.participants.find(
    (participant) => participant.participantId === state.hostParticipantId
  );
  if (host && hasGraceExpired(host, clock)) {
    return { status: 'destroyed', reason: 'host-lost' };
  }
  const current = removeExpiredGuests(state, clock);
  if (current.status === 'destroyed') return current;
  if (current.status === 'forming') {
    return startRoundIfReady(current, clock);
  }
  if (
    current.status === 'evaluating' &&
    hasModelDeadlineElapsed(current, clock)
  ) {
    return settleEvaluatingRound(current, 'deadline-fallback');
  }
  return current;
}

export interface JoinGroupParticipantInput {
  readonly participant: GroupParticipantInput;
  readonly clock: ClockSnapshot;
}

export function joinGroupParticipant(
  state: GroupLoungeSession,
  input: JoinGroupParticipantInput
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status === 'destroyed') return current;
  if (!isParticipantId(input.participant.participantId)) {
    throw new GroupLoungeSessionError(
      'INVALID_CONFIGURATION',
      'Participant には 128 bit の Session ID が必要です。'
    );
  }
  const existing = current.participants.find(
    (participant) =>
      participant.participantId === input.participant.participantId
  );
  if (existing) {
    if (
      publicPassportsEqual(
        existing.publicPassport,
        input.participant.publicPassport
      )
    ) {
      return current;
    }
    throw new GroupLoungeSessionError(
      'PARTICIPANT_CONFLICT',
      '同じ Participant ID を異なる Public Passport に再利用できません。'
    );
  }
  if (
    current.departedParticipantIds.includes(input.participant.participantId)
  ) {
    return current;
  }
  if (
    current.departedParticipantIds.length >= GROUP_MAX_DEPARTED_PARTICIPANTS
  ) {
    throw new GroupLoungeSessionError(
      'IDENTITY_CHURN_LIMIT',
      'この Lounge で利用できる一時 Participant ID の上限に達しました。'
    );
  }
  if (current.participants.length >= GROUP_MAX_PARTICIPANTS) {
    throw new GroupLoungeSessionError(
      'LOUNGE_FULL',
      `Group Lounge は ${GROUP_MAX_PARTICIPANTS} 名までです。`
    );
  }
  return {
    ...current,
    membershipRevision: nextMembershipRevision(current.membershipRevision),
    participants: sortedParticipants([
      ...current.participants,
      connectedParticipant(input.participant),
    ]),
  };
}

export interface ParticipantClockEvent {
  readonly participantId: ParticipantId;
  readonly clock: ClockSnapshot;
}

export interface ParticipantConnectionEvent extends ParticipantClockEvent {
  readonly connectionGeneration: number;
}

export function leaveGroupParticipant(
  state: GroupLoungeSession,
  input: ParticipantClockEvent
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status === 'destroyed') return current;
  const participant = current.participants.find(
    (candidate) => candidate.participantId === input.participantId
  );
  if (!participant) return current;
  if (participant.participantId === current.hostParticipantId) {
    return { status: 'destroyed', reason: 'host-ended' };
  }
  const withoutGuest = removeGuest(current, input.participantId);
  return withoutGuest.status === 'forming'
    ? startRoundIfReady(withoutGuest, input.clock)
    : withoutGuest;
}

export interface ReadyGroupParticipantInput extends ParticipantClockEvent {
  readonly roundId: RoundId;
}

export function markGroupParticipantReady(
  state: GroupLoungeSession,
  input: ReadyGroupParticipantInput
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status === 'destroyed' || current.status !== 'forming') {
    return current;
  }
  if (input.roundId !== current.roundId) return current;
  const participant = current.participants.find(
    (candidate) => candidate.participantId === input.participantId
  );
  if (!participant) {
    if (current.departedParticipantIds.includes(input.participantId)) {
      return current;
    }
    throw new GroupLoungeSessionError(
      'PARTICIPANT_NOT_FOUND',
      '指定された Participant は Group Lounge にいません。'
    );
  }
  if (participant.connection.status !== 'connected') {
    throw new GroupLoungeSessionError(
      'PARTICIPANT_DISCONNECTED',
      '切断中の Participant を Ready にできません。'
    );
  }
  if (participant.readyForRoundId === current.roundId) return current;
  const ready: FormingGroupLounge = {
    ...current,
    participants: current.participants.map((candidate) =>
      candidate.participantId === input.participantId
        ? { ...candidate, readyForRoundId: current.roundId }
        : candidate
    ),
  };
  return startRoundIfReady(ready, input.clock);
}

export function disconnectGroupParticipant(
  state: GroupLoungeSession,
  input: ParticipantConnectionEvent
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status === 'destroyed') return current;
  assertValidConnectionGeneration(input.connectionGeneration);
  const participant = current.participants.find(
    (candidate) => candidate.participantId === input.participantId
  );
  if (!participant) {
    if (current.departedParticipantIds.includes(input.participantId)) {
      return current;
    }
    throw new GroupLoungeSessionError(
      'PARTICIPANT_NOT_FOUND',
      '指定された Participant は Group Lounge にいません。'
    );
  }
  if (input.connectionGeneration !== participant.connectionGeneration) {
    return current;
  }
  if (participant.connection.status === 'grace') return current;
  return {
    ...current,
    participants: current.participants.map((candidate) =>
      candidate.participantId === input.participantId
        ? {
            ...candidate,
            connection: {
              status: 'grace',
              disconnectedAtMonotonicMs: input.clock.monotonicMs,
              reconnectDeadlineAtWallClockMs:
                input.clock.wallClockMs + GROUP_DISCONNECT_GRACE_MS,
            },
          }
        : candidate
    ),
  };
}

export function reconnectGroupParticipant(
  state: GroupLoungeSession,
  input: ParticipantConnectionEvent
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status === 'destroyed') return current;
  assertValidConnectionGeneration(input.connectionGeneration);
  const participant = current.participants.find(
    (candidate) => candidate.participantId === input.participantId
  );
  if (!participant) {
    if (current.departedParticipantIds.includes(input.participantId)) {
      return current;
    }
    throw new GroupLoungeSessionError(
      'PARTICIPANT_NOT_FOUND',
      '指定された Participant は Group Lounge にいません。'
    );
  }
  if (input.connectionGeneration !== participant.connectionGeneration + 1) {
    return current;
  }
  const reconnected = {
    ...current,
    participants: current.participants.map((candidate) =>
      candidate.participantId === input.participantId
        ? {
            ...candidate,
            connection: { status: 'connected' } as const,
            connectionGeneration: input.connectionGeneration,
          }
        : candidate
    ),
  };
  return reconnected.status === 'forming'
    ? startRoundIfReady(reconnected, input.clock)
    : reconnected;
}

export interface SettleGroupRoundInput {
  readonly roundId: RoundId;
  readonly clock: ClockSnapshot;
}

export function settleGroupRound(
  state: GroupLoungeSession,
  input: SettleGroupRoundInput
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status !== 'evaluating' || input.roundId !== current.roundId) {
    return current;
  }
  return settleEvaluatingRound(current, 'signals-complete');
}

export interface BeginNextGroupRoundInput {
  readonly roundId: RoundId;
  readonly clock: ClockSnapshot;
}

export function beginNextGroupRound(
  state: GroupLoungeSession,
  input: BeginNextGroupRoundInput
): GroupLoungeSession {
  const current = advanceGroupLoungeSession(state, input.clock);
  if (current.status === 'destroyed') return current;
  if (current.status !== 'settled') {
    throw new GroupLoungeSessionError(
      'ROUND_NOT_SETTLED',
      '現在 Round が確定する前に次 Round を開始できません。'
    );
  }
  if (!isRoundId(input.roundId)) {
    throw new GroupLoungeSessionError(
      'INVALID_CONFIGURATION',
      'Round には 128 bit の Session ID が必要です。'
    );
  }
  if (current.usedRoundIds.includes(input.roundId)) {
    throw new GroupLoungeSessionError(
      'ROUND_ID_REUSED',
      '確定済み Round ID を再利用できません。'
    );
  }
  if (current.usedRoundIds.length >= GROUP_MAX_ROUNDS) {
    return { status: 'destroyed', reason: 'round-limit' };
  }
  return {
    status: 'forming',
    loungeId: current.loungeId,
    hostParticipantId: current.hostParticipantId,
    membershipRevision: current.membershipRevision,
    expiresAtWallClockMs: current.expiresAtWallClockMs,
    loungeStartedAtMonotonicMs: current.loungeStartedAtMonotonicMs,
    participants: current.participants.map((participant) => ({
      ...participant,
      readyForRoundId: null,
    })),
    departedParticipantIds: current.departedParticipantIds,
    usedRoundIds: [...current.usedRoundIds, input.roundId],
    roundId: input.roundId,
  };
}

export function destroyGroupLoungeSession(
  state: GroupLoungeSession,
  reason: Exclude<
    GroupLoungeDestructionReason,
    'host-lost' | 'expired' | 'identity-churn-limit' | 'round-limit'
  >
): DestroyedGroupLounge {
  if (state.status === 'destroyed') return state;
  return { status: 'destroyed', reason };
}

export interface GroupMembershipSnapshot {
  readonly revision: number;
  readonly participantIds: readonly ParticipantId[];
}

export function groupMembershipSnapshot(
  state: GroupLoungeSession
): GroupMembershipSnapshot | null {
  if (state.status === 'destroyed') return null;
  return {
    revision: state.membershipRevision,
    participantIds: state.participants.map(
      (participant) => participant.participantId
    ),
  };
}
