/**
 * Issue 104 Priority 2（Bonsai-ready 化、item 5）: owner が iPhone 15 Pro 以降の
 * Release / internal build 実機で Bonsai 27B-Q1_0（または他の候補 Model）の
 * Load・Memory・生成速度を計測するための dev-only ハーネス。ADR-0036 が
 * 「Bonsai 27B 採用は物理端末の Load・First Token・Completion 到達の証跡化が
 * 条件」と定めた 3 条件のうち 1 つ目を、owner が実機で確認するための計測コードを
 * 提供する（本番の Provider Contract・Safety Boundary は経由しない。ベンチマーク
 * 専用の別経路であり、ADR-0023 の「単一 Native Lane」は本番推論経路の制約であって
 * この dev-only 計測ハーネスは対象外）。
 *
 * このファイルは純粋関数（`evaluateBonsaiBenchmark` / `buildBonsaiBenchmarkReport`）
 * と、それらを使う Native 実行オーケストレーション（`runBonsaiBenchmarkHarness`）を
 * 両方含む。オーケストレーションも `loadModule` / `telemetry` / `clock` を Port として
 * 注入するため、実機無しでも Fake Port で決定的にテストできる（No Mock: 実際に
 * 呼び出し可能な手書き Fake 実装を使い、jest.mock 等のライブラリは使わない）。
 */

export interface BonsaiBenchmarkCompletionParameters {
  readonly prompt: string;
  readonly nPredict: number;
  readonly temperature: number;
}

export interface BonsaiBenchmarkContextPort {
  completion(
    parameters: BonsaiBenchmarkCompletionParameters,
    onToken: () => void
  ): Promise<{ readonly tokensGenerated: number }>;
  release(): Promise<void>;
}

export interface BonsaiBenchmarkModulePort {
  initLlama(parameters: {
    readonly model: string;
    readonly n_ctx: number;
    readonly n_gpu_layers: number;
    readonly n_parallel: number;
    readonly use_mmap: boolean;
    readonly use_mlock: boolean;
    readonly no_extra_bufts: boolean;
  }): Promise<BonsaiBenchmarkContextPort>;
}

export type BonsaiBenchmarkModuleLoader =
  () => Promise<BonsaiBenchmarkModulePort>;

export interface BonsaiBenchmarkTelemetrySnapshot {
  readonly physFootprintBytes: number | null;
  readonly availableMemoryBytes: number | null;
}

export interface BonsaiBenchmarkTelemetryPort {
  snapshot(): Promise<BonsaiBenchmarkTelemetrySnapshot>;
}

export interface BonsaiBenchmarkClock {
  readonly nowMs: () => number;
}

/** owner の実機テストで、他アプリの体感を壊さない程度の頻度でメモリを見る。 */
export const BONSAI_BENCHMARK_SAMPLE_INTERVAL_MS = 200;

export interface BonsaiBenchmarkSample {
  readonly elapsedMs: number;
  readonly physFootprintBytes: number | null;
  readonly availableMemoryBytes: number | null;
}

/**
 * 技術 GO（Technical GO）のしきい値。owner 実機テストの Codex 提供仕様どおり:
 * - peak phys_footprint が Memory 予算の 80% 未満。
 * - First Token 到達後の空き Memory（`os_proc_available_memory`）が 1 GiB 以上。
 * - Decode 速度（生成トークン数 / 生成時間）が 2 tok/s 以上。
 */
export const BONSAI_BENCHMARK_TECHNICAL_GO_THRESHOLDS = {
  maxPeakFootprintRatio: 0.8,
  minAvailableMemoryAfterFirstTokenBytes: 1 * 1024 * 1024 * 1024,
  minDecodeTokensPerSecond: 2,
} as const;

/**
 * 本番 GO（Production GO）のしきい値。技術 GO を満たした上でさらに次を満たす場合。
 * - p50 相当（全体平均で近似する、後述）の生成速度が 5 tok/s 以上。
 * - First Token までの時間が 20 秒以下。
 * - 256 トークン生成の完了時間が 75 秒以下。
 */
export const BONSAI_BENCHMARK_PRODUCTION_GO_THRESHOLDS = {
  minP50TokensPerSecond: 5,
  maxFirstTokenDurationMs: 20_000,
  maxCompletionDurationMsFor256Tokens: 75_000,
} as const;

export type BonsaiBenchmarkVerdict =
  | 'production-go'
  | 'technical-go'
  | 'not-ready';

export interface BonsaiBenchmarkMeasurement {
  readonly peakPhysFootprintBytes: number | null;
  readonly budgetBytes: number;
  readonly availableMemoryAfterFirstTokenBytes: number | null;
  readonly loadDurationMs: number;
  readonly firstTokenDurationMs: number;
  readonly completionDurationMs: number;
  readonly generatedTokenCount: number;
}

