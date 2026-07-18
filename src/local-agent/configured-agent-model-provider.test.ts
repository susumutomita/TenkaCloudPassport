import { describe, expect, it } from 'bun:test';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { AgentModelProviderError } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { createConfiguredNativeAgentModelProvider } from './configured-agent-model-provider';
import type {
  LlamaContextPort,
  LlamaModulePort,
} from './llama-agent-model-provider';

const INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source']),
  encounteredPassport: passport(['open-source']),
  deadlineAtWallClockMs: 4_102_444_800_000,
};

class NoSignalContext implements LlamaContextPort {
  async completion(): Promise<unknown> {
    return { text: '{"kind":"no-signal"}' };
  }

  async stopCompletion(): Promise<void> {
    return;
  }

  async release(): Promise<void> {
    return;
  }
}

async function expectLoadError(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    throw new Error('AgentModelProviderError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AgentModelProviderError);
    if (error instanceof AgentModelProviderError) {
      expect(error.code).toBe('LOAD_ERROR');
    }
  }
}

describe('Native AgentModelProvider Composition', () => {
  it('Model Path 未設定は Module を読まず Rules Provider を返す', () => {
    let loads = 0;
    const provider = createConfiguredNativeAgentModelProvider({}, async () => {
      loads += 1;
      return { initLlama: async () => new NoSignalContext() };
    });

    expect(provider.kind).toBe('rules');
    expect(provider.provide(INPUT)).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });
    expect(loads).toBe(0);
  });

  it('Model Path 設定時は既定 Resource 値で遅延 Local Provider を返す', async () => {
    let loads = 0;
    const module: LlamaModulePort = {
      async initLlama(parameters) {
        expect(parameters).toEqual({
          model: 'file:///data/model.gguf',
          n_ctx: 2048,
          n_gpu_layers: 0,
        });
        return new NoSignalContext();
      },
    };
    const provider = createConfiguredNativeAgentModelProvider(
      { modelPath: 'file:///data/model.gguf' },
      async () => {
        loads += 1;
        return module;
      }
    );

    expect(provider.kind).toBe('local-agent');
    expect(loads).toBe(0);
    expect(await provider.provide(INPUT)).toEqual({ kind: 'no-signal' });
    expect(loads).toBe(1);
  });

  it('不正設定は App 起動を壊さず、実行時 Load Error Provider にする', async () => {
    let loads = 0;
    const provider = createConfiguredNativeAgentModelProvider(
      {
        modelPath: 'https://example.invalid/model.gguf',
        nCtx: 'not-a-number',
      },
      async () => {
        loads += 1;
        return { initLlama: async () => new NoSignalContext() };
      }
    );

    expect(provider.kind).toBe('local-agent');
    await expectLoadError(async () => provider.provide(INPUT));
    expect(loads).toBe(0);
  });
});
