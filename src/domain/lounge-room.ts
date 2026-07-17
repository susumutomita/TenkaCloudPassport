import type { ClockSnapshot } from './clock-guard';
import { hasElapsedTtl, isValidClock } from './clock-guard';
import type { ActiveLounge } from './lounge';
import { LOUNGE_TTL_MS } from './lounge';
import {
  LOUNGE_INVITE_SCHEMA_VERSION,
  type LoungeInvite,
} from './lounge-invite';
import type { PublicPassport } from './passport';
import type { LoungeId, ParticipantId } from './session-identifiers';

/**
 * Rules Provider による判定は 2 者間の Bilateral 比較だけを扱うため、Ready gating の
 * 定員も 2 名に固定する。N 名対応は別途 N 者間判定の設計が必要であり、この Issue の
 * 範囲外とする（Known follow-ups 参照）。
 */
export const ROOM_CAPACITY = 2;

export interface RoomParticipant {
  readonly participantId: ParticipantId;
  readonly publicPassport: PublicPassport;
  readonly ready: boolean;
}

export interface FormingLoungeRoom {
  readonly status: 'forming';
  readonly loungeId: LoungeId;
  readonly expiresAtWallClockMs: number;
  readonly startedAtMonotonicMs: number;
  readonly participants: readonly RoomParticipant[];
}

export interface ReadyLoungeRoom {
  readonly status: 'ready';
  readonly loungeId: LoungeId;
  readonly expiresAtWallClockMs: number;
  readonly startedAtMonotonicMs: number;
  readonly participants: readonly RoomParticipant[];
}

export interface ExpiredLoungeRoom {
  readonly status: 'expired';
  readonly loungeId: LoungeId;
}

export type LoungeRoomState =
  | FormingLoungeRoom
  | ReadyLoungeRoom
  | ExpiredLoungeRoom;

export type LoungeRoomErrorCode =
  | 'INVALID_CLOCK'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'ROOM_NOT_FORMING'
  | 'PARTICIPANT_NOT_FOUND'
  | 'INVALID_PARTICIPANT_COUNT';

export class LoungeRoomError extends Error {
  readonly code: LoungeRoomErrorCode;

  constructor(code: LoungeRoomErrorCode, message: string) {
    super(message);
    this.name = 'LoungeRoomError';
    this.code = code;
  }
}

function assertValidClock(clock: ClockSnapshot): void {
  if (!isValidClock(clock)) {
    throw new LoungeRoomError(
      'INVALID_CLOCK',
      'Lounge Room の時計は有限値である必要があります。'
    );
  }
}

export interface CreateLoungeRoomInput {
  readonly loungeId: LoungeId;
  readonly clock: ClockSnapshot;
}

export function createLoungeRoom(
  input: CreateLoungeRoomInput
): FormingLoungeRoom {
  assertValidClock(input.clock);
  return {
    status: 'forming',
    loungeId: input.loungeId,
    expiresAtWallClockMs: input.clock.wallClockMs + LOUNGE_TTL_MS,
    startedAtMonotonicMs: input.clock.monotonicMs,
    participants: [],
  };
}

function hasExpired(
  state: FormingLoungeRoom | ReadyLoungeRoom,
  clock: ClockSnapshot
): boolean {
  return hasElapsedTtl(
    state.startedAtMonotonicMs,
    state.expiresAtWallClockMs,
    clock,
    LOUNGE_TTL_MS
  );
}

export function advanceLoungeRoom(
  state: LoungeRoomState,
  clock: ClockSnapshot
): LoungeRoomState {
  if (state.status === 'expired') return state;
  assertValidClock(clock);
  if (hasExpired(state, clock)) {
    return { status: 'expired', loungeId: state.loungeId };
  }
  return state;
}

function assertForming(
  state: LoungeRoomState
): asserts state is FormingLoungeRoom {
  if (state.status === 'expired') {
    throw new LoungeRoomError(
      'ROOM_EXPIRED',
      'この Lounge の招待は期限切れです。'
    );
  }
  if (state.status !== 'forming') {
    throw new LoungeRoomError(
      'ROOM_NOT_FORMING',
      'この Lounge はすでに開始しているため参加できません。'
    );
  }
}

export interface JoinLoungeRoomInput {
  readonly participantId: ParticipantId;
  readonly publicPassport: PublicPassport;
  readonly clock: ClockSnapshot;
}

export function joinLoungeRoom(
  state: LoungeRoomState,
  input: JoinLoungeRoomInput
): FormingLoungeRoom | ReadyLoungeRoom {
  const current = advanceLoungeRoom(state, input.clock);
  assertForming(current);
  if (current.participants.length >= ROOM_CAPACITY) {
    throw new LoungeRoomError(
      'ROOM_FULL',
      `この Lounge はすでに ${ROOM_CAPACITY} 名で満員です。`
    );
  }
  return {
    ...current,
    participants: [
      ...current.participants,
      {
        participantId: input.participantId,
        publicPassport: input.publicPassport,
        ready: false,
      },
    ],
  };
}

export interface MarkParticipantReadyInput {
  readonly participantId: ParticipantId;
  readonly clock: ClockSnapshot;
}

export function markParticipantReady(
  state: LoungeRoomState,
  input: MarkParticipantReadyInput
): LoungeRoomState {
  const current = advanceLoungeRoom(state, input.clock);
  assertForming(current);
  if (
    !current.participants.some(
      (participant) => participant.participantId === input.participantId
    )
  ) {
    throw new LoungeRoomError(
      'PARTICIPANT_NOT_FOUND',
      '指定された参加者はこの Lounge にいません。'
    );
  }
  const participants = current.participants.map((participant) =>
    participant.participantId === input.participantId
      ? { ...participant, ready: true }
      : participant
  );
  const allReady =
    participants.length >= ROOM_CAPACITY &&
    participants.every((participant) => participant.ready);
  if (allReady) {
    return {
      status: 'ready',
      loungeId: current.loungeId,
      expiresAtWallClockMs: current.expiresAtWallClockMs,
      startedAtMonotonicMs: current.startedAtMonotonicMs,
      participants,
    };
  }
  return { ...current, participants };
}

export function startLoungeFromRoom(room: ReadyLoungeRoom): ActiveLounge {
  const ownerParticipant = room.participants[0];
  const encounteredParticipant = room.participants[1];
  if (
    !ownerParticipant ||
    !encounteredParticipant ||
    room.participants.length !== ROOM_CAPACITY
  ) {
    throw new LoungeRoomError(
      'INVALID_PARTICIPANT_COUNT',
      `Ready な Lounge Room には ${ROOM_CAPACITY} 名の参加者が必要です。`
    );
  }
  return {
    status: 'active',
    ownerPassport: ownerParticipant.publicPassport,
    encounteredPassport: encounteredParticipant.publicPassport,
    expiresAtWallClockMs: room.expiresAtWallClockMs,
    startedAtMonotonicMs: room.startedAtMonotonicMs,
  };
}

/**
 * Room の Lounge ID と期限からその場で表示する Lounge Invite を導出する。Room 作成時に
 * 既に検証済みの時計から計算した `expiresAtWallClockMs` をそのまま使うため、
 * `createLoungeInvite` を改めて呼んで同じ TTL 計算を重複させない。
 */
export function inviteForRoom(
  room: FormingLoungeRoom | ReadyLoungeRoom
): LoungeInvite {
  return {
    schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
    loungeId: room.loungeId,
    expiresAtEpochMs: room.expiresAtWallClockMs,
  };
}
