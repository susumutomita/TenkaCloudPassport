import {
  type AgentModelInput,
  type AgentModelProvider,
  AgentModelProviderError,
  rulesAgentModelDecision,
} from '../domain/agent-model-provider';
import {
  attemptProvider,
  EMPTY_PROVIDER_RUN_LEDGER,
  type ProviderAttemptResult,
  type ProviderRunLedger,
  type ProviderRunOutcome,
  type ProviderSwitchReason,
  runProviderOnce,
} from '../domain/provider-fallback';
import type { PilotProviderRun } from './pilot-measurement';

export type ProviderRuntimeState =
  | { readonly status: 'rules' }
  | { readonly status: 'loading-local-model' }
  | { readonly status: 'local-model' }
  | {
      readonly status: 'falling-back';
      readonly reason: ProviderSwitchReason;
    }
  | { readonly status: 'failed' };

/** UI が表示できる Provider の状態。入力、出力、Error 本文を一切保持しない。 */
export type ProviderRuntimeStatus = ProviderRuntimeState['status'];

export const INITIAL_PROVIDER_RUNTIME_STATE: ProviderRuntimeState = {
  status: 'rules',
};

export type ProviderRuntimeEvent =
  | { readonly type: 'local-started' }
  | { readonly type: 'local-succeeded' }
  | {
      readonly type: 'local-failed';
      readonly reason: ProviderSwitchReason;
    }
  | { readonly type: 'fallback-succeeded' }
  | { readonly type: 'unexpected-failure' }
  | { readonly type: 'reset' };

/**
 * 順序外の遅延 Event は no-op にする純粋な State Machine。`unexpected-failure` と `reset` だけは
 * どの状態からでも受理し、Error 内容や Model Output は State に保存しない。
 */
export function transitionProviderRuntime(
  state: ProviderRuntimeState,
  event: ProviderRuntimeEvent
): ProviderRuntimeState {
  if (event.type === 'reset') return INITIAL_PROVIDER_RUNTIME_STATE;
  if (event.type === 'unexpected-failure') return { status: 'failed' };
  if (state.status === 'rules' && event.type === 'local-started') {
    return { status: 'loading-local-model' };
  }
  if (state.status === 'loading-local-model') {
    if (event.type === 'local-succeeded') return { status: 'local-model' };
    if (event.type === 'local-failed') {
      return { status: 'falling-back', reason: event.reason };
    }
  }
  if (state.status === 'falling-back' && event.type === 'fallback-succeeded') {
    return INITIAL_PROVIDER_RUNTIME_STATE;
  }
  return state;
}

export interface AgentProviderSessionRequest {
  readonly state: ProviderRuntimeState;
  readonly encounterKey: string;
  readonly provider: AgentModelProvider;
  readonly input: AgentModelInput;
  readonly onStateChange?: (state: ProviderRuntimeState) => void;
}

export interface AgentProviderSessionResult {
  readonly state: ProviderRuntimeState;
  readonly ledger: ProviderRunLedger;
  readonly outcome: ProviderRunOutcome;
}

export interface AgentProviderSessionRunner {
  readonly run: (
    request: AgentProviderSessionRequest
  ) => Promise<AgentProviderSessionResult>;
  /** 実行中 Encounter だけを取り消す。確定済み・未知 Key は false の no-op。 */
  readonly cancel: (encounterKey: string) => boolean;
  /** 実行中処理を取り消し、確定済み Outcome と遅延完了の再登録権限を破棄する。 */
  readonly forget: (encounterKey: string) => void;
}

export interface ProviderResultApplicationGate {
  /** Provider 呼出し前に同期取得し、同じ render 内の二重開始を拒否する。 */
  readonly begin: (encounterKey: string) => boolean;
  readonly isPending: (encounterKey: string) => boolean;
  /** 最初の Settlement だけが true を得て、結果適用権限を原子的に消費する。 */
  readonly settle: (encounterKey: string) => boolean;
  readonly clear: () => void;
}

/** Runner の Promise 去重とは別に、App 側の開始要求と結果 Handler を 1 回へ限定する Gate。 */
export function createProviderResultApplicationGate(): ProviderResultApplicationGate {
  let pendingEncounterKey: string | null = null;
  return {
    begin(encounterKey) {
      if (pendingEncounterKey !== null) return false;
      pendingEncounterKey = encounterKey;
      return true;
    },
    isPending(encounterKey) {
      return pendingEncounterKey === encounterKey;
    },
    settle(encounterKey) {
      if (pendingEncounterKey !== encounterKey) return false;
      pendingEncounterKey = null;
      return true;
    },
    clear() {
      pendingEncounterKey = null;
    },
  };
}

