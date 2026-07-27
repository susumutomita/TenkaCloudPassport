import {
  AgentModelProviderError,
  type AgentModelProviderOptions,
} from '../domain/agent-model-provider';
import type {
  ConversationExampleCompletionPort,
  ConversationExampleSession,
  ConversationExampleTurnModelRequest,
} from './conversation-example-generator';
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
  /**
   * Issue 152（シミュレーター e2e で観測）: chat template の適用が assistant
   * ヘッダ無しで終わると、モデルが '<|im_start|>assistant' を出力の先頭に
   * 自分で書き、構造化 Output の JSON 解析が壊れる。生成プロンプトを
   * ヘッダ付きで終わらせることを llama.rn へ明示する。
   */
  readonly add_generation_prompt: true;
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

type LlamaModelRequest =
  | LocalModelRequest
  | ConversationExampleTurnModelRequest;

function completionParameters(
  request: LlamaModelRequest,
  configuration: LocalModelConfiguration
): LlamaCompletionParameters {
  const generation = 'generation' in request ? request.generation : undefined;
  return {
    messages: request.messages.map(({ role, content }) => ({ role, content })),
    n_predict: generation?.nPredict ?? configuration.nPredict,
    temperature: generation?.temperature ?? 0,
    add_generation_prompt: true,
    response_format: {
      type: 'json_schema',
      json_schema: {
        strict: true,
        schema: request.responseFormat.schema,
      },
    },
  };
}

/**
 * Issue 152（シミュレーター e2e で観測した実出力）: chat template の適用が
 * assistant ヘッダ無しで終わった場合、モデルは正しい JSON の前に
 * '<|im_start|>assistant' を、末尾に '<|im_end|>' を自分で書くことがある。
 * 既知のテンプレート痕跡（この 2 つだけ）を剥がしてから strict に解析する。
 * それ以外の前後テキスト（自由文・説明など）は従来どおり JSON.parse が失敗し
 * SCHEMA_ERROR に倒れるため、fail-closed の性質は変わらない。
 */
const CHAT_TEMPLATE_HEADER_PATTERN = /^\s*<\|im_start\|>assistant\s*/;
const CHAT_TEMPLATE_FOOTER_PATTERN = /\s*<\|im_end\|>\s*$/;

function completionTextWithoutChatTemplateArtifacts(text: string): string {
  return text
    .replace(CHAT_TEMPLATE_HEADER_PATTERN, '')
    .replace(CHAT_TEMPLATE_FOOTER_PATTERN, '');
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
    return JSON.parse(
      completionTextWithoutChatTemplateArtifacts(Reflect.get(result, 'text'))
    );
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
  request: LlamaModelRequest,
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
  request: LlamaModelRequest,
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

/**
 * `executeLlamaProvider` と `beginConversationExampleSession` の両方が使う
 * lease 取得の失敗経路（Benchmark を 'failed' で終え、型付き LOAD_ERROR にする）。
 * `/simplify` 指摘（reuse・efficiency・altitude の 3 視点が同一箇所を指摘）で
 * 重複を解消するために抽出した。
 */
function acquireLeaseOrLoadError(
  executionLeases: LocalModelExecutionLeasePort,
  benchmark: ModelBenchmarkSession | null
): LocalModelExecutionLease {
  try {
    return executionLeases.acquire();
  } catch {
    void finishBenchmark(benchmark, 'failed');
    throw loadError();
  }
}

/**
 * Native 由来の error を型付き `AgentModelProviderError` へ正規化し、Benchmark を
 * CANCELLED か失敗かに応じて終える。呼び出し元は正規化後の error を必ず throw する。
 */
function normalizeAndFailBenchmark(
  error: unknown,
  benchmark: ModelBenchmarkSession | null
): AgentModelProviderError {
  const normalized = normalizeNativeError(error);
  void finishBenchmark(
    benchmark,
    normalized.code === 'CANCELLED' ? 'cancelled' : 'failed'
  );
  return normalized;
}

async function executeLlamaProvider(
  request: LlamaModelRequest,
  configuration: LocalModelConfiguration,
  loadModule: LlamaModuleLoader,
  executionLeases: LocalModelExecutionLeasePort,
  signal: AbortSignal | undefined,
  recorder: ModelBenchmarkRecorder | undefined
): Promise<unknown> {
  const benchmark = await startBenchmark(recorder);
  const lease = acquireLeaseOrLoadError(executionLeases, benchmark);
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
    throw normalizeAndFailBenchmark(error, benchmark);
  }
}

