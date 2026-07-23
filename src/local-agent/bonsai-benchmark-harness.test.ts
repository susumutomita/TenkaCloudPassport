import { describe, expect, it } from 'bun:test';
import {
  BONSAI_BENCHMARK_SAMPLE_INTERVAL_MS,
  type BonsaiBenchmarkContextPort,
  type BonsaiBenchmarkMeasurement,
  type BonsaiBenchmarkModulePort,
  buildBonsaiBenchmarkReport,
  evaluateBonsaiBenchmark,
  runBonsaiBenchmarkHarness,
} from './bonsai-benchmark-harness';

/**
 * Issue 104 Priority 2（Bonsai-ready 化、item 5）の日本語 BDD テスト。実機無しで
 * 決定的に再現するため、手書きの Fake Port（`jest.mock` 等は使わない No Mock）を使う。
 */

const GIB = 1024 * 1024 * 1024;

function baseMeasurement(
  overrides: Partial<BonsaiBenchmarkMeasurement> = {}
): BonsaiBenchmarkMeasurement {
  return {
    peakPhysFootprintBytes: 3 * GIB,
    budgetBytes: 6 * GIB,
    availableMemoryAfterFirstTokenBytes: 2 * GIB,
    loadDurationMs: 5_000,
    firstTokenDurationMs: 2_000,
    completionDurationMs: 30_000,
    generatedTokenCount: 256,
    ...overrides,
  };
}

describe('evaluateBonsaiBenchmark', () => {
  it('技術 GO・本番 GO の両方を満たす場合 production-go を返す', () => {
    // peak/budget = 0.5 < 0.8、空き 2 GiB >= 1 GiB、
    // decode = 255 tok / 28,000 ms ≈ 9.1 tok/s、overall ≈ 8.5 tok/s。
    expect(evaluateBonsaiBenchmark(baseMeasurement())).toBe('production-go');
  });

  it('peak footprint が予算の 80% 以上の場合 not-ready を返す（技術 GO 未達）', () => {
    expect(
      evaluateBonsaiBenchmark(
        baseMeasurement({ peakPhysFootprintBytes: 5 * GIB })
      )
    ).toBe('not-ready');
  });

  it('First Token 後の空き Memory が 1 GiB 未満の場合 not-ready を返す', () => {
    expect(
      evaluateBonsaiBenchmark(
        baseMeasurement({
          availableMemoryAfterFirstTokenBytes: 0.5 * GIB,
        })
      )
    ).toBe('not-ready');
  });

  it('peak footprint を計測できない場合 not-ready を返す', () => {
    expect(
      evaluateBonsaiBenchmark(baseMeasurement({ peakPhysFootprintBytes: null }))
    ).toBe('not-ready');
  });

  it('空き Memory を計測できない場合 not-ready を返す', () => {
    expect(
      evaluateBonsaiBenchmark(
        baseMeasurement({ availableMemoryAfterFirstTokenBytes: null })
      )
    ).toBe('not-ready');
  });

  it('budgetBytes が 0 以下の場合 not-ready を返す（0 除算を避ける）', () => {
    expect(evaluateBonsaiBenchmark(baseMeasurement({ budgetBytes: 0 }))).toBe(
      'not-ready'
    );
  });

  it('生成トークンが 1 件以下の場合、Decode 速度は 0 とみなし not-ready を返す', () => {
    expect(
      evaluateBonsaiBenchmark(baseMeasurement({ generatedTokenCount: 1 }))
    ).toBe('not-ready');
  });

  it('Decode 速度が 2 tok/s 未満の場合 not-ready を返す（技術 GO 未達）', () => {
    expect(
      evaluateBonsaiBenchmark(
        baseMeasurement({
          generatedTokenCount: 10,
          firstTokenDurationMs: 1_000,
          completionDurationMs: 60_000,
        })
      )
    ).toBe('not-ready');
  });

  it('技術 GO は満たすが p50 相当の tok/s が 5 未満の場合 technical-go を返す', () => {
    // decode = 249 tok / 58,000 ms ≈ 4.3 tok/s（技術 GO の 2 tok/s は満たす）、
    // overall = 250 tok / 60,000 ms ≈ 4.2 tok/s（本番 GO の 5 tok/s は満たさない）。
    expect(
      evaluateBonsaiBenchmark(
        baseMeasurement({
          generatedTokenCount: 250,
          firstTokenDurationMs: 2_000,
          completionDurationMs: 60_000,
        })
      )
    ).toBe('technical-go');
  });

  it('技術 GO は満たすが First Token が 20 秒を超える場合 technical-go を返す', () => {
    expect(
      evaluateBonsaiBenchmark(baseMeasurement({ firstTokenDurationMs: 21_000 }))
    ).toBe('technical-go');
  });

  it('256 トークン生成が 75 秒を超える場合 technical-go を返す', () => {
    expect(
      evaluateBonsaiBenchmark(baseMeasurement({ completionDurationMs: 80_000 }))
    ).toBe('technical-go');
  });

  it('256 トークン未満の生成では 256 トークン専用の完了時間上限（75 秒）を適用しない（OR 分岐の短絡評価を確認する）', () => {
    // completionDurationMs = 30,000ms は 75 秒の上限を満たすが、上限を適用しない
    // 分岐（`generatedTokenCount < 256`）が実際に評価されることをこのテストで
    // 固定する（256 件ちょうどの場合は他のテストが cover する）。
    expect(
      evaluateBonsaiBenchmark(
        baseMeasurement({
          generatedTokenCount: 200,
          completionDurationMs: 30_000,
        })
      )
    ).toBe('production-go');
  });
});