function settledState(outcome: ProviderRunOutcome): ProviderRuntimeState {
  if (outcome.providerKind === 'rules') {
    return INITIAL_PROVIDER_RUNTIME_STATE;
  }
  return { status: 'local-model' };
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;

type ProviderCancellationReason = Extract<
  ProviderSwitchReason,
  'timeout' | 'cancelled'
>;

interface ProviderCancellation {
  readonly controller: AbortController;
  reason: ProviderCancellationReason | undefined;
  teardown: Promise<boolean>;
}

function requestProviderCancellation(
  cancellation: ProviderCancellation,
  reason: ProviderCancellationReason
): boolean {
  if (cancellation.controller.signal.aborted) return false;
  cancellation.reason = reason;
  cancellation.controller.abort();
  return true;
}

function cancellationFailure(
  reason: ProviderCancellationReason,
  attempt?: ProviderAttemptResult
): ProviderAttemptResult {
  return {
    kind: 'failure',
    providerKind: 'local-agent',
    reason,
    ...(attempt?.kind === 'failure' && attempt.nativeLaneQuarantined
      ? { nativeLaneQuarantined: true as const }
      : {}),
  };
}

async function attemptProviderBeforeDeadline(
  provider: AgentModelProvider,
  input: AgentModelInput,
  cancellation: ProviderCancellation,
  nowWallClockMs: () => number
): Promise<ProviderAttemptResult> {
  if (provider.kind === 'rules') return attemptProvider(provider, input);
  const remainingMs = Math.max(
    0,
    input.deadlineAtWallClockMs - nowWallClockMs()
  );
  if (remainingMs === 0) {
    requestProviderCancellation(cancellation, 'timeout');
    return cancellationFailure('timeout');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const signal = cancellation.controller.signal;
  try {
    if (signal.aborted) {
      return cancellationFailure(cancellation.reason ?? 'cancelled');
    }
    let settleCancellation: (() => void) | undefined;
    const interrupted = new Promise<ProviderAttemptResult>((resolve) => {
      settleCancellation = () =>
        resolve(cancellationFailure(cancellation.reason ?? 'cancelled'));
      abortListener = settleCancellation;
      signal.addEventListener('abort', abortListener, { once: true });
    });
    timer = setTimeout(
      () => {
        requestProviderCancellation(cancellation, 'timeout');
        settleCancellation?.();
      },
      Math.min(remainingMs, MAX_TIMER_DELAY_MS)
    );
    const providerAttempt = attemptProvider(provider, input, { signal });
    cancellation.teardown = providerAttempt.then(
      (attempt) =>
        !(attempt.kind === 'failure' && attempt.nativeLaneQuarantined),
      () => false
    );
    const attempt = await Promise.race([providerAttempt, interrupted]);
    if (cancellation.reason) {
      return cancellationFailure(cancellation.reason, attempt);
    }
    if (
      attempt.kind === 'success' &&
      nowWallClockMs() >= input.deadlineAtWallClockMs
    ) {
      requestProviderCancellation(cancellation, 'timeout');
      return cancellationFailure('timeout', attempt);
    }
    return attempt;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) signal.removeEventListener('abort', abortListener);
  }
}

async function acquireNativeLaneBeforeDeadline(
  lane: Promise<void>,
  input: AgentModelInput,
  cancellation: ProviderCancellation,
  nowWallClockMs: () => number
): Promise<boolean> {
  const remainingMs = Math.max(
    0,
    input.deadlineAtWallClockMs - nowWallClockMs()
  );
  if (remainingMs === 0) {
    requestProviderCancellation(cancellation, 'timeout');
    return false;
  }
  const signal = cancellation.controller.signal;
  if (signal.aborted) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const unavailable = new Promise<boolean>((resolve) => {
    abortListener = () => resolve(false);
    signal.addEventListener('abort', abortListener, { once: true });
    timer = setTimeout(
      () => {
        requestProviderCancellation(cancellation, 'timeout');
        resolve(false);
      },
      Math.min(remainingMs, MAX_TIMER_DELAY_MS)
    );
  });
  try {
    return await Promise.race([lane.then(() => true), unavailable]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) signal.removeEventListener('abort', abortListener);
  }
}

interface ExecutableAgentProviderSessionRequest
  extends AgentProviderSessionRequest {
  readonly ledger: ProviderRunLedger;
  readonly cancellation: ProviderCancellation;
  readonly nowWallClockMs: () => number;
}

/** Provider 1 回分を検証し、型付き失敗だけ Rules へ Fallback する内部実行境界。 */
async function executeAgentProviderSession(
  request: ExecutableAgentProviderSessionRequest
): Promise<AgentProviderSessionResult> {
  let state = request.state;
  function apply(event: ProviderRuntimeEvent): void {
    state = transitionProviderRuntime(state, event);
    request.onStateChange?.(state);
  }

  if (
    request.provider.kind === 'local-agent' &&
    !request.cancellation.controller.signal.aborted
  ) {
    apply({ type: 'local-started' });
  }

  try {
    const attempt = await attemptProviderBeforeDeadline(
      request.provider,
      request.input,
      request.cancellation,
      request.nowWallClockMs
    );
    if (attempt.kind === 'failure') {
      if (request.provider.kind === 'rules') {
        apply({ type: 'unexpected-failure' });
        throw new AgentModelProviderError(
          'SCHEMA_ERROR',
          'Rules Provider の Output を検証できませんでした。'
        );
      }
      apply({ type: 'local-failed', reason: attempt.reason });
    }
    const step = runProviderOnce(
      request.ledger,
      request.encounterKey,
      attempt,
      () => rulesAgentModelDecision(request.input)
    );
    if (attempt.kind === 'failure') {
      apply({ type: 'fallback-succeeded' });
    } else if (request.provider.kind === 'local-agent') {
      apply({ type: 'local-succeeded' });
    }
    return { state, ledger: step.ledger, outcome: step.outcome };
  } catch (error: unknown) {
    if (state.status !== 'failed') apply({ type: 'unexpected-failure' });
    throw error;
  }
}

/**
 * Encounter 単位の実行中 Promise と確定済み Ledger を同じ Closure で所有する Runner。
 * 同じ Key の同時呼び出しには同一 Promise、完了後の呼び出しには同一 Outcome を返す。
 * Native Lane は 1 本に直列化し、前 Context の停止・解放前に次 Context を開始しない。
 */
export function createAgentProviderSessionRunner(
  initialLedger: ProviderRunLedger = EMPTY_PROVIDER_RUN_LEDGER,
  nowWallClockMs: () => number = Date.now
): AgentProviderSessionRunner {
  let ledger = initialLedger;
  const inFlight = new Map<
    string,
    {
      readonly promise: Promise<AgentProviderSessionResult>;
      readonly cancellation: ProviderCancellation;
    }
  >();
  const forgottenRuns = new WeakSet<Promise<AgentProviderSessionResult>>();
  let nativeLaneTail: Promise<void> = Promise.resolve();

  function run(
    request: AgentProviderSessionRequest
  ): Promise<AgentProviderSessionResult> {
    const existing = ledger.get(request.encounterKey);
    if (existing) {
      return Promise.resolve({
        state: settledState(existing),
        ledger,
        outcome: existing,
      });
    }
    const active = inFlight.get(request.encounterKey);
    if (active) return active.promise;

    const cancellation: ProviderCancellation = {
      controller: new AbortController(),
      reason: undefined,
      teardown: Promise.resolve(true),
    };
    let waitForNativeLane = Promise.resolve();
    let releaseNativeLane: (() => void) | undefined;
    if (request.provider.kind === 'local-agent') {
      waitForNativeLane = nativeLaneTail;
      nativeLaneTail = new Promise<void>((resolve) => {
        releaseNativeLane = resolve;
      });
    }
    let pending: Promise<AgentProviderSessionResult>;
    const nativeLaneAcquisition =
      request.provider.kind === 'local-agent'
        ? acquireNativeLaneBeforeDeadline(
            waitForNativeLane,
            request.input,
            cancellation,
            nowWallClockMs
          )
        : Promise.resolve(true);
    pending = nativeLaneAcquisition
      .then(async (acquiredNativeLane) => {
        if (!acquiredNativeLane) {
          void waitForNativeLane.then(() => releaseNativeLane?.());
          return executeAgentProviderSession({
            ...request,
            ledger,
            cancellation,
            nowWallClockMs,
          });
        }
        try {
          return await executeAgentProviderSession({
            ...request,
            ledger,
            cancellation,
            nowWallClockMs,
          });
        } finally {
          void cancellation.teardown.then((nativeLaneReusable) => {
            if (nativeLaneReusable) releaseNativeLane?.();
          });
        }
      })
      .then((result) => {
        if (forgottenRuns.has(pending)) return { ...result, ledger };
        const nextLedger = new Map(ledger);
        nextLedger.set(request.encounterKey, result.outcome);
        ledger = nextLedger;
        return { ...result, ledger };
      })
      .finally(() => {
        if (inFlight.get(request.encounterKey)?.promise === pending) {
          inFlight.delete(request.encounterKey);
        }
      });
    inFlight.set(request.encounterKey, { promise: pending, cancellation });
    return pending;
  }

  function cancel(encounterKey: string): boolean {
    const active = inFlight.get(encounterKey);
    if (!active) return false;
    return requestProviderCancellation(active.cancellation, 'cancelled');
  }

  function forget(encounterKey: string): void {
    const active = inFlight.get(encounterKey);
    if (active) {
      forgottenRuns.add(active.promise);
      requestProviderCancellation(active.cancellation, 'cancelled');
      inFlight.delete(encounterKey);
    }
    if (ledger.has(encounterKey)) {
      const nextLedger = new Map(ledger);
      nextLedger.delete(encounterKey);
      ledger = nextLedger;
    }
  }

  return { run, cancel, forget };
}

/** Pilot Counter へ渡す排他的 Provider 区分を確定 Outcome だけから導く。 */
export function pilotProviderRunFromOutcome(
  outcome: ProviderRunOutcome
): PilotProviderRun {
  if (outcome.settledBy === 'rules-fallback') return 'fallback';
  return outcome.providerKind === 'rules' ? 'rules' : 'local-llm';
}