function decodeTokensPerSecond(
  measurement: BonsaiBenchmarkMeasurement
): number {
  const decodeDurationMs = Math.max(
    0,
    measurement.completionDurationMs - measurement.firstTokenDurationMs
  );
  if (measurement.generatedTokenCount <= 1 || decodeDurationMs === 0) return 0;
  // 最初の 1 トークンは First Token 計測の対象であり、Decode 速度からは除く。
  return ((measurement.generatedTokenCount - 1) / decodeDurationMs) * 1000;
}

function overallTokensPerSecond(
  measurement: BonsaiBenchmarkMeasurement
): number {
  if (
    measurement.generatedTokenCount <= 0 ||
    measurement.completionDurationMs <= 0
  ) {
    return 0;
  }
  return (
    (measurement.generatedTokenCount / measurement.completionDurationMs) * 1000
  );
}

function meetsTechnicalGo(measurement: BonsaiBenchmarkMeasurement): boolean {
  const {
    peakPhysFootprintBytes,
    budgetBytes,
    availableMemoryAfterFirstTokenBytes,
  } = measurement;
  if (peakPhysFootprintBytes === null || budgetBytes <= 0) return false;
  if (availableMemoryAfterFirstTokenBytes === null) return false;
  const peakRatio = peakPhysFootprintBytes / budgetBytes;
  return (
    peakRatio <
      BONSAI_BENCHMARK_TECHNICAL_GO_THRESHOLDS.maxPeakFootprintRatio &&
    availableMemoryAfterFirstTokenBytes >=
      BONSAI_BENCHMARK_TECHNICAL_GO_THRESHOLDS.minAvailableMemoryAfterFirstTokenBytes &&
    decodeTokensPerSecond(measurement) >=
      BONSAI_BENCHMARK_TECHNICAL_GO_THRESHOLDS.minDecodeTokensPerSecond
  );
}

function meetsProductionGo(measurement: BonsaiBenchmarkMeasurement): boolean {
  // p50 の real 分布計測には複数 run が要るため、1 run のハーネスでは全体平均
  // tok/s を保守的な近似として使う（owner が複数 run の結果を並べて実際の p50 を
  // 判断する前提。ここでの合否は「この 1 run が明らかに閾値未満で不合格」を
  // 早期に伝えるための簡易判定に留める）。
  return (
    overallTokensPerSecond(measurement) >=
      BONSAI_BENCHMARK_PRODUCTION_GO_THRESHOLDS.minP50TokensPerSecond &&
    measurement.firstTokenDurationMs <=
      BONSAI_BENCHMARK_PRODUCTION_GO_THRESHOLDS.maxFirstTokenDurationMs &&
    (measurement.generatedTokenCount < 256 ||
      measurement.completionDurationMs <=
        BONSAI_BENCHMARK_PRODUCTION_GO_THRESHOLDS.maxCompletionDurationMsFor256Tokens)
  );
}

/** 技術 GO を満たさなければ `not-ready`、満たせば本番 GO も見て判定する。 */
export function evaluateBonsaiBenchmark(
  measurement: BonsaiBenchmarkMeasurement
): BonsaiBenchmarkVerdict {
  if (!meetsTechnicalGo(measurement)) return 'not-ready';
  return meetsProductionGo(measurement) ? 'production-go' : 'technical-go';
}

export interface BonsaiBenchmarkReport {
  readonly schemaVersion: 1;
  readonly modelSha256: string;
  readonly measuredAt: string;
  readonly budgetBytes: number;
  readonly loadDurationMs: number;
  readonly firstTokenDurationMs: number;
  readonly completionDurationMs: number;
  readonly generatedTokenCount: number;
  readonly decodeTokensPerSecond: number;
  readonly overallTokensPerSecond: number;
  readonly peakPhysFootprintBytes: number | null;
  readonly availableMemoryAfterFirstTokenBytes: number | null;
  readonly samples: readonly BonsaiBenchmarkSample[];
  readonly verdict: BonsaiBenchmarkVerdict;
}

/**
 * `runBonsaiBenchmarkHarness` の生の計測値から、owner が保存・比較できる 1 つの
 * JSON Report を組み立てる。この関数自体は Native I/O を一切行わない純粋関数。
 */
export function buildBonsaiBenchmarkReport(
  modelSha256: string,
  measuredAt: string,
  measurement: BonsaiBenchmarkMeasurement,
  samples: readonly BonsaiBenchmarkSample[]
): BonsaiBenchmarkReport {
  return {
    schemaVersion: 1,
    modelSha256,
    measuredAt,
    budgetBytes: measurement.budgetBytes,
    loadDurationMs: measurement.loadDurationMs,
    firstTokenDurationMs: measurement.firstTokenDurationMs,
    completionDurationMs: measurement.completionDurationMs,
    generatedTokenCount: measurement.generatedTokenCount,
    decodeTokensPerSecond: decodeTokensPerSecond(measurement),
    overallTokensPerSecond: overallTokensPerSecond(measurement),
    peakPhysFootprintBytes: measurement.peakPhysFootprintBytes,
    availableMemoryAfterFirstTokenBytes:
      measurement.availableMemoryAfterFirstTokenBytes,
    samples,
    verdict: evaluateBonsaiBenchmark(measurement),
  };
}

