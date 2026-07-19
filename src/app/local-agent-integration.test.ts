import { describe, expect, it } from 'bun:test';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import type {
  LlamaContextPort,
  LlamaModulePort,
} from '../local-agent/llama-agent-model-provider';
import { materializeAgentModelOutcome } from './agent-model-live-outcome';
import {
  createAgentProviderSessionRunner,
  INITIAL_PROVIDER_RUNTIME_STATE,
} from './agent-provider-session';
import { LocalModelContextLeaseRegistry } from './local-data-control';
import { createNativeAgentModelProvider } from './native-agent-model-provider-composition';

const INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source']),
  encounteredPassport: passport(['open-source']),
  language: 'ja',
  deadlineAtWallClockMs: 4_102_444_800_000,
};

const MODEL_ENVIRONMENT = {
  modelPath: 'file:///data/model.gguf',
  nCtx: '2048',
  nGpuLayers: '0',
  nPredict: '96',
} as const;

class CompletedContext implements LlamaContextPort {
  releaseCalls = 0;

  constructor(private readonly text: string) {}

  async completion(): Promise<unknown> {
    return { text: this.text };
  }

  async stopCompletion(): Promise<void> {
    return;
  }

  async release(): Promise<void> {
    this.releaseCalls += 1;
  }
}

function moduleWithContext(context: LlamaContextPort): LlamaModulePort {
  return { initLlama: async () => context };
}

async function runProvider(
  encounterKey: string,
  provider: ReturnType<typeof createNativeAgentModelProvider>
) {
  return createAgentProviderSessionRunner().run({
    state: INITIAL_PROVIDER_RUNTIME_STATE,
    encounterKey,
    provider,
    input: INPUT,
  });
}

function createDevelopmentBuildProvider(
  environment: Parameters<
    typeof createNativeAgentModelProvider
  >[0]['environment'],
  loadModule: Parameters<
    typeof createNativeAgentModelProvider
  >[0]['loadModule'],
  modelContexts = new LocalModelContextLeaseRegistry(false)
) {
  return createNativeAgentModelProvider({
    runningInExpoGo: false,
    environment,
    loadModule,
    modelContexts,
  });
}

describe('Development Build Local Agent の統合 Matrix', () => {
  it('Model 未設定は Native Module を読まず Rules Bridge まで完走する', async () => {
    let moduleLoads = 0;
    const provider = createDevelopmentBuildProvider({}, async () => {
      moduleLoads += 1;
      return moduleWithContext(new CompletedContext('{}'));
    });

    const result = await runProvider('integration-model-absent', provider);
    const outcome = materializeAgentModelOutcome(
      INPUT,
      result.outcome.decision
    );

    expect(moduleLoads).toBe(0);
    expect(result.outcome.providerKind).toBe('rules');
    expect(result.outcome.settledBy).toBe('primary');
    expect(outcome.kind).toBe('bridge');
  });

  it('Model Load 失敗は内容を反射せず Rules Bridge へ 1 回だけ切り替える', async () => {
    let moduleLoads = 0;
    const provider = createDevelopmentBuildProvider(
      MODEL_ENVIRONMENT,
      async () => {
        moduleLoads += 1;
        throw new Error('invalid model or OOM');
      }
    );

    const result = await runProvider('integration-load-failure', provider);
    const outcome = materializeAgentModelOutcome(
      INPUT,
      result.outcome.decision
    );

    expect(moduleLoads).toBe(1);
    expect(result.outcome.switchReason).toBe('load-error');
    expect(result.outcome.settledBy).toBe('rules-fallback');
    expect(outcome.kind).toBe('bridge');
  });

  it('構造化 Local 成功は検証済み Evidence から Bridge を作り Context を解放する', async () => {
    const context = new CompletedContext(
      '{"kind":"bridge","evidenceIds":["topic:open-source"]}'
    );
    const modelContexts = new LocalModelContextLeaseRegistry(false);
    const provider = createDevelopmentBuildProvider(
      MODEL_ENVIRONMENT,
      async () => moduleWithContext(context),
      modelContexts
    );

    const result = await runProvider('integration-local-success', provider);
    const outcome = materializeAgentModelOutcome(
      INPUT,
      result.outcome.decision
    );

    expect(result.outcome.providerKind).toBe('local-agent');
    expect(result.outcome.settledBy).toBe('primary');
    expect(outcome.kind).toBe('bridge');
    expect(context.releaseCalls).toBe(1);
    expect(modelContexts.hasActiveContext()).toBe(false);
  });

  it('Streaming 中の Encounter Cancel は停止後の結果を採用せず Rules へ切り替える', async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let failCompletion: (() => void) | undefined;
    let stopCalls = 0;
    let releaseCalls = 0;
    const context: LlamaContextPort = {
      completion() {
        markStarted?.();
        return new Promise((_resolve, reject) => {
          failCompletion = () => reject(new Error('native interrupted'));
        });
      },
      async stopCompletion() {
        stopCalls += 1;
        failCompletion?.();
      },
      async release() {
        releaseCalls += 1;
      },
    };
    const provider = createDevelopmentBuildProvider(
      MODEL_ENVIRONMENT,
      async () => moduleWithContext(context)
    );
    const runner = createAgentProviderSessionRunner();
    const pending = runner.run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'integration-cancel',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });
    await started;

    expect(runner.cancel('integration-cancel')).toBe(true);
    const result = await pending;

    expect(result.outcome.switchReason).toBe('cancelled');
    expect(result.outcome.settledBy).toBe('rules-fallback');
    expect(stopCalls).toBe(1);
    expect(releaseCalls).toBe(1);
  });

  it('Context Release 失敗は共有 Lease と Native Lane を保持して削除と次 Context を止める', async () => {
    let initializations = 0;
    const modelContexts = new LocalModelContextLeaseRegistry(false);
    const context = new CompletedContext('{"kind":"no-signal"}');
    context.release = async () => {
      context.releaseCalls += 1;
      throw new Error('native release failed');
    };
    const provider = createDevelopmentBuildProvider(
      MODEL_ENVIRONMENT,
      async () => {
        initializations += 1;
        return moduleWithContext(context);
      },
      modelContexts
    );
    const first = await createAgentProviderSessionRunner().run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'integration-release-failure-first',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });
    const second = await createAgentProviderSessionRunner().run({
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'integration-release-failure-second',
      provider,
      input: { ...INPUT, deadlineAtWallClockMs: Date.now() + 10_000 },
    });

    expect(first.outcome.switchReason).toBe('load-error');
    expect(second.outcome.switchReason).toBe('load-error');
    expect(initializations).toBe(1);
    expect(modelContexts.hasActiveContext()).toBe(true);
    expect(modelContexts.tryAcquireExclusive()).toEqual({
      kind: 'busy',
      activeUse: 'model-context',
    });
  });

  it('削除 Recovery Lock 中は Context を開始せず Rules へ切り替える', async () => {
    let initializations = 0;
    const recoveryLockedContexts = new LocalModelContextLeaseRegistry();
    const provider = createDevelopmentBuildProvider(
      MODEL_ENVIRONMENT,
      async () => {
        initializations += 1;
        return moduleWithContext(new CompletedContext('{"kind":"no-signal"}'));
      },
      recoveryLockedContexts
    );

    const result = await runProvider('integration-recovery-lock', provider);

    expect(result.outcome.switchReason).toBe('load-error');
    expect(initializations).toBe(0);
  });
});