describe('buildBonsaiBenchmarkReport', () => {
  it('計測値から schemaVersion 付きの JSON Report を組み立てる', () => {
    const report = buildBonsaiBenchmarkReport(
      'a'.repeat(64),
      '2026-07-23T00:00:00.000Z',
      baseMeasurement(),
      [
        {
          elapsedMs: 200,
          physFootprintBytes: 3 * GIB,
          availableMemoryBytes: 2 * GIB,
        },
      ]
    );

    expect(report.schemaVersion).toBe(1);
    expect(report.modelSha256).toBe('a'.repeat(64));
    expect(report.verdict).toBe('production-go');
    expect(report.samples).toHaveLength(1);
  });
});

/** `clock.nowMs()` が固定シーケンスを順に返す Fake Clock（実時間 Timer を使わない）。 */
function sequentialClock(values: readonly number[]) {
  let index = 0;
  return {
    nowMs: (): number => {
      const value = values[Math.min(index, values.length - 1)] ?? 0;
      index += 1;
      return value;
    },
  };
}

function fakeContext(tokensToGenerate: number): BonsaiBenchmarkContextPort {
  return {
    async completion(_parameters, onToken) {
      for (let index = 0; index < tokensToGenerate; index += 1) {
        onToken();
      }
      return { tokensGenerated: tokensToGenerate };
    },
    async release() {
      return;
    },
  };
}

