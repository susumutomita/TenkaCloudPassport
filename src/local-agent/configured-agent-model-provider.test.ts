import { describe, expect, it } from 'bun:test';
import { LocalModelContextLeaseRegistry } from '../app/local-data-control';
import { AgentModelProviderError } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { createConfiguredLocalModelCompletionPort } from './configured-agent-model-provider';
import type {
  LlamaContextPort,
  LlamaModulePort,
} from './llama-agent-model-provider';
import { createLocalModelRequest } from './model-safety-boundary';

const REQUEST = createLocalModelRequest({
  ownerPassport: passport(['open-source']),
  encounteredPassport: passport(['open-source']),
  deadlineAtWallClockMs: 4_102_444_800_000,
});

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

describe('Native LocalModelCompletionPort の構成', () => {
  it('Model Path 未設定は Module を読まず Port を構成しない', () => {
    let loads = 0;
    const port = createConfiguredLocalModelCompletionPort(
      {},
      async () => {
        loads += 1;
        return { initLlama: async () => new NoSignalContext() };
      },
      new LocalModelContextLeaseRegistry(false)
    );

    expect(port).toBeUndefined();
    expect(loads).toBe(0);
  });

  it('Model Path 設定時は既定 Resource 値で遅延 Completion Port を返す', async () => {
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
    const port = createConfiguredLocalModelCompletionPort(
      { modelPath: 'file:///data/model.gguf' },
      async () => {
        loads += 1;
        return module;
      },
      new LocalModelContextLeaseRegistry(false)
    );

    expect(port).toBeDefined();
    expect(loads).toBe(0);
    expect(await port?.complete(REQUEST)).toEqual({ kind: 'no-signal' });
    expect(loads).toBe(1);
  });

  it('不正設定は App 起動を壊さず、実行時 Load Error Port にする', async () => {
    let loads = 0;
    const port = createConfiguredLocalModelCompletionPort(
      {
        modelPath: 'https://example.invalid/model.gguf',
        nCtx: 'not-a-number',
      },
      async () => {
        loads += 1;
        return { initLlama: async () => new NoSignalContext() };
      },
      new LocalModelContextLeaseRegistry(false)
    );

    expect(port).toBeDefined();
    await expectLoadError(async () => port?.complete(REQUEST));
    expect(loads).toBe(0);
  });
});
