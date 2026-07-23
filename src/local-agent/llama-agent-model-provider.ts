import { AgentModelProviderError } from '../domain/agent-model-provider';
import type { LocalModelConfiguration } from './local-model-configuration';
import type {
  ModelBenchmarkRecorder,
  ModelBenchmarkSession,
} from './model-benchmark';
import type {
  LocalModelCompletionPort,
  LocalModelRequest,
} from './model-safety-boundary';

export interface LlamaMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

export interface LlamaCompletionParameters {
  readonly messages: readonly LlamaMessage[];
  readonly n_predict: number;
  readonly temperature: number;
  readonly response_format: {
    readonly type: 'json_schema';
    readonly json_schema: {
      readonly strict: true;
      readonly schema: object;
    };
  };
}

export interface LlamaContextPort {
  completion(
    parameters: LlamaCompletionParameters,
    onToken: (token: unknown) => void
  ): Promise<unknown>;
  stopCompletion(): Promise<void>;
  release(): Promise<void>;
}

export interface LlamaModulePort {
  initLlama(parameters: {
    readonly model: string;
    readonly n_ctx: number;
    readonly n_gpu_layers: number;
    readonly n_parallel: number;
    readonly use_mmap: boolean;
    readonly use_mlock: boolean;
    readonly no_extra_bufts: boolean;
  }): Promise<LlamaContextPort>;
}

export type LlamaModuleLoader = () => Promise<LlamaModulePort>;

/**
 * Issue 104 Priority 2（Bonsai-ready 化、両スパイクの知見）: `llama.rn` 既定の
 * `n_parallel`（8 並列 sequence）は 1 Encounter に 1 Context しか使わないこの
 * Repo の設計（`docs/design/llama-provider-development-build.md` の Context
 * lifetime 節）には過大なため `1` に絞り、KV Cache の無駄な確保を避ける。
 * `use_mmap: true` は Model File を Page Cache 経由で参照し常駐 Memory を
 * 減らす。`use_mlock: false` は Page Out を許可し、OS の Memory 逼迫時に
 * 強制終了されるリスクを避ける。`no_extra_bufts: true` は Weight の
 * repack 用追加 Buffer を無効化し、Prompt 処理がやや遅くなる代わりに
 * 常駐 Memory を減らす（`node_modules/llama.rn` の型定義コメント参照）。
 * いずれも Model 固有ではない固定値のため `LocalModelConfiguration`
 * （Model ごとに変わる `nCtx`/`nGpuLayers`/`nPredict`）には含めない。
 */
const FIXED_CONTEXT_PARAMETERS = {
  n_parallel: 1,
  use_mmap: true,
  use_mlock: false,
  no_extra_bufts: true,
} as const;

export interface LocalModelExecutionLease {
  release(): void;
}

export interface LocalModelExecutionLeasePort {
  acquire(): LocalModelExecutionLease;
}

function completionParameters(
  request: LocalModelRequest,
  configuration: LocalModelConfiguration
): LlamaCompletionParameters {
  return {
    messages: request.messages.map(({ role, content }) => ({ role, content })),
    n_predict: configuration.nPredict,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        strict: true,
        schema: request.responseFormat.schema,
      },
    },
  };
}

function parsedCompletionResult(result: unknown): unknown {
  if (
    typeof result !== 'object' ||
    result === null ||
    !Object.hasOwn(result, 'text') ||
    typeof Reflect.get(result, 'text') !== 'string'
  ) {
    throw new AgentModelProviderError(
      'SCHEMA_ERROR',
      'Local Model の Completion Result 形式が不正です。'
    );
  }
  try {
    return JSON.parse(Reflect.get(result, 'text'));
  } catch {
    throw new AgentModelProviderError(
      'SCHEMA_ERROR',
      'Local Model の構造化 Output を解析できませんでした。'
    );
  }
}

function cancelledError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'CANCELLED',
    'Local Model の実行は取り消されました。'
  );
}

function loadError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'LOAD_ERROR',
    'Local Model の Native 実行を完了できませんでした。'
  );
}

function quarantinedLoadError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'LOAD_ERROR',
    'Local Model の Native 実行を完了できませんでした。',
    { nativeLaneQuarantined: true }
  );
}

function normalizeNativeError(error: unknown): AgentModelProviderError {
  return error instanceof AgentModelProviderError ? error : loadError();
}

async function initializeContext(
  configuration: LocalModelConfiguration,
  loadModule: LlamaModuleLoader,
  signal: AbortSignal | undefined
): Promise<LlamaContextPort> {
  if (signal?.aborted) throw cancelledError();
  try {
    const module = await loadModule();
    if (signal?.aborted) throw cancelledError();
    return await module.initLlama({
      model: configuration.modelPath,
      n_ctx: configuration.nCtx,
      n_gpu_layers: configuration.nGpuLayers,
      ...FIXED_CONTEXT_PARAMETERS,
    });
  } catch (error: unknown) {
    throw normalizeNativeError(error);
  }
}

interface CompletionCancellation {
  readonly onToken: () => void;
  readonly remove: () => void;
  readonly waitForStop: () => Promise<void>;
}