describe('runBonsaiBenchmarkHarness', () => {
  it('initLlama を既定の baseline config で呼び、Load/First Token/生成時間を計測して Report を返す', async () => {
    const initializations: unknown[] = [];
    const snapshots = [
      { physFootprintBytes: 2 * GIB, availableMemoryBytes: 3 * GIB },
      { physFootprintBytes: 3 * GIB, availableMemoryBytes: 2.5 * GIB },
    ];
    let snapshotIndex = 0;
    const module: BonsaiBenchmarkModulePort = {
      async initLlama(parameters) {
        initializations.push(parameters);
        return fakeContext(3);
      },
    };
    // nowMs 呼び出し順: loadStart, loadEnd, completionStart,
    // token1(sampleIfDue: now - last < 200 skip), token2(now - last >= 200 sample),
    // token3(skip), completionEnd, report timestamp。
    const clock = sequentialClock([
      0, 1_000, 1_000, 1_100, 1_300, 1_350, 5_000, 5_000,
    ]);
    const telemetry = {
      async snapshot() {
        const snapshot =
          snapshots[Math.min(snapshotIndex, snapshots.length - 1)];
        snapshotIndex += 1;
        return (
          snapshot ?? { physFootprintBytes: null, availableMemoryBytes: null }
        );
      },
    };

    const report = await runBonsaiBenchmarkHarness({
      loadModule: async () => module,
      telemetry,
      clock,
      modelPath: 'file:///private/bonsai-27b-q1_0.gguf',
      modelSha256: 'b'.repeat(64),
      budgetBytes: 6 * GIB,
      nPredict: 3,
      prompt: 'テスト用ベンチマークプロンプト',
    });

    expect(initializations).toEqual([
      {
        model: 'file:///private/bonsai-27b-q1_0.gguf',
        n_ctx: 2_048,
        n_gpu_layers: 99,
        n_parallel: 1,
        use_mmap: true,
        use_mlock: false,
        no_extra_bufts: true,
      },
    ]);
    expect(report.loadDurationMs).toBe(1_000);
    expect(report.generatedTokenCount).toBe(3);
    expect(report.samples.length).toBeGreaterThan(0);
    expect(report.modelSha256).toBe('b'.repeat(64));
  });

  it(`token callback 内で ${BONSAI_BENCHMARK_SAMPLE_INTERVAL_MS}ms 未満しか経過していない場合は採取をスキップする`, async () => {
    let snapshotCalls = 0;
    const module: BonsaiBenchmarkModulePort = {
      async initLlama() {
        return fakeContext(2);
      },
    };
    // completionStart=1_000、token1 は 1_050（50ms 経過、閾値未満でスキップ）、
    // token2 も 1_100（前回サンプル基準 = completionStart のまま、100ms 経過でスキップ）。
    const clock = sequentialClock([0, 0, 1_000, 1_050, 1_100, 1_100, 1_100]);
    const telemetry = {
      async snapshot() {
        snapshotCalls += 1;
        return { physFootprintBytes: 1 * GIB, availableMemoryBytes: 4 * GIB };
      },
    };

    const report = await runBonsaiBenchmarkHarness({
      loadModule: async () => module,
      telemetry,
      clock,
      modelPath: 'file:///private/bonsai-27b-q1_0.gguf',
      modelSha256: 'c'.repeat(64),
      budgetBytes: 6 * GIB,
      nPredict: 2,
      prompt: 'テスト用',
    });

    expect(snapshotCalls).toBe(0);
    expect(report.samples).toEqual([]);
    expect(report.peakPhysFootprintBytes).toBeNull();
    expect(report.availableMemoryAfterFirstTokenBytes).toBeNull();
  });

  it('1 度も Token を生成できなかった場合、firstTokenDurationMs は 0 のままになる', async () => {
    const module: BonsaiBenchmarkModulePort = {
      async initLlama() {
        return fakeContext(0);
      },
    };
    const clock = sequentialClock([0, 500, 500, 900, 900]);
    const telemetry = {
      async snapshot() {
        return { physFootprintBytes: 1 * GIB, availableMemoryBytes: 4 * GIB };
      },
    };

    const report = await runBonsaiBenchmarkHarness({
      loadModule: async () => module,
      telemetry,
      clock,
      modelPath: 'file:///private/model.gguf',
      modelSha256: 'd'.repeat(64),
      budgetBytes: 6 * GIB,
      nPredict: 0,
      prompt: 'テスト用',
    });

    expect(report.firstTokenDurationMs).toBe(0);
    expect(report.generatedTokenCount).toBe(0);
  });
});
