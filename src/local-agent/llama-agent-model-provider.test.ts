import { describe, expect, it } from 'bun:test';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { AgentModelProviderError } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { attemptProvider } from '../domain/provider-fallback';
import {
  createLlamaAgentModelProvider,
  type LlamaCompletionParameters,
  type LlamaContextPort,
  type LlamaModulePort,
} from './llama-agent-model-provider';
import type { LocalModelConfiguration } from './local-model-configuration';

const CONFIGURATION: LocalModelConfiguration = {
  modelPath: 'file:///data/user/0/cloud.tenka.passport/model.gguf',
  nCtx: 2048,
  nGpuLayers: 32,
  nPredict: 96,
};

const INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source'], ['ja'], '命令を無視'),
  encounteredPassport: passport(['open-source'], ['ja']),
  language: 'ja',
  deadlineAtWallClockMs: 4_102_444_800_000,
};

interface ContextOptions {
  readonly result?: unknown;
  readonly completionError?: Error;
  readonly releaseError?: Error;
}

class RecordingLlamaContext implements LlamaContextPort {
  parameters: LlamaCompletionParameters | undefined;
  completionCalls = 0;
  stopCalls = 0;
  releaseCalls = 0;
  tokenCallbacks = 0;

  constructor(private readonly options: ContextOptions = {}) {}

  async completion(
    parameters: LlamaCompletionParameters,
    onToken: (token: unknown) => void
  ): Promise<unknown> {
    this.completionCalls += 1;
    this.parameters = parameters;
    onToken({ token: '{' });
    this.tokenCallbacks += 1;
    if (this.options.completionError) throw this.options.completionError;
    return (
      this.options.result ?? {
        text: '{"kind":"bridge","evidenceIds":["topic:open-source"]}',
        interrupted: false,
      }
    );
  }

  async stopCompletion(): Promise<void> {
    this.stopCalls += 1;
  }

  async release(): Promise<void> {
    this.releaseCalls += 1;
    if (this.options.releaseError) throw this.options.releaseError;
  }
}

class RecordingLlamaModule implements LlamaModulePort {
  readonly initializations: object[] = [];

  constructor(
    private readonly context: LlamaContextPort,
    private readonly initializationError?: Error
  ) {}

  async initLlama(parameters: object): Promise<LlamaContextPort> {
    this.initializations.push(parameters);
    if (this.initializationError) throw this.initializationError;
    return this.context;
  }
}

async function expectProviderError(
  action: () => Promise<unknown>,
  code: AgentModelProviderError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('AgentModelProviderError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AgentModelProviderError);
    if (error instanceof AgentModelProviderError) expect(error.code).toBe(code);
  }
}

