import { describe, expect, it } from 'bun:test';
import {
  type AgentModelDecision,
  type AgentModelInput,
  type AgentModelProvider,
  AgentModelProviderError,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import {
  EMPTY_PROVIDER_RUN_LEDGER,
  type ProviderRunLedger,
} from '../domain/provider-fallback';
import {
  type AgentProviderSessionRequest,
  type AgentProviderSessionRunner,
  createAgentProviderSessionRunner,
  INITIAL_PROVIDER_RUNTIME_STATE,
  type ProviderRuntimeState,
  transitionProviderRuntime,
} from './agent-provider-session';

const INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source']),
  encounteredPassport: passport(['open-source']),
  language: 'ja',
  deadlineAtWallClockMs: 4_102_444_800_000,
};

const LOCAL_SUCCESS_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide() {
    return { kind: 'bridge', evidenceIds: ['topic:open-source'] };
  },
};

const LOCAL_SCHEMA_ERROR_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide() {
    return {
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
      url: 'https://example.invalid',
    };
  },
};

const LOCAL_CANCELLED_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<never> {
    return Promise.reject(
      new AgentModelProviderError('CANCELLED', 'Native context was cancelled.')
    );
  },
};

const LOCAL_UNKNOWN_ERROR_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<never> {
    return Promise.reject(new Error('sensitive raw model failure'));
  },
};

const INVALID_RULES_PROVIDER: AgentModelProvider = {
  kind: 'rules',
  provide() {
    return { kind: 'bridge', evidenceIds: [] };
  },
};

function statusTrace() {
  const states: ProviderRuntimeState[] = [];
  return {
    states,
    onStateChange(state: ProviderRuntimeState) {
      states.push(state);
    },
  };
}

function runAgentProviderSession(
  request: AgentProviderSessionRequest & {
    readonly ledger: ProviderRunLedger;
  }
) {
  const { ledger, ...sessionRequest } = request;
  return createAgentProviderSessionRunner(ledger).run(sessionRequest);
}

describe('Provider Runtime State Machine', () => {
  it('Local Model の開始・成功を loading-local-model → local-model として表す', () => {
    const loading = transitionProviderRuntime(INITIAL_PROVIDER_RUNTIME_STATE, {
      type: 'local-started',
    });
    const succeeded = transitionProviderRuntime(loading, {
      type: 'local-succeeded',
    });

    expect(loading).toEqual({ status: 'loading-local-model' });
    expect(succeeded).toEqual({ status: 'local-model' });
  });

  it('型付き失敗・Rules 成功を falling-back → rules として表す', () => {
    const loading = transitionProviderRuntime(INITIAL_PROVIDER_RUNTIME_STATE, {
      type: 'local-started',
    });
    const fallingBack = transitionProviderRuntime(loading, {
      type: 'local-failed',
      reason: 'schema-error',
    });
    const rules = transitionProviderRuntime(fallingBack, {
      type: 'fallback-succeeded',
    });

    expect(fallingBack).toEqual({
      status: 'falling-back',
      reason: 'schema-error',
    });
    expect(rules).toEqual({ status: 'rules' });
  });

  it('未知障害は内容を State に保持せず failed にする', () => {
    expect(
      transitionProviderRuntime(
        { status: 'loading-local-model' },
        { type: 'unexpected-failure' }
      )
    ).toEqual({ status: 'failed' });
  });

  it('順序外の成功 Event は状態を変えず、遅延結果を新しい Outcome と誤認しない', () => {
    expect(
      transitionProviderRuntime(INITIAL_PROVIDER_RUNTIME_STATE, {
        type: 'local-succeeded',
      })
    ).toBe(INITIAL_PROVIDER_RUNTIME_STATE);

    const loading: ProviderRuntimeState = { status: 'loading-local-model' };
    expect(
      transitionProviderRuntime(loading, { type: 'fallback-succeeded' })
    ).toBe(loading);
  });

  it('新しい Encounter の reset はどの状態からでも rules へ戻す', () => {
    expect(
      transitionProviderRuntime(
        { status: 'falling-back', reason: 'cancelled' },
        { type: 'reset' }
      )
    ).toBe(INITIAL_PROVIDER_RUNTIME_STATE);
  });
});