export interface BonsaiBenchmarkOptions {
  readonly loadModule: BonsaiBenchmarkModuleLoader;
  readonly telemetry: BonsaiBenchmarkTelemetryPort;
  readonly clock: BonsaiBenchmarkClock;
  readonly modelPath: string;
  readonly modelSha256: string;
  readonly budgetBytes: number;
  readonly nPredict: number;
  readonly prompt: string;
}

function peakOf(samples: readonly BonsaiBenchmarkSample[]): number | null {
  return samples.reduce<number | null>((peak, sample) => {
    if (sample.physFootprintBytes === null) return peak;
    if (peak === null) return sample.physFootprintBytes;
    return Math.max(peak, sample.physFootprintBytes);
  }, null);
}

/**
 * owner が実機で実行する唯一の入口。`initLlama` の baseline config
 * （`n_ctx: 2048` / `n_gpu_layers: 99` / `n_parallel: 1` / `use_mmap: true` /
 * `use_mlock: false` / `no_extra_bufts: true`、`llama-agent-model-provider.ts`
 * の `FIXED_CONTEXT_PARAMETERS` と同じ既定値）で Model を Load し、生成中
 * `BONSAI_BENCHMARK_SAMPLE_INTERVAL_MS`（200ms）以上経過するたびに Telemetry を
 * 採取する。実時間 Timer ではなく、Token 生成コールバック（`onToken`）の中で
 * 経過時間を判定するため、決定的な Fake Port（`clock.nowMs` が固定シーケンスを
 * 返す・`completion` が同期的に `onToken` を必要回数呼ぶ）だけで実機無しに
 * 再現テストできる。
 */
export async function runBonsaiBenchmarkHarness(
  options: BonsaiBenchmarkOptions
): Promise<BonsaiBenchmarkReport> {
  const module = await options.loadModule();

  const loadStartedAtMs = options.clock.nowMs();
  const context = await module.initLlama({
    model: options.modelPath,
    n_ctx: 2_048,
    n_gpu_layers: 99,
    n_parallel: 1,
    use_mmap: true,
    use_mlock: false,
    no_extra_bufts: true,
  });
  const loadDurationMs = options.clock.nowMs() - loadStartedAtMs;

  const samples: BonsaiBenchmarkSample[] = [];
  const pendingSamples: Promise<void>[] = [];
  const completionStartedAtMs = options.clock.nowMs();
  let lastSampleAtMs = completionStartedAtMs;
  let firstTokenAtMs: number | null = null;

  // code-reviewer 指摘（minor）: 以前は `firstTokenAtMs` 判定と `sampleIfDue` の
  // しきい値判定がそれぞれ独立に `clock.nowMs()` を呼んでおり、Fake Clock が
  // 呼び出しのたびに違う値を返す設計と組み合わさると、テストのコメントで
  // 説明する経過時間とテスト対象コードが実際に見る経過時間が食い違いやすかった。
  // 1 Token につき `now` を 1 回だけ読み、First Token 判定・採取要否判定の
  // 両方に使い回す（Port 呼び出し回数も減る）。
  function sampleIfDue(now: number): void {
    if (now - lastSampleAtMs < BONSAI_BENCHMARK_SAMPLE_INTERVAL_MS) return;
    lastSampleAtMs = now;
    const elapsedMs = now - completionStartedAtMs;
    pendingSamples.push(
      options.telemetry.snapshot().then((snapshot) => {
        samples.push({
          elapsedMs,
          physFootprintBytes: snapshot.physFootprintBytes,
          availableMemoryBytes: snapshot.availableMemoryBytes,
        });
      })
    );
  }

  const result = await context.completion(
    {
      prompt: options.prompt,
      nPredict: options.nPredict,
      temperature: 0,
    },
    () => {
      const now = options.clock.nowMs();
      if (firstTokenAtMs === null) firstTokenAtMs = now;
      sampleIfDue(now);
    }
  );
  await Promise.all(pendingSamples);
  const completionEndedAtMs = options.clock.nowMs();
  await context.release();

  const firstTokenDurationMs =
    firstTokenAtMs !== null ? firstTokenAtMs - completionStartedAtMs : 0;
  const availableMemoryAfterFirstTokenBytes =
    samples.find((sample) => sample.elapsedMs >= firstTokenDurationMs)
      ?.availableMemoryBytes ?? null;

  const measurement: BonsaiBenchmarkMeasurement = {
    peakPhysFootprintBytes: peakOf(samples),
    budgetBytes: options.budgetBytes,
    availableMemoryAfterFirstTokenBytes,
    loadDurationMs,
    firstTokenDurationMs,
    completionDurationMs: completionEndedAtMs - completionStartedAtMs,
    generatedTokenCount: result.tokensGenerated,
  };

  return buildBonsaiBenchmarkReport(
    options.modelSha256,
    new Date(options.clock.nowMs()).toISOString(),
    measurement,
    samples
  );
}