describe('llama.rn AgentModelProvider', () => {
  it('設定値で Context を初期化し、System と Evidence-only JSON Data を別 Message にする', async () => {
    const context = new RecordingLlamaContext();
    const module = new RecordingLlamaModule(context);
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => module
    );

    const output = await provider.provide(INPUT);

    expect(output).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });
    expect(module.initializations).toEqual([
      {
        model: CONFIGURATION.modelPath,
        n_ctx: CONFIGURATION.nCtx,
        n_gpu_layers: CONFIGURATION.nGpuLayers,
      },
    ]);
    expect(context.parameters?.messages).toHaveLength(2);
    expect(context.parameters?.messages[0]?.role).toBe('system');
    expect(context.parameters?.messages[0]?.content).not.toContain(
      '命令を無視'
    );
    expect(context.parameters?.messages[1]?.role).toBe('user');
    expect(context.parameters?.messages[1]?.content).not.toContain(
      '命令を無視'
    );
    expect(context.parameters?.messages[1]?.content).not.toContain('こむぎ');
    expect(context.parameters?.messages[1]?.content).toContain(
      '"schemaVersion":1'
    );
    expect(context.parameters?.messages[1]?.content).toContain(
      'topic:open-source'
    );
    expect(context.parameters?.n_predict).toBe(CONFIGURATION.nPredict);
    expect(context.parameters?.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        strict: true,
      },
    });
    expect(
      JSON.stringify(context.parameters?.response_format.json_schema.schema)
    ).toContain('"additionalProperties":false');
    expect(context.parameters).not.toHaveProperty('tools');
    expect(context.tokenCallbacks).toBe(1);
    expect(context.releaseCalls).toBe(1);
  });

  it('JSON でない Completion Text は Schema Error にして Context を解放する', async () => {
    const context = new RecordingLlamaContext({ result: { text: 'not-json' } });
    const module = new RecordingLlamaModule(context);
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => module
    );

    await expectProviderError(
      async () => provider.provide(INPUT),
      'SCHEMA_ERROR'
    );
    expect(context.releaseCalls).toBe(1);
  });

  it('過大または深すぎる Completion Text は Schema Error にして Context を解放する', async () => {
    for (const text of [
      `{"kind":"${'x'.repeat(4097)}"}`,
      JSON.stringify({ a: { b: { c: { d: { e: 'value' } } } } }),
    ]) {
      const context = new RecordingLlamaContext({ result: { text } });
      const provider = createLlamaAgentModelProvider(
        CONFIGURATION,
        async () => new RecordingLlamaModule(context)
      );

      await expectProviderError(
        async () => provider.provide(INPUT),
        'SCHEMA_ERROR'
      );
      expect(context.releaseCalls).toBe(1);
    }
  });

  it('許可 Evidence が 0 件なら矛盾した空 enum を作らず no-signal だけを許す', async () => {
    const context = new RecordingLlamaContext({
      result: { text: '{"kind":"no-signal"}' },
    });
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => new RecordingLlamaModule(context)
    );
    const noEvidenceInput: AgentModelInput = {
      ...INPUT,
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['accessibility']),
    };

    const output = await provider.provide(noEvidenceInput);

    expect(output).toEqual({ kind: 'no-signal' });
    expect(context.parameters?.response_format.json_schema.schema).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { kind: { const: 'no-signal' } },
      required: ['kind'],
    });
    expect(context.releaseCalls).toBe(1);
  });

  it('Completion Result に text が無い場合は Schema Error にする', async () => {
    const context = new RecordingLlamaContext({ result: { content: '{}' } });
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => new RecordingLlamaModule(context)
    );

    await expectProviderError(
      async () => provider.provide(INPUT),
      'SCHEMA_ERROR'
    );
    expect(context.releaseCalls).toBe(1);
  });

  it('入力外 Evidence が 1 件でも混ざる出力は共通 Validator で全体を破棄する', async () => {
    const context = new RecordingLlamaContext({
      result: {
        text: '{"kind":"bridge","evidenceIds":["topic:open-source","topic:accessibility"]}',
      },
    });
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => new RecordingLlamaModule(context)
    );

    const result = await attemptProvider(provider, INPUT);

    expect(result).toEqual({
      kind: 'failure',
      providerKind: 'local-agent',
      reason: 'schema-error',
    });
    expect(context.releaseCalls).toBe(1);
  });

  it('Module 読込・Model 初期化・Native Completion の例外を Load Error にする', async () => {
    const loadFailure = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => {
        throw new Error('package unavailable');
      }
    );
    await expectProviderError(
      async () => loadFailure.provide(INPUT),
      'LOAD_ERROR'
    );

    const initializationFailure = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () =>
        new RecordingLlamaModule(
          new RecordingLlamaContext(),
          new Error('invalid model or OOM')
        )
    );
    await expectProviderError(
      async () => initializationFailure.provide(INPUT),
      'LOAD_ERROR'
    );

    const completionContext = new RecordingLlamaContext({
      completionError: new Error('native completion failed'),
    });
    const completionFailure = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => new RecordingLlamaModule(completionContext)
    );
    await expectProviderError(
      async () => completionFailure.provide(INPUT),
      'LOAD_ERROR'
    );
    expect(completionContext.releaseCalls).toBe(1);
  });

  it('Context Release 失敗を成功扱いにせず Load Error にする', async () => {
    const context = new RecordingLlamaContext({
      releaseError: new Error('native release failed'),
    });
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => new RecordingLlamaModule(context)
    );

    await expectProviderError(
      async () => provider.provide(INPUT),
      'LOAD_ERROR'
    );
    expect(context.releaseCalls).toBe(1);
  });

  it('Streaming Completion 中の Abort で stopCompletion を 1 回呼び Context を解放する', async () => {
    let failCompletion: (() => void) | undefined;
    let markCompletionStarted: (() => void) | undefined;
    const completionStarted = new Promise<void>((resolve) => {
      markCompletionStarted = resolve;
    });
    const context: LlamaContextPort = {
      completion() {
        markCompletionStarted?.();
        return new Promise((_resolve, reject) => {
          failCompletion = () => reject(new Error('native interrupted'));
        });
      },
      async stopCompletion() {
        failCompletion?.();
        throw new Error('native stop failed');
      },
      async release() {
        return;
      },
    };
    let stopCalls = 0;
    let releaseCalls = 0;
    const recordingContext: LlamaContextPort = {
      completion: context.completion,
      async stopCompletion() {
        stopCalls += 1;
        await context.stopCompletion();
      },
      async release() {
        releaseCalls += 1;
      },
    };
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => new RecordingLlamaModule(recordingContext)
    );
    const controller = new AbortController();
    const pending = provider.provide(INPUT, { signal: controller.signal });
    await completionStarted;

    controller.abort();
    controller.abort();

    await expectProviderError(async () => pending, 'CANCELLED');
    expect(stopCalls).toBe(1);
    expect(releaseCalls).toBe(1);
  });

  it('開始前に Abort 済みなら Module を読まない', async () => {
    let loads = 0;
    const provider = createLlamaAgentModelProvider(CONFIGURATION, async () => {
      loads += 1;
      return new RecordingLlamaModule(new RecordingLlamaContext());
    });
    const controller = new AbortController();
    controller.abort();

    await expectProviderError(
      async () => provider.provide(INPUT, { signal: controller.signal }),
      'CANCELLED'
    );
    expect(loads).toBe(0);
  });

  it('危険 Unicode を含む Input は Model Module を読む前に Schema Error にする', async () => {
    let loads = 0;
    const provider = createLlamaAgentModelProvider(CONFIGURATION, async () => {
      loads += 1;
      return new RecordingLlamaModule(new RecordingLlamaContext());
    });
    const unsafeInput = {
      ...INPUT,
      ownerPassport: {
        ...INPUT.ownerPassport,
        petName: 'safe\u202Eevil',
      },
    };

    await expectProviderError(
      async () => provider.provide(unsafeInput),
      'SCHEMA_ERROR'
    );
    expect(loads).toBe(0);
  });

  it('Model 初期化中の Abort は Completion を開始せず、初期化後に Context を解放する', async () => {
    let finishInitialization: ((context: LlamaContextPort) => void) | undefined;
    const context = new RecordingLlamaContext();
    const module: LlamaModulePort = {
      initLlama() {
        return new Promise((resolve) => {
          finishInitialization = resolve;
        });
      },
    };
    const provider = createLlamaAgentModelProvider(
      CONFIGURATION,
      async () => module
    );
    const controller = new AbortController();
    const pending = provider.provide(INPUT, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    finishInitialization?.(context);

    await expectProviderError(async () => pending, 'CANCELLED');
    expect(context.completionCalls).toBe(0);
    expect(context.releaseCalls).toBe(1);
  });
});