describe('runAgentProviderSession: 同一 Contract・Fallback-once・Status 遷移', () => {
  it('Encounter Cancel は実行中 Provider の Signal を Abort し Rules へ 1 回だけ切り替える', async () => {
    let receivedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      provide(_input, options) {
        receivedSignal = options?.signal;
        markStarted?.();
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                new AgentModelProviderError(
                  'CANCELLED',
                  'Native completion was cancelled.'
                )
              ),
            { once: true }
          );
        });
      },
    };
    const runner = createAgentProviderSessionRunner();
    const pending = runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-cancel',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });
    await started;

    expect(receivedSignal?.aborted).toBe(false);
    expect(runner.cancel('encounter-cancel')).toBe(true);
    expect(receivedSignal?.aborted).toBe(true);

    const result = await pending;
    expect(result.outcome.settledBy).toBe('rules-fallback');
    expect(result.outcome.switchReason).toBe('cancelled');
    expect(result.state).toEqual({ status: 'rules' });
    expect(runner.cancel('encounter-cancel')).toBe(false);
  });

  it('実行中でない Encounter の Cancel は副作用のない false を返す', () => {
    const runner = createAgentProviderSessionRunner();

    expect(runner.cancel('encounter-unknown')).toBe(false);
  });

  it('Provider 開始前の即時 Cancel は Native Provider を呼ばず Rules へ切り替える', async () => {
    let calls = 0;
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      provide() {
        calls += 1;
        return { kind: 'no-signal' };
      },
    };
    const runner = createAgentProviderSessionRunner();
    const pending = runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-cancel-before-start',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });

    expect(runner.cancel('encounter-cancel-before-start')).toBe(true);
    const result = await pending;

    expect(calls).toBe(0);
    expect(result.outcome.switchReason).toBe('cancelled');
  });

  it('同じ Encounter の同時呼び出しは実行中 Promise を共有し、Provider を 1 回だけ呼ぶ', async () => {
    let calls = 0;
    let completeProvider: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      provide() {
        calls += 1;
        markStarted?.();
        return new Promise((resolve) => {
          completeProvider = () => resolve({ kind: 'no-signal' });
        });
      },
    };
    const runner = createAgentProviderSessionRunner();
    const request = {
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-concurrent',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    };

    const first = runner.run(request);
    const second = runner.run(request);

    expect(second).toBe(first);
    await started;
    expect(calls).toBe(1);
    completeProvider?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult.outcome).toBe(firstResult.outcome);
    expect(secondResult.ledger).toBe(firstResult.ledger);
  });

  it('loading Status Callback から同じ Encounter を同期再入しても Provider を二重起動しない', async () => {
    let calls = 0;
    let didReenter = false;
    let completeProvider: (() => void) | undefined;
    let nested: ReturnType<AgentProviderSessionRunner['run']> | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      provide() {
        calls += 1;
        markStarted?.();
        return new Promise((resolve) => {
          completeProvider = () => resolve({ kind: 'no-signal' });
        });
      },
    };
    const runner = createAgentProviderSessionRunner();
    const request: AgentProviderSessionRequest = {
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-status-reentrant',
      provider,
      input: INPUT,
      onStateChange(state) {
        if (state.status === 'loading-local-model' && !didReenter) {
          didReenter = true;
          nested = runner.run(request);
        }
      },
    };

    const outer = runner.run(request);
    await started;

    expect(calls).toBe(1);
    expect(nested).toBe(outer);
    completeProvider?.();
    await outer;
  });

  it('Deadline は Rules を期限で返し、Native Lane だけを解放完了まで保持する', async () => {
    let deadlineSignal: AbortSignal | undefined;
    let teardownFinished = false;
    let finishTeardown: (() => void) | undefined;
    const teardown = new Promise<void>((resolve) => {
      finishTeardown = resolve;
    });
    let markAbortObserved: (() => void) | undefined;
    const abortObserved = new Promise<void>((resolve) => {
      markAbortObserved = resolve;
    });
    const abortAwareProvider: AgentModelProvider = {
      kind: 'local-agent',
      async provide(_input, options) {
        deadlineSignal = options?.signal;
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
        markAbortObserved?.();
        await teardown;
        teardownFinished = true;
        throw new AgentModelProviderError(
          'CANCELLED',
          'Native teardown completed.'
        );
      },
    };
    const runner = createAgentProviderSessionRunner();
    const pending = runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-enforced-timeout',
      provider: abortAwareProvider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10 },
    });

    await abortObserved;
    const result = await pending;

    expect(teardownFinished).toBe(false);
    expect(result.outcome.settledBy).toBe('rules-fallback');
    expect(result.outcome.switchReason).toBe('timeout');
    expect(result.state).toBe(INITIAL_PROVIDER_RUNTIME_STATE);
    expect(deadlineSignal?.aborted).toBe(true);
    finishTeardown?.();
    await teardown;
  });

  it('Abort を無視する Provider でも期限で Rules を返し、次の Native Context は開始しない', async () => {
    let calls = 0;
    const ignoresAbortProvider: AgentModelProvider = {
      kind: 'local-agent',
      provide() {
        calls += 1;
        return new Promise(() => undefined);
      },
    };
    const runner = createAgentProviderSessionRunner();

    const first = await runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-ignores-abort-first',
      provider: ignoresAbortProvider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10 },
    });
    const second = await runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-ignores-abort-second',
      provider: ignoresAbortProvider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10 },
    });

    expect(first.outcome.switchReason).toBe('timeout');
    expect(second.outcome.switchReason).toBe('timeout');
    expect(calls).toBe(1);
  });

  it('開始前に Deadline を過ぎていれば Local Provider を呼ばず timeout にする', async () => {
    let calls = 0;
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      provide() {
        calls += 1;
        return { kind: 'no-signal' };
      },
    };
    const runner = createAgentProviderSessionRunner();
    const result = await runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-expired-before-start',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: 0 },
    });

    expect(calls).toBe(0);
    expect(result.outcome.switchReason).toBe('timeout');
  });

  it('Deadline Abort 後の Local Provider 遅延成功は timeout Outcome を上書きしない', async () => {
    let calls = 0;
    let completeProvider: (() => void) | undefined;
    let markAbortObserved: (() => void) | undefined;
    const abortObserved = new Promise<void>((resolve) => {
      markAbortObserved = resolve;
    });
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      provide(_input, options) {
        calls += 1;
        options?.signal?.addEventListener(
          'abort',
          () => markAbortObserved?.(),
          { once: true }
        );
        return new Promise((resolve) => {
          completeProvider = () =>
            resolve({
              kind: 'bridge',
              evidenceIds: ['topic:open-source'],
            });
        });
      },
    };
    const runner = createAgentProviderSessionRunner();
    const request = {
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-late-completion',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10 },
    };
    const pending = runner.run(request);

    await abortObserved;
    completeProvider?.();
    const settled = await pending;
    const replayed = await runner.run(request);

    expect(calls).toBe(1);
    expect(settled.outcome.switchReason).toBe('timeout');
    expect(replayed.outcome).toBe(settled.outcome);
    expect(replayed.state).toBe(INITIAL_PROVIDER_RUNTIME_STATE);
  });

  it('Cancel 済み Context の解放前に別 Encounter の Native Context を開始しない', async () => {
    let calls = 0;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let finishFirstTeardown: (() => void) | undefined;
    const firstTeardown = new Promise<void>((resolve) => {
      finishFirstTeardown = resolve;
    });
    let markFirstAbort: (() => void) | undefined;
    const firstAbort = new Promise<void>((resolve) => {
      markFirstAbort = resolve;
    });
    const provider: AgentModelProvider = {
      kind: 'local-agent',
      async provide(_input, options) {
        calls += 1;
        if (calls > 1) return { kind: 'no-signal' };
        markFirstStarted?.();
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
        markFirstAbort?.();
        await firstTeardown;
        throw new AgentModelProviderError(
          'CANCELLED',
          'First Context released.'
        );
      },
    };
    const runner = createAgentProviderSessionRunner();
    const first = runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-native-lane-first',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });
    await firstStarted;
    expect(runner.cancel('encounter-native-lane-first')).toBe(true);
    await firstAbort;

    const second = runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'encounter-native-lane-second',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });
    await Promise.resolve();
    expect(calls).toBe(1);

    finishFirstTeardown?.();
    await first;
    const secondResult = await second;
    expect(calls).toBe(2);
    expect(secondResult.outcome.settledBy).toBe('primary');
  });

  it('Local Provider の検証済み成功を 1 回だけ採用する', async () => {
    const trace = statusTrace();
    const result = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-local-success',
      provider: LOCAL_SUCCESS_PROVIDER,
      input: INPUT,
      onStateChange: trace.onStateChange,
    });

    expect(trace.states.map((state) => state.status)).toEqual([
      'loading-local-model',
      'local-model',
    ]);
    expect(result.state).toEqual({ status: 'local-model' });
    expect(result.outcome.settledBy).toBe('primary');
    expect(result.outcome.decision.kind).toBe('bridge');
  });

  it('不正 Local Output は schema-error として Rules へ 1 回だけ切り替える', async () => {
    const trace = statusTrace();
    const result = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-schema-fallback',
      provider: LOCAL_SCHEMA_ERROR_PROVIDER,
      input: INPUT,
      onStateChange: trace.onStateChange,
    });

    expect(trace.states).toEqual([
      { status: 'loading-local-model' },
      { status: 'falling-back', reason: 'schema-error' },
      { status: 'rules' },
    ]);
    expect(result.outcome.settledBy).toBe('rules-fallback');
    expect(result.outcome.switchReason).toBe('schema-error');
  });

  it('Cancel は型付き cancelled として Rules へ切り替える', async () => {
    const result = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-cancelled',
      provider: LOCAL_CANCELLED_PROVIDER,
      input: INPUT,
    });

    expect(result.outcome.settledBy).toBe('rules-fallback');
    expect(result.outcome.switchReason).toBe('cancelled');
    expect(result.state).toEqual({ status: 'rules' });
  });

  it('Model 未導入時は Rules Provider だけで完走し、Local 読込状態へ入らない', async () => {
    const trace = statusTrace();
    const result = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-rules-only',
      provider: RULES_MODEL_PROVIDER,
      input: INPUT,
      onStateChange: trace.onStateChange,
    });

    expect(trace.states).toEqual([]);
    expect(result.state).toEqual({ status: 'rules' });
    expect(result.outcome.decision.kind).toBe('bridge');
  });

  it('未知例外は生の内容を State に保存せず failed にして再送出する', async () => {
    const trace = statusTrace();
    const run = runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-unknown-failure',
      provider: LOCAL_UNKNOWN_ERROR_PROVIDER,
      input: INPUT,
      onStateChange: trace.onStateChange,
    });

    await expect(run).rejects.toThrow('sensitive raw model failure');
    expect(trace.states).toEqual([
      { status: 'loading-local-model' },
      { status: 'failed' },
    ]);
    expect(JSON.stringify(trace.states)).not.toContain('sensitive');
  });

  it('同じ Encounter の再実行は確定済み Outcome を返し、Provider を再度呼ばない', async () => {
    let calls = 0;
    const countingProvider: AgentModelProvider = {
      kind: 'local-agent',
      provide(): { readonly kind: 'no-signal' } {
        calls += 1;
        return { kind: 'no-signal' };
      },
    };
    const first = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-idempotent',
      provider: countingProvider,
      input: INPUT,
    });
    const second = await runAgentProviderSession({
      state: first.state,
      ledger: first.ledger,
      encounterKey: 'encounter-idempotent',
      provider: countingProvider,
      input: INPUT,
    });

    expect(calls).toBe(1);
    expect(second.outcome).toBe(first.outcome);
    expect(second.ledger).toBe(first.ledger);
  });

  it('Rules Fallback で確定済みの Encounter も再実行せず rules 状態を復元する', async () => {
    const first = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-fallback-idempotent',
      provider: LOCAL_SCHEMA_ERROR_PROVIDER,
      input: INPUT,
    });
    const second = await runAgentProviderSession({
      state: { status: 'failed' },
      ledger: first.ledger,
      encounterKey: 'encounter-fallback-idempotent',
      provider: LOCAL_SCHEMA_ERROR_PROVIDER,
      input: INPUT,
    });

    expect(first.outcome.settledBy).toBe('rules-fallback');
    expect(second.state).toBe(INITIAL_PROVIDER_RUNTIME_STATE);
    expect(second.outcome).toBe(first.outcome);
  });

  it('確定済み Local Outcome は再実行時に Rules が渡されても local-model 状態を復元する', async () => {
    const first = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-provider-source',
      provider: LOCAL_SUCCESS_PROVIDER,
      input: INPUT,
    });
    const second = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: first.ledger,
      encounterKey: 'encounter-provider-source',
      provider: RULES_MODEL_PROVIDER,
      input: INPUT,
    });

    expect(second.state).toEqual({ status: 'local-model' });
    expect(second.outcome.providerKind).toBe('local-agent');
  });

  it('Rules Provider 自体の不正 Output は再 Fallback せず failed にして fail loudly する', async () => {
    const trace = statusTrace();
    const run = runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-invalid-rules',
      provider: INVALID_RULES_PROVIDER,
      input: INPUT,
      onStateChange: trace.onStateChange,
    });

    await expect(run).rejects.toThrow(
      'Rules Provider の Output を検証できませんでした。'
    );
    expect(trace.states).toEqual([{ status: 'failed' }]);
  });

  it('Decision 型は実行結果として保持し、UI State へ Passport や Model Output を混ぜない', async () => {
    const result = await runAgentProviderSession({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      ledger: EMPTY_PROVIDER_RUN_LEDGER,
      encounterKey: 'encounter-state-privacy',
      provider: LOCAL_SUCCESS_PROVIDER,
      input: INPUT,
    });
    const decision: AgentModelDecision = result.outcome.decision;

    expect(decision.kind).toBe('bridge');
    expect(Object.keys(result.state)).toEqual(['status']);
  });
});
