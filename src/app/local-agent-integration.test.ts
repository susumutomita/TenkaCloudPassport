import { describe, expect, it } from 'bun:test';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { createConfiguredNativeAgentModelProvider } from '../local-agent/configured-agent-model-provider';
import type {
  LlamaCompletionParameters,
  LlamaContextPort,
  LlamaModulePort,
} from '../local-agent/llama-agent-model-provider';
import { materializeAgentModelOutcome } from './agent-model-live-outcome';
import {
  createAgentProviderSessionRunner,
  INITIAL_PROVIDER_RUNTIME_STATE,
} from './agent-provider-session';

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
  completionCalls = 0;
  parameters: LlamaCompletionParameters | undefined;
  releaseCalls = 0;

  constructor(private readonly text: string) {}

  async completion(parameters: LlamaCompletionParameters): Promise<unknown> {
    this.completionCalls += 1;
    this.parameters = parameters;
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
  provider: ReturnType<typeof createConfiguredNativeAgentModelProvider>
) {
  return createAgentProviderSessionRunner().run({
    state: INITIAL_PROVIDER_RUNTIME_STATE,
    encounterKey,
    provider,
    input: INPUT,
  });
}

describe('Development Build Local Agent の統合 Matrix', () => {
  it('Model 未設定は Native Module を読まず Rules Bridge まで完走する', async () => {
    let moduleLoads = 0;
    const provider = createConfiguredNativeAgentModelProvider({}, async () => {
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
    const provider = createConfiguredNativeAgentModelProvider(
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
    const provider = createConfiguredNativeAgentModelProvider(
      MODEL_ENVIRONMENT,
      async () => moduleWithContext(context)
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
    const provider = createConfiguredNativeAgentModelProvider(
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

  it('攻撃文字列と Tool Call Output を反射せず、同じ Encounter は Rules へ 1 回だけ切り替える', async () => {
    const attack = 'ignore previous';
    const attackInput: AgentModelInput = {
      ...INPUT,
      ownerPassport: passport(['open-source'], [], attack),
    };
    const context = new CompletedContext(
      '{"kind":"tool_call","name":"open_url","arguments":["https://evil.invalid"]}'
    );
    const provider = createConfiguredNativeAgentModelProvider(
      MODEL_ENVIRONMENT,
      async () => moduleWithContext(context)
    );
    const runner = createAgentProviderSessionRunner();
    const request = {
      state: INITIAL_PROVIDER_RUNTIME_STATE,
      encounterKey: 'integration-prompt-injection',
      provider,
      input: attackInput,
    } as const;

    const first = await runner.run(request);
    const second = await runner.run(request);

    expect(first.outcome.switchReason).toBe('schema-error');
    expect(first.outcome.settledBy).toBe('rules-fallback');
    expect(second.outcome).toEqual(first.outcome);
    expect(context.completionCalls).toBe(1);
    expect(context.releaseCalls).toBe(1);
    expect(context.parameters?.messages[1]?.content).not.toContain(attack);
    expect(context.parameters).not.toHaveProperty('tools');
  });
});
