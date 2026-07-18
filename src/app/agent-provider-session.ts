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
}

function settledState(outcome: ProviderRunOutcome): ProviderRuntimeState {
  if (outcome.providerKind === 'rules') {
    return INITIAL_PROVIDER_RUNTIME_STATE;
  }
  return { status: 'local-model' };
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;

async function attemptProviderBeforeDeadline(
  provider: AgentModelProvider,
  input: AgentModelInput
): Promise<ProviderAttemptResult> {
  if (provider.kind === 'rules') return attemptProvider(provider, input);
  const remainingMs = Math.max(0, input.deadlineAtWallClockMs - Date.now());
  if (remainingMs === 0) {
    return {
      kind: 'failure',
      providerKind: 'local-agent',
      reason: 'timeout',
    };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProviderAttemptResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          kind: 'failure',
          providerKind: 'local-agent',
          reason: 'timeout',
        }),
      Math.min(remainingMs, MAX_TIMER_DELAY_MS)
    );
  });
  try {
    return await Promise.race([attemptProvider(provider, input), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface ExecutableAgentProviderSessionRequest
  extends AgentProviderSessionRequest {
  readonly ledger: ProviderRunLedger;
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

  if (request.provider.kind === 'local-agent') {
    apply({ type: 'local-started' });
  }

  try {
    const attempt = await attemptProviderBeforeDeadline(
      request.provider,
      request.input
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
 */
export function createAgentProviderSessionRunner(
  initialLedger: ProviderRunLedger = EMPTY_PROVIDER_RUN_LEDGER
): AgentProviderSessionRunner {
  let ledger = initialLedger;
  const inFlight = new Map<string, Promise<AgentProviderSessionResult>>();

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
    if (active) return active;

    let pending: Promise<AgentProviderSessionResult>;
    pending = Promise.resolve()
      .then(() => executeAgentProviderSession({ ...request, ledger }))
      .then((result) => {
        const nextLedger = new Map(ledger);
        nextLedger.set(request.encounterKey, result.outcome);
        ledger = nextLedger;
        return { ...result, ledger };
      })
      .finally(() => {
        if (inFlight.get(request.encounterKey) === pending) {
          inFlight.delete(request.encounterKey);
        }
      });
    inFlight.set(request.encounterKey, pending);
    return pending;
  }

  return { run };
}
