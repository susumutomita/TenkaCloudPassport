import { type Bridge, createBridgeFromEvidence } from './bridge';
import { type ClockSnapshot, hasElapsedTtl, isValidClock } from './clock-guard';
import type { InteractionDiscoveryResult } from './interaction-discovery-provider';
import type { MatchEvidence, OwnerAnswerValue } from './match-evidence';
import type { OwnerQuestion } from './owner-question';
import type { ConfirmedClue } from './passport';

/**
 * Issue 10: Pet の短時間・制限付き交流 State Machine。
 *
 * `waiting → discovering → clarifying → bridging | no-signal → retired` という
 * bounded protocol を、Transport / Storage / React / `llama.rn` に依存しない純粋な
 * discriminated union と Transition 関数として実装する。最大 45 秒・最大 2 Round
 * （discovering で 1 回、Owner Question を経て clarifying で 1 回）で必ず収束し、
 * Lounge の Expire / Exit による Cancel は実行中 Provider の新規 Output を破棄する。
 */
export const INTERACTION_DEADLINE_MS = 45_000;

export type NoSignalReason =
  | 'insufficient-information'
  | 'insufficient-evidence'
  | 'timeout';

export type InteractionCancelReason = 'lounge-expired' | 'lounge-exit';

export interface WaitingInteraction {
  readonly phase: 'waiting';
}

export interface DiscoveringInteraction {
  readonly phase: 'discovering';
  readonly round: 1;
  readonly startedAtMonotonicMs: number;
  readonly deadlineAtWallClockMs: number;
}

export interface ClarifyingInteraction {
  readonly phase: 'clarifying';
  readonly round: 2;
  readonly startedAtMonotonicMs: number;
  readonly deadlineAtWallClockMs: number;
  readonly question: OwnerQuestion;
  readonly candidateClue: ConfirmedClue;
}

export interface BridgingInteraction {
  readonly phase: 'bridging';
  readonly bridge: Bridge;
}

export interface NoSignalInteraction {
  readonly phase: 'no-signal';
  readonly reason: NoSignalReason;
}

export type InteractionOutcome =
  | { readonly kind: 'bridge'; readonly bridge: Bridge }
  | { readonly kind: 'no-signal'; readonly reason: NoSignalReason }
  | { readonly kind: 'cancelled'; readonly reason: InteractionCancelReason };

export interface RetiredInteraction {
  readonly phase: 'retired';
  readonly outcome: InteractionOutcome;
}

export type PetInteractionState =
  | WaitingInteraction
  | DiscoveringInteraction
  | ClarifyingInteraction
  | BridgingInteraction
  | NoSignalInteraction
  | RetiredInteraction;

export const INITIAL_PET_INTERACTION_STATE: WaitingInteraction = {
  phase: 'waiting',
};

export type PetInteractionErrorCode = 'INVALID_CLOCK' | 'INVALID_TRANSITION';

export class PetInteractionError extends Error {
  readonly code: PetInteractionErrorCode;

  constructor(code: PetInteractionErrorCode, message: string) {
    super(message);
    this.name = 'PetInteractionError';
    this.code = code;
  }
}

function assertValidClock(clock: ClockSnapshot): void {
  if (!isValidClock(clock)) {
    throw new PetInteractionError(
      'INVALID_CLOCK',
      'Pet Interaction の時計は有限値である必要があります。'
    );
  }
}

function hasDeadlinePassed(
  state: DiscoveringInteraction | ClarifyingInteraction,
  clock: ClockSnapshot
): boolean {
  return hasElapsedTtl(
    state.startedAtMonotonicMs,
    state.deadlineAtWallClockMs,
    clock,
    INTERACTION_DEADLINE_MS
  );
}

/** `waiting` からだけ呼べる。45 秒の締切を開始時刻から確定する。 */
export function beginInteraction(clock: ClockSnapshot): DiscoveringInteraction {
  assertValidClock(clock);
  return {
    phase: 'discovering',
    round: 1,
    startedAtMonotonicMs: clock.monotonicMs,
    deadlineAtWallClockMs: clock.wallClockMs + INTERACTION_DEADLINE_MS,
  };
}

/**
 * 未確認の候補手掛かりを、Owner の明示的な `yes` 回答なしに Bridge Evidence へ
 * 昇格させられないことを型と実行時の両方で保証する唯一の関数。
 */
export function buildConsentedEvidence(
  candidateClue: ConfirmedClue,
  answer: OwnerAnswerValue
): MatchEvidence {
  if (answer !== 'yes') {
    throw new PetInteractionError(
      'INVALID_TRANSITION',
      '未確認の手掛かりを Bridge Evidence へ昇格することはできません。'
    );
  }
  return {
    schemaVersion: 1,
    clues: [candidateClue],
    ownerAnswer: {
      questionId: 'confirm-shared-clue',
      answer: 'yes',
      sharingConsent: true,
    },
  };
}

export interface InteractionApplication {
  readonly state: PetInteractionState;
  /**
   * この呼び出しが実際に Provider / Owner の Output を状態へ反映したかを示す。
   * `discovering` / `clarifying` 以外で届いた Output、締切超過後に届いた Output は
   * `false`（破棄）になる。Cancel 済みの Lounge から遅延到着した Output も同様に
   * 破棄され、新しい状態を生成しない。
   */
  readonly applied: boolean;
}

