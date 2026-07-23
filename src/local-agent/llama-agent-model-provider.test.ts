import { describe, expect, it } from 'bun:test';
import { LocalModelContextLeaseRegistry } from '../app/local-data-control';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { AgentModelProviderError } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { attemptProvider } from '../domain/provider-fallback';
import {
  createLlamaCompletionPort,
  type LlamaCompletionParameters,
  type LlamaContextPort,
  type LlamaModulePort,
} from './llama-agent-model-provider';
import type { LocalModelConfiguration } from './local-model-configuration';
import type {
  ModelBenchmarkRecorder,
  ModelBenchmarkSession,
} from './model-benchmark';
import {
  createLocalModelRequest,
  createSafetyBoundLocalModelProvider,
} from './model-safety-boundary';

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
const REQUEST = createLocalModelRequest(INPUT);

function llamaPort(
  loadModule: () => Promise<LlamaModulePort>,
  executionLeases = new LocalModelContextLeaseRegistry(false),
  recorder?: ModelBenchmarkRecorder
) {
  return createLlamaCompletionPort(
    CONFIGURATION,
    loadModule,
    executionLeases,
    recorder
  );
}

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
): Promise<AgentModelProviderError> {
  try {
    await action();
    throw new Error('AgentModelProviderError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AgentModelProviderError);
    if (!(error instanceof AgentModelProviderError)) throw error;
    expect(error.code).toBe(code);
    return error;
  }
}

describe('llama.rn LocalModelCompletionPort', () => {
  it('Benchmark へ内容を渡さず Load・First Token・成功の順だけを通知する', async () => {
    const events: string[] = [];
    const session: ModelBenchmarkSession = {
      markLoaded() {
        events.push('loaded');
      },
      markFirstToken() {
        events.push('first-token');
      },
      markCompletion() {
        events.push('completion');
      },
      async finish(outcome) {
        events.push(`finish:${outcome}`);
      },
    };
    const recorder: ModelBenchmarkRecorder = {
      async start() {
        events.push('start');
        return session;
      },
    };
    const port = llamaPort(
      async () => {
        events.push('load-module');
        return new RecordingLlamaModule(new RecordingLlamaContext());
      },
      new LocalModelContextLeaseRegistry(false),
      recorder
    );

    await port.complete(REQUEST);

    expect(events).toEqual([
      'start',
      'load-module',
      'loaded',
      'first-token',
      'completion',
      'finish:success',
    ]);
  });

  it('Native release 後の Benchmark 保存待ちは Provider teardown を止めない', async () => {
    let markFinishStarted: (() => void) | undefined;
    const finishStarted = new Promise<void>((resolve) => {
      markFinishStarted = resolve;
    });
    let releaseFinish: (() => void) | undefined;
    const finishPending = new Promise<void>((resolve) => {
      releaseFinish = resolve;
    });
    const port = llamaPort(
      async () => new RecordingLlamaModule(new RecordingLlamaContext()),
      new LocalModelContextLeaseRegistry(false),
      {
        async start() {
          return {
            markLoaded: () => undefined,
            markFirstToken: () => undefined,
            markCompletion: () => undefined,
            async finish() {
              markFinishStarted?.();
              await finishPending;
            },
          };
        },
      }
    );

    const completion = Promise.resolve(port.complete(REQUEST));
    await finishStarted;
    const settledBeforeReport = await Promise.race([
      completion.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 25)),
    ]);
    releaseFinish?.();
    await completion;

    expect(settledBeforeReport).toBe(true);
  });

  it('Benchmark は Provider の cancelled / failed を区別する', async () => {
    const outcomes: string[] = [];
    const recorder: ModelBenchmarkRecorder = {
      async start() {
        return {
          markLoaded: () => undefined,
          markFirstToken: () => undefined,
          markCompletion: () => undefined,
          async finish(outcome) {
            outcomes.push(outcome);
          },
        };
      },
    };
    const failed = llamaPort(
      async () => {
        throw new Error('load failed');
      },
      new LocalModelContextLeaseRegistry(false),
      recorder
    );
    await expectProviderError(
      async () => failed.complete(REQUEST),
      'LOAD_ERROR'
    );

    const cancelled = llamaPort(
      async () => new RecordingLlamaModule(new RecordingLlamaContext()),
      new LocalModelContextLeaseRegistry(false),
      recorder
    );
    const controller = new AbortController();
    controller.abort();
    await expectProviderError(
      async () => cancelled.complete(REQUEST, { signal: controller.signal }),
      'CANCELLED'
    );
    expect(outcomes).toEqual(['failed', 'cancelled']);
  });

  it('Benchmark start / finish の失敗は推論結果を上書きしない', async () => {
    const startFailure = llamaPort(
      async () => new RecordingLlamaModule(new RecordingLlamaContext()),
      new LocalModelContextLeaseRegistry(false),
      {
        async start() {
          throw new Error('benchmark unavailable');
        },
      }
    );
    expect(await startFailure.complete(REQUEST)).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });

    const finishFailure = llamaPort(
      async () => new RecordingLlamaModule(new RecordingLlamaContext()),
      new LocalModelContextLeaseRegistry(false),
      {
        async start() {
          return {
            markLoaded: () => undefined,
            markFirstToken: () => undefined,
            markCompletion: () => undefined,
            async finish() {
              throw new Error('benchmark write failed');
            },
          };
        },
      }
    );
    expect(await finishFailure.complete(REQUEST)).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });
  });

  it('設定値で Context を初期化し、Safety Boundary の canonical Evidence Request だけを渡す', async () => {
    const context = new RecordingLlamaContext();
    const module = new RecordingLlamaModule(context);
    const port = llamaPort(async () => module);

    const output = await port.complete(REQUEST);

    expect(output).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });
    expect(module.initializations).toEqual([
      {
        model: CONFIGURATION.modelPath,
        n_ctx: CONFIGURATION.nCtx,
        n_gpu_layers: CONFIGURATION.nGpuLayers,
        n_parallel: 1,
        use_mmap: true,
        use_mlock: false,
        no_extra_bufts: true,
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
    const port = llamaPort(async () => module);

    await expectProviderError(
      async () => port.complete(REQUEST),
      'SCHEMA_ERROR'
    );
    expect(context.releaseCalls).toBe(1);
  });

  it('許可 Evidence が 0 件なら矛盾した空 enum を作らず no-signal だけを許す', async () => {
    const context = new RecordingLlamaContext({
      result: { text: '{"kind":"no-signal"}' },
    });
    const port = llamaPort(async () => new RecordingLlamaModule(context));
    const noEvidenceInput: AgentModelInput = {
      ...INPUT,
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['accessibility']),
    };

    const output = await port.complete(
      createLocalModelRequest(noEvidenceInput)
    );

    expect(output).toEqual({ kind: 'no-signal' });
    expect(context.parameters?.response_format.json_schema.schema).toEqual(
      createLocalModelRequest(noEvidenceInput).responseFormat.schema
    );
    expect(context.releaseCalls).toBe(1);
  });

  it('Completion Result に text が無い場合は Schema Error にする', async () => {
    const context = new RecordingLlamaContext({ result: { content: '{}' } });
    const port = llamaPort(async () => new RecordingLlamaModule(context));

    await expectProviderError(
      async () => port.complete(REQUEST),
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
    const provider = createSafetyBoundLocalModelProvider(
      llamaPort(async () => new RecordingLlamaModule(context))
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
    const loadFailure = llamaPort(async () => {
      throw new Error('package unavailable');
    });
    await expectProviderError(
      async () => loadFailure.complete(REQUEST),
      'LOAD_ERROR'
    );

    const initializationFailure = llamaPort(
      async () =>
        new RecordingLlamaModule(
          new RecordingLlamaContext(),
          new Error('invalid model or OOM')
        )
    );
    await expectProviderError(
      async () => initializationFailure.complete(REQUEST),
      'LOAD_ERROR'
    );

    const completionContext = new RecordingLlamaContext({
      completionError: new Error('native completion failed'),
    });
    const completionFailure = llamaPort(
      async () => new RecordingLlamaModule(completionContext)
    );
    await expectProviderError(
      async () => completionFailure.complete(REQUEST),
      'LOAD_ERROR'
    );
    expect(completionContext.releaseCalls).toBe(1);
  });

  it('Context Release 失敗を成功扱いにせず Load Error にする', async () => {
    const context = new RecordingLlamaContext({
      releaseError: new Error('native release failed'),
    });
    const executionLeases = new LocalModelContextLeaseRegistry(false);
    const port = llamaPort(
      async () => new RecordingLlamaModule(context),
      executionLeases
    );

    const error = await expectProviderError(
      async () => port.complete(REQUEST),
      'LOAD_ERROR'
    );
    expect(context.releaseCalls).toBe(1);
    expect(executionLeases.hasActiveContext()).toBe(true);
    expect(error.nativeLaneQuarantined).toBe(true);
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
    const port = llamaPort(
      async () => new RecordingLlamaModule(recordingContext)
    );
    const controller = new AbortController();
    const pending = port.complete(REQUEST, { signal: controller.signal });
    await completionStarted;

    controller.abort();
    controller.abort();

    await expectProviderError(async () => pending, 'CANCELLED');
    expect(stopCalls).toBe(1);
    expect(releaseCalls).toBe(1);
  });

  it('開始前に Abort 済みなら Module を読まない', async () => {
    let loads = 0;
    const port = llamaPort(async () => {
      loads += 1;
      return new RecordingLlamaModule(new RecordingLlamaContext());
    });
    const controller = new AbortController();
    controller.abort();

    await expectProviderError(
      async () => port.complete(REQUEST, { signal: controller.signal }),
      'CANCELLED'
    );
    expect(loads).toBe(0);
  });

  it('Model 初期化中の Abort は Completion を開始せず、初期化後に Context を解放する', async () => {
    let finishInitialization: ((context: LlamaContextPort) => void) | undefined;
    let markInitializationStarted: (() => void) | undefined;
    const initializationStarted = new Promise<void>((resolve) => {
      markInitializationStarted = resolve;
    });
    const context = new RecordingLlamaContext();
    const module: LlamaModulePort = {
      initLlama() {
        markInitializationStarted?.();
        return new Promise((resolve) => {
          finishInitialization = resolve;
        });
      },
    };
    const port = llamaPort(async () => module);
    const controller = new AbortController();
    const pending = port.complete(REQUEST, { signal: controller.signal });
    await initializationStarted;
    controller.abort();
    finishInitialization?.(context);

    await expectProviderError(async () => pending, 'CANCELLED');
    expect(context.completionCalls).toBe(0);
    expect(context.releaseCalls).toBe(1);
  });
});