function observeCompletionCancellation(
  context: LlamaContextPort,
  signal: AbortSignal | undefined
): CompletionCancellation {
  let stopPromise: Promise<void> | undefined;
  const requestStop = (): void => {
    stopPromise ??= Promise.resolve().then(() => context.stopCompletion());
  };
  signal?.addEventListener('abort', requestStop, { once: true });
  return {
    onToken() {
      if (signal?.aborted) requestStop();
    },
    remove() {
      signal?.removeEventListener('abort', requestStop);
    },
    async waitForStop() {
      if (!stopPromise) return;
      try {
        await stopPromise;
      } catch {
        // Stop 自体が失敗しても、Abort 済み Completion は CANCELLED のまま Context 解放へ進める。
        return;
      }
    },
  };
}

async function completeContext(
  context: LlamaContextPort,
  request: LocalModelRequest,
  configuration: LocalModelConfiguration,
  signal: AbortSignal | undefined,
  benchmark: ModelBenchmarkSession | null
): Promise<unknown> {
  if (signal?.aborted) throw cancelledError();
  const cancellation = observeCompletionCancellation(context, signal);
  try {
    const result = await context.completion(
      completionParameters(request, configuration),
      () => {
        benchmark?.markFirstToken();
        cancellation.onToken();
      }
    );
    await cancellation.waitForStop();
    if (signal?.aborted) throw cancelledError();
    return parsedCompletionResult(result);
  } catch (error: unknown) {
    await cancellation.waitForStop();
    if (signal?.aborted) throw cancelledError();
    throw normalizeNativeError(error);
  } finally {
    cancellation.remove();
  }
}

type CompletionAttempt =
  | { readonly kind: 'success'; readonly output: unknown }
  | { readonly kind: 'failure'; readonly error: AgentModelProviderError };

async function captureCompletion(
  context: LlamaContextPort,
  request: LocalModelRequest,
  configuration: LocalModelConfiguration,
  signal: AbortSignal | undefined,
  benchmark: ModelBenchmarkSession | null
): Promise<CompletionAttempt> {
  try {
    return {
      kind: 'success',
      output: await completeContext(
        context,
        request,
        configuration,
        signal,
        benchmark
      ),
    };
  } catch (error: unknown) {
    return { kind: 'failure', error: normalizeNativeError(error) };
  }
}

async function startBenchmark(
  recorder: ModelBenchmarkRecorder | undefined
): Promise<ModelBenchmarkSession | null> {
  if (!recorder) return null;
  try {
    return await recorder.start();
  } catch {
    return null;
  }
}

async function finishBenchmark(
  benchmark: ModelBenchmarkSession | null,
  outcome: 'success' | 'cancelled' | 'failed'
): Promise<void> {
  try {
    await benchmark?.finish(outcome);
  } catch {
    // 内容を持たない計測の失敗で、推論結果や型付き Provider 失敗を上書きしない。
  }
}

async function executeLlamaProvider(
  request: LocalModelRequest,
  configuration: LocalModelConfiguration,
  loadModule: LlamaModuleLoader,
  executionLeases: LocalModelExecutionLeasePort,
  signal: AbortSignal | undefined,
  recorder: ModelBenchmarkRecorder | undefined
): Promise<unknown> {
  const benchmark = await startBenchmark(recorder);
  let lease: LocalModelExecutionLease;
  try {
    lease = executionLeases.acquire();
  } catch {
    void finishBenchmark(benchmark, 'failed');
    throw loadError();
  }
  let quarantined = false;
  try {
    const context = await initializeContext(configuration, loadModule, signal);
    benchmark?.markLoaded();
    const completion = await captureCompletion(
      context,
      request,
      configuration,
      signal,
      benchmark
    );
    if (completion.kind === 'success') benchmark?.markCompletion();
    try {
      await context.release();
    } catch {
      // Native Context の解放を証明できないため lease を保持し、Process 再起動まで削除と次 Context を止める。
      quarantined = true;
      throw quarantinedLoadError();
    }
    lease.release();
    if (completion.kind === 'failure') throw completion.error;
    void finishBenchmark(benchmark, 'success');
    return completion.output;
  } catch (error: unknown) {
    if (!quarantined) lease.release();
    const normalized = normalizeNativeError(error);
    void finishBenchmark(
      benchmark,
      normalized.code === 'CANCELLED' ? 'cancelled' : 'failed'
    );
    throw normalized;
  }
}

/**
 * 1 Encounter に 1 Context を作る Native Adapter。Native 値は unknown のまま JSON 境界へ渡し、
 * 共通 Evidence Validator は `attemptProvider` が必ず適用する。
 */
export function createLlamaCompletionPort(
  configuration: LocalModelConfiguration,
  loadModule: LlamaModuleLoader,
  executionLeases: LocalModelExecutionLeasePort,
  recorder?: ModelBenchmarkRecorder
): LocalModelCompletionPort {
  return {
    complete(request, options) {
      return executeLlamaProvider(
        request,
        configuration,
        loadModule,
        executionLeases,
        options?.signal,
        recorder
      );
    },
  };
}