/**
 * Issue 169: 会話例はターン毎生成へ移行したが、ターンごとに Native Context を
 * 都度 init/release するとモデルロードが毎回走り遅くなる。`beginSession` は
 * Context・execution lease を 1 度だけ確保し、`completeTurn` で全ターン再利用、
 * `close` で 1 度だけ解放する。Bridge 側の `executeLlamaProvider`（1 回の
 * completion で init/release が完結する契約）はそのまま維持し、この Session
 * 経路とは lease の取得回数以外を共有する（`completeContext` / `captureCompletion`）。
 */
async function beginConversationExampleSession(
  configuration: LocalModelConfiguration,
  loadModule: LlamaModuleLoader,
  executionLeases: LocalModelExecutionLeasePort,
  recorder: ModelBenchmarkRecorder | undefined,
  options: AgentModelProviderOptions | undefined
): Promise<ConversationExampleSession> {
  const signal = options?.signal;
  const benchmark = await startBenchmark(recorder);
  const lease = acquireLeaseOrLoadError(executionLeases, benchmark);
  let context: LlamaContextPort;
  try {
    context = await initializeContext(configuration, loadModule, signal);
  } catch (error: unknown) {
    lease.release();
    throw normalizeAndFailBenchmark(error, benchmark);
  }
  benchmark?.markLoaded();
  // レビュー指摘（HIGH）: `close()` は `context.release()` 自体の成否だけでなく、
  // 全ターンを通じた completion の失敗・Cancel も outcome に反映する
  // （`executeLlamaProvider` の `completion.kind`/`normalized.code` 判定と同じ考え方）。
  // Guard 違反（Content Guard）は Native 完了そのものは成功しているため、
  // ここでは扱わない（`parseConversationExampleTurn` は completeTurn の外側で呼ばれる）。
  let sessionFailure: AgentModelProviderError | null = null;
  return {
    async completeTurn(request, turnOptions) {
      const completion = await captureCompletion(
        context,
        request,
        configuration,
        turnOptions?.signal ?? signal,
        benchmark
      );
      if (completion.kind === 'failure') {
        sessionFailure = completion.error;
        throw completion.error;
      }
      benchmark?.markCompletion();
      return completion.output;
    },
    async close() {
      try {
        await context.release();
      } catch {
        // Native Context の解放を証明できないため lease を保持し、Process 再起動まで
        // 次の Context 確保を止める（`executeLlamaProvider` と同じ quarantine 方針）。
        void finishBenchmark(benchmark, 'failed');
        throw quarantinedLoadError();
      }
      lease.release();
      void finishBenchmark(
        benchmark,
        sessionFailure === null
          ? 'success'
          : sessionFailure.code === 'CANCELLED'
            ? 'cancelled'
            : 'failed'
      );
    },
  };
}

/**
 * 1 Encounter に 1 Context を作る Native Adapter。Native 値は unknown のまま JSON 境界へ渡し、
 * 共通 Evidence Validator / 会話例 Parser は各 feature 境界が必ず適用する。
 */
export function createLlamaCompletionPort(
  configuration: LocalModelConfiguration,
  loadModule: LlamaModuleLoader,
  executionLeases: LocalModelExecutionLeasePort,
  recorder?: ModelBenchmarkRecorder
): LocalModelCompletionPort & ConversationExampleCompletionPort {
  return {
    complete(request: LocalModelRequest, options?: AgentModelProviderOptions) {
      return executeLlamaProvider(
        request,
        configuration,
        loadModule,
        executionLeases,
        options?.signal,
        recorder
      );
    },
    beginSession(options?: AgentModelProviderOptions) {
      return beginConversationExampleSession(
        configuration,
        loadModule,
        executionLeases,
        recorder,
        options
      );
    },
  };
}