/** `discovering` が Provider から受け取った Discovery 結果を適用する。 */
export function receiveDiscoveryResult(
  state: PetInteractionState,
  result: InteractionDiscoveryResult,
  clock: ClockSnapshot
): InteractionApplication {
  if (state.phase !== 'discovering') {
    return { state, applied: false };
  }
  assertValidClock(clock);
  if (hasDeadlinePassed(state, clock)) {
    return {
      state: { phase: 'no-signal', reason: 'timeout' },
      applied: false,
    };
  }
  if (result.kind === 'no-signal') {
    return {
      state: { phase: 'no-signal', reason: 'insufficient-information' },
      applied: true,
    };
  }
  return {
    state: {
      phase: 'clarifying',
      round: 2,
      startedAtMonotonicMs: state.startedAtMonotonicMs,
      deadlineAtWallClockMs: state.deadlineAtWallClockMs,
      question: result.question,
      candidateClue: result.candidateClue,
    },
    applied: true,
  };
}

/** `clarifying` が Owner の回答（1 人 1 問の唯一の回答）を適用する。 */
export function receiveOwnerAnswer(
  state: PetInteractionState,
  answer: OwnerAnswerValue,
  clock: ClockSnapshot
): InteractionApplication {
  if (state.phase !== 'clarifying') {
    return { state, applied: false };
  }
  assertValidClock(clock);
  if (hasDeadlinePassed(state, clock)) {
    return {
      state: { phase: 'no-signal', reason: 'timeout' },
      applied: false,
    };
  }
  if (answer === 'yes') {
    const evidence = buildConsentedEvidence(state.candidateClue, answer);
    return {
      state: { phase: 'bridging', bridge: createBridgeFromEvidence(evidence) },
      applied: true,
    };
  }
  return {
    state: { phase: 'no-signal', reason: 'insufficient-evidence' },
    applied: true,
  };
}

/**
 * Provider の応答を待たずに 45 秒の締切だけを確認する。`discovering` /
 * `clarifying` 以外では何もしない。
 */
export function advanceInteraction(
  state: PetInteractionState,
  clock: ClockSnapshot
): PetInteractionState {
  if (state.phase !== 'discovering' && state.phase !== 'clarifying') {
    return state;
  }
  assertValidClock(clock);
  if (hasDeadlinePassed(state, clock)) {
    return { phase: 'no-signal', reason: 'timeout' };
  }
  return state;
}

/**
 * Lounge Expire / Exit による Cancel。実行中 Provider の新規 Output は
 * （`receiveDiscoveryResult` / `receiveOwnerAnswer` が phase 不一致で破棄するため）
 * 反映されない。「最も早い Event が理由を決める」原則により、Cancel より先に
 * `bridging` / `no-signal` として確定していた結果は上書きしない（`retireInteraction`
 * と同じ確定結果のまま `retired` にする）。すでに `retired` であれば、その終了理由を
 * そのまま保つ。まだ結果が確定していない（`waiting` / `discovering` / `clarifying`）
 * 場合だけ `cancelled` として確定する。
 */
export function cancelInteraction(
  state: PetInteractionState,
  reason: InteractionCancelReason
): RetiredInteraction {
  if (state.phase === 'retired') return state;
  if (state.phase === 'bridging' || state.phase === 'no-signal') {
    return retireInteraction(state);
  }
  return { phase: 'retired', outcome: { kind: 'cancelled', reason } };
}

/** `bridging` / `no-signal` で確定した結果を `retired` として閉じる。 */
export function retireInteraction(
  state: PetInteractionState
): RetiredInteraction {
  if (state.phase === 'bridging') {
    return {
      phase: 'retired',
      outcome: { kind: 'bridge', bridge: state.bridge },
    };
  }
  if (state.phase === 'no-signal') {
    return {
      phase: 'retired',
      outcome: { kind: 'no-signal', reason: state.reason },
    };
  }
  if (state.phase === 'retired') return state;
  throw new PetInteractionError(
    'INVALID_TRANSITION',
    'bridging または no-signal だけが retired へ遷移できます。'
  );
}

export type PetInteractionAction =
  | { readonly type: 'begin'; readonly clock: ClockSnapshot }
  | {
      readonly type: 'discovery-result';
      readonly result: InteractionDiscoveryResult;
      readonly clock: ClockSnapshot;
    }
  | {
      readonly type: 'owner-answer';
      readonly answer: OwnerAnswerValue;
      readonly clock: ClockSnapshot;
    }
  | { readonly type: 'tick'; readonly clock: ClockSnapshot }
  | { readonly type: 'cancel'; readonly reason: InteractionCancelReason }
  | { readonly type: 'retire' };

/**
 * 唯一の公開 Entry Point。各 Action が受け付ける State と生成できる Output は
 * この exhaustive な switch と上記の discriminated union だけで決まる。
 */
export function reducePetInteraction(
  state: PetInteractionState,
  action: PetInteractionAction
): PetInteractionState {
  switch (action.type) {
    case 'begin':
      if (state.phase !== 'waiting') {
        throw new PetInteractionError(
          'INVALID_TRANSITION',
          'waiting からしか discovering を開始できません。'
        );
      }
      return beginInteraction(action.clock);
    case 'discovery-result':
      return receiveDiscoveryResult(state, action.result, action.clock).state;
    case 'owner-answer':
      return receiveOwnerAnswer(state, action.answer, action.clock).state;
    case 'tick':
      return advanceInteraction(state, action.clock);
    case 'cancel':
      return cancelInteraction(state, action.reason);
    case 'retire':
      return retireInteraction(state);
  }
}
