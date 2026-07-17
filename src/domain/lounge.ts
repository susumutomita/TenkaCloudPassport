import type { PublicPassport } from './passport';
import type {
  EncounterDecisionProvider,
  ParticipantOutcome,
} from './rules-provider';

export const LOUNGE_TTL_MS = 20 * 60 * 1_000;

export interface ClockSnapshot {
  readonly wallClockMs: number;
  readonly monotonicMs: number;
}

export interface ActiveLounge {
  readonly status: 'active';
  readonly ownerPassport: PublicPassport;
  readonly encounteredPassport: PublicPassport;
  readonly expiresAtWallClockMs: number;
  readonly startedAtMonotonicMs: number;
}

export interface RetiredLounge {
  readonly status: 'retired';
  readonly outcome: ParticipantOutcome;
  readonly expiresAtWallClockMs: number;
  readonly startedAtMonotonicMs: number;
}

export type LoungeDestructionReason =
  | 'owner-exit'
  | 'host-ended'
  | 'expired'
  | 'completed';

export interface DestroyedLounge {
  readonly status: 'destroyed';
  readonly reason: LoungeDestructionReason;
}

export type LoungeState = ActiveLounge | RetiredLounge | DestroyedLounge;

export type LoungeTransitionCode =
  | 'INVALID_CLOCK'
  | 'PET_RETIRED'
  | 'LOUNGE_DESTROYED'
  | 'OUTCOME_NOT_AVAILABLE';

export class LoungeTransitionError extends Error {
  readonly code: LoungeTransitionCode;

  constructor(code: LoungeTransitionCode, message: string) {
    super(message);
    this.name = 'LoungeTransitionError';
    this.code = code;
  }
}

interface StartLoungeInput {
  readonly ownerPassport: PublicPassport;
  readonly encounteredPassport: PublicPassport;
  readonly clock: ClockSnapshot;
}

function assertValidClock(clock: ClockSnapshot): void {
  if (
    !Number.isFinite(clock.wallClockMs) ||
    !Number.isFinite(clock.monotonicMs)
  ) {
    throw new LoungeTransitionError(
      'INVALID_CLOCK',
      'Lounge の時計は有限値である必要があります。'
    );
  }
}

export function startLounge(input: StartLoungeInput): ActiveLounge {
  assertValidClock(input.clock);
  return {
    status: 'active',
    ownerPassport: input.ownerPassport,
    encounteredPassport: input.encounteredPassport,
    expiresAtWallClockMs: input.clock.wallClockMs + LOUNGE_TTL_MS,
    startedAtMonotonicMs: input.clock.monotonicMs,
  };
}

function hasExpired(
  state: ActiveLounge | RetiredLounge,
  clock: ClockSnapshot
): boolean {
  const monotonicElapsed = Math.max(
    0,
    clock.monotonicMs - state.startedAtMonotonicMs
  );
  return (
    clock.wallClockMs >= state.expiresAtWallClockMs ||
    monotonicElapsed >= LOUNGE_TTL_MS
  );
}

function destroyLounge(
  state: LoungeState,
  reason: LoungeDestructionReason
): DestroyedLounge {
  if (state.status === 'destroyed') return state;
  return { status: 'destroyed', reason };
}

export function leaveLounge(state: LoungeState): DestroyedLounge {
  return destroyLounge(state, 'owner-exit');
}

export function endHostedLounge(state: LoungeState): DestroyedLounge {
  return destroyLounge(state, 'host-ended');
}

export function advanceLounge(
  state: ActiveLounge,
  clock: ClockSnapshot
): ActiveLounge | DestroyedLounge;
export function advanceLounge(
  state: RetiredLounge,
  clock: ClockSnapshot
): RetiredLounge | DestroyedLounge;
export function advanceLounge(
  state: DestroyedLounge,
  clock: ClockSnapshot
): DestroyedLounge;
export function advanceLounge(
  state: LoungeState,
  clock: ClockSnapshot
): LoungeState;
export function advanceLounge(
  state: LoungeState,
  clock: ClockSnapshot
): LoungeState {
  if (state.status === 'destroyed') return state;
  assertValidClock(clock);
  if (hasExpired(state, clock)) return destroyLounge(state, 'expired');
  return state;
}

export function evaluateLounge(
  state: LoungeState,
  provider: EncounterDecisionProvider,
  clock: ClockSnapshot
): RetiredLounge | DestroyedLounge {
  if (state.status === 'destroyed') {
    throw new LoungeTransitionError(
      'LOUNGE_DESTROYED',
      '破棄済みの Lounge は判定できません。'
    );
  }
  if (state.status === 'retired') {
    throw new LoungeTransitionError(
      'PET_RETIRED',
      'retired の Pet は再判定できません。'
    );
  }
  const current = advanceLounge(state, clock);
  if (current.status === 'destroyed') return current;
  return {
    status: 'retired',
    outcome: provider.decide({
      ownerPassport: current.ownerPassport,
      encounteredPassport: current.encounteredPassport,
    }),
    expiresAtWallClockMs: current.expiresAtWallClockMs,
    startedAtMonotonicMs: current.startedAtMonotonicMs,
  };
}

export function completeLounge(state: LoungeState): DestroyedLounge {
  if (state.status === 'destroyed') return state;
  if (state.status !== 'retired') {
    throw new LoungeTransitionError(
      'OUTCOME_NOT_AVAILABLE',
      '結果が確定した Lounge だけを完了できます。'
    );
  }
  return destroyLounge(state, 'completed');
}
