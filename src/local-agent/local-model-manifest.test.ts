import { describe, expect, it } from 'bun:test';
import {
  createEmptyLocalModelManifest,
  evaluateModelResourceRisk,
  type ImportedLocalModel,
  type LocalModelBenchmarkReport,
  LocalModelLifecycleError,
  type ModelResourceRiskInput,
  parseLocalModelManifest,
  projectGgufMetadata,
  serializeLocalModelManifest,
} from './local-model-manifest';

const SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);

const IMPORTED_MODEL: ImportedLocalModel = {
  sha256: SHA,
  originalFileName: 'qwen-4b-q4.gguf',
  privateUri: `file:///private/models/${SHA}.gguf`,
  sizeBytes: 2_000_000_000,
  importedAt: '2026-07-18T01:02:03.000Z',
  metadata: {
    architecture: 'qwen2',
    contextLength: 32_768,
    fileType: 15,
  },
  risk: {
    level: 'supported',
    effectiveMemoryBytes: 8_000_000_000,
    estimatedWorkingSetBytes: 2_936_870_912,
    ratioPermille: 367,
    reasons: ['memory-ratio-supported'],
  },
  configuration: {
    nCtx: 2_048,
    nGpuLayers: 0,
    nPredict: 96,
  },
};

const BENCHMARK: LocalModelBenchmarkReport = {
  schemaVersion: 1,
  modelSha256: SHA,
  measuredAt: '2026-07-18T01:03:04.000Z',
  outcome: 'success',
  importDurationMs: 12_000,
  loadDurationMs: 2_000,
  firstTokenDurationMs: 2_500,
  completionDurationMs: 3_200,
  peakProcessMemoryBytes: 3_000_000_000,
  thermalStateBefore: 'nominal',
  thermalStateAfter: 'fair',
  batteryDeltaPermille: -4,
};

function rejectedCode(value: unknown): string {
  try {
    parseLocalModelManifest(value);
    throw new Error('LocalModelLifecycleError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalModelLifecycleError);
    return error instanceof LocalModelLifecycleError
      ? error.code
      : 'unexpected';
  }
}

describe('llama.rn GGUF Metadata の allowlist projection', () => {
  it('Architecture 固有 Context と File Type だけを bounded Metadata にする', () => {
    expect(
      projectGgufMetadata({
        version: 3,
        'general.architecture': 'qwen2',
        'qwen2.context_length': '32768',
        'general.file_type': '15',
        'general.name': '端末外へ保存しない自由記述',
        'tokenizer.ggml.model': 'ignored',
      })
    ).toEqual({
      architecture: 'qwen2',
      contextLength: 32_768,
      fileType: 15,
    });
  });

  it('Object 以外、Architecture 不在、不正 Context、短すぎる Context を拒否する', () => {
    expect(() => projectGgufMetadata(null)).toThrow(LocalModelLifecycleError);
    expect(() => projectGgufMetadata({ version: 3 })).toThrow(
      LocalModelLifecycleError
    );
    expect(() =>
      projectGgufMetadata({
        'general.architecture': 'llama',
        'llama.context_length': 'unknown',
      })
    ).toThrow(LocalModelLifecycleError);
    expect(() =>
      projectGgufMetadata({
        'general.architecture': 'llama',
        'llama.context_length': '128',
      })
    ).toThrow(LocalModelLifecycleError);
  });

  it('Prototype 上の Metadata と制御文字入り Architecture を拒否する', () => {
    const prototype = {
      'general.architecture': 'llama',
      'llama.context_length': '4096',
    };
    expect(() => projectGgufMetadata(Object.create(prototype))).toThrow(
      LocalModelLifecycleError
    );
    expect(() =>
      projectGgufMetadata({
        'general.architecture': 'llama\u0000',
        'llama\u0000.context_length': '4096',
      })
    ).toThrow(LocalModelLifecycleError);
  });
});

describe('Model Size と Device Memory の Resource Risk', () => {
  it('45% 以下を supported、45% 超 60% 以下を caution、60% 超を blocked にする', () => {
    const effectiveMemoryBytes = 10_000_000_000;

    expect(
      evaluateModelResourceRisk({
        modelSizeBytes: 3_302_607_573,
        nCtx: 2_048,
        physicalMemoryBytes: effectiveMemoryBytes,
        processMemoryLimitBytes: effectiveMemoryBytes,
        processMemoryLimitProvenance: 'os-process-ceiling',
        thermalState: 'nominal',
      }).level
    ).toBe('supported');
    expect(
      evaluateModelResourceRisk({
        modelSizeBytes: 3_302_607_574,
        nCtx: 2_048,
        physicalMemoryBytes: effectiveMemoryBytes,
        processMemoryLimitBytes: effectiveMemoryBytes,
        processMemoryLimitProvenance: 'os-process-ceiling',
        thermalState: 'nominal',
      }).level
    ).toBe('caution');
    expect(
      evaluateModelResourceRisk({
        modelSizeBytes: 4_552_607_573,
        nCtx: 2_048,
        physicalMemoryBytes: effectiveMemoryBytes,
        processMemoryLimitBytes: effectiveMemoryBytes,
        processMemoryLimitProvenance: 'os-process-ceiling',
        thermalState: 'nominal',
      }).level
    ).toBe('caution');
    expect(
      evaluateModelResourceRisk({
        modelSizeBytes: 4_552_607_574,
        nCtx: 2_048,
        physicalMemoryBytes: effectiveMemoryBytes,
        processMemoryLimitBytes: effectiveMemoryBytes,
        processMemoryLimitProvenance: 'os-process-ceiling',
        thermalState: 'nominal',
      }).level
    ).toBe('blocked');
  });

  it('physical と process limit の小さい方を使い、Memory 不明を blocked にする', () => {
    const limited = evaluateModelResourceRisk({
      modelSizeBytes: 1_000_000_000,
      nCtx: 2_048,
      physicalMemoryBytes: 8_000_000_000,
      processMemoryLimitBytes: 2_000_000_000,
      processMemoryLimitProvenance: 'os-process-ceiling',
      thermalState: 'nominal',
    });
    const unknown = evaluateModelResourceRisk({
      modelSizeBytes: 1_000_000_000,
      nCtx: 2_048,
      physicalMemoryBytes: null,
      processMemoryLimitBytes: null,
      processMemoryLimitProvenance: 'unavailable',
      thermalState: 'unknown',
    });

    expect(limited.effectiveMemoryBytes).toBe(2_000_000_000);
    expect(limited.level).toBe('blocked');
    expect(unknown.level).toBe('blocked');
    expect(unknown.reasons).toContain('memory-unavailable');
  });

  it('serious / critical Thermal は比率にかかわらず blocked にする', () => {
    for (const thermalState of ['serious', 'critical'] as const) {
      const risk = evaluateModelResourceRisk({
        modelSizeBytes: 100_000_000,
        nCtx: 2_048,
        physicalMemoryBytes: 16_000_000_000,
        processMemoryLimitBytes: 16_000_000_000,
        processMemoryLimitProvenance: 'os-process-ceiling',
        thermalState,
      });
      expect(risk.level).toBe('blocked');
      expect(risk.reasons).toContain('thermal-pressure');
    }
  });

  /**
   * major（Issue 104 PR #132、Codex 指摘）: Android の `availMem` は端末全体の
   * 空き容量であり、この App 専用の割当上限ではない。iOS の
   * `os-process-ceiling`（Process 単位の実測 Ceiling）と同じ信頼度で使うと、
   * 他 App が Idle なだけで大型 Model を過度に `supported` 判定しうる。
   */
  describe('processMemoryLimitProvenance（iOS/Android の意味の違いを型で区別、Issue 104 PR #132）', () => {
    it('同じ processMemoryLimitBytes でも system-wide-available は os-process-ceiling より保守的な（小さい）effectiveMemoryBytes になる', () => {
      const iosLike = evaluateModelResourceRisk({
        modelSizeBytes: 1_000_000_000,
        nCtx: 2_048,
        physicalMemoryBytes: 16_000_000_000,
        processMemoryLimitBytes: 4_000_000_000,
        processMemoryLimitProvenance: 'os-process-ceiling',
        thermalState: 'nominal',
      });
      const androidLike = evaluateModelResourceRisk({
        modelSizeBytes: 1_000_000_000,
        nCtx: 2_048,
        physicalMemoryBytes: 16_000_000_000,
        processMemoryLimitBytes: 4_000_000_000,
        processMemoryLimitProvenance: 'system-wide-available',
        thermalState: 'nominal',
      });

      expect(iosLike.effectiveMemoryBytes).toBe(4_000_000_000);
      expect(androidLike.effectiveMemoryBytes).toBe(2_000_000_000);
      expect(androidLike.ratioPermille ?? 0).toBeGreaterThan(
        iosLike.ratioPermille ?? 0
      );
    });

    it('system-wide-available の割引後の値が physicalMemoryBytes より大きくならない（総メモリを超えて Ceiling を偽装しない）', () => {
      const risk = evaluateModelResourceRisk({
        modelSizeBytes: 1_000_000_000,
        nCtx: 2_048,
        physicalMemoryBytes: 1_500_000_000,
        processMemoryLimitBytes: 8_000_000_000,
        processMemoryLimitProvenance: 'system-wide-available',
        thermalState: 'nominal',
      });

      expect(risk.effectiveMemoryBytes).toBe(1_500_000_000);
    });

    it('processMemoryLimitProvenance が unavailable なのに processMemoryLimitBytes が非 null の矛盾した入力を INVALID_RESOURCE_INPUT として拒否する', () => {
      expect(() =>
        evaluateModelResourceRisk({
          modelSizeBytes: 1_000_000_000,
          nCtx: 2_048,
          physicalMemoryBytes: 8_000_000_000,
          processMemoryLimitBytes: 4_000_000_000,
          processMemoryLimitProvenance: 'unavailable',
          thermalState: 'nominal',
        })
      ).toThrow(LocalModelLifecycleError);
    });

    it('未知の processMemoryLimitProvenance 値は INVALID_RESOURCE_INPUT として拒否する', () => {
      // `ProcessMemoryLimitProvenance` は 3 リテラルの union のため、型エスケープ
      // （`as unknown as` 等）無しに不正な値を作るには `JSON.parse` の `any` を経由する
      // （このリポジトリの `INVARIANT_NO_TYPE_ESCAPE_HATCH` に従う）。
      const malformedInput: ModelResourceRiskInput = JSON.parse(
        JSON.stringify({
          modelSizeBytes: 1_000_000_000,
          nCtx: 2_048,
          physicalMemoryBytes: 8_000_000_000,
          processMemoryLimitBytes: null,
          processMemoryLimitProvenance: 'made-up',
          thermalState: 'nominal',
        })
      );

      expect(() => evaluateModelResourceRisk(malformedInput)).toThrow(
        LocalModelLifecycleError
      );
    });
  });
});

describe('Local Model Manifest v1 の strict boundary', () => {
  it('空 Manifest を作り、保存 JSON を新しい参照へ strict parse する', () => {
    expect(createEmptyLocalModelManifest()).toEqual({
      schemaVersion: 1,
      activeModelSha256: null,
      models: [],
      benchmarkReports: [],
    });
    const source = {
      schemaVersion: 1 as const,
      activeModelSha256: SHA,
      models: [IMPORTED_MODEL],
      benchmarkReports: [BENCHMARK],
    };
    const parsed = parseLocalModelManifest(
      JSON.parse(serializeLocalModelManifest(source))
    );

    expect(parsed).toEqual(source);
    expect(parsed).not.toBe(source);
    expect(parsed.models[0]).not.toBe(source.models[0]);
  });

  it('未知 Version / Field、active の参照切れ、重複 digest / File Name を拒否する', () => {
    const base = {
      schemaVersion: 1,
      activeModelSha256: SHA,
      models: [IMPORTED_MODEL],
      benchmarkReports: [BENCHMARK],
    };

    expect(rejectedCode({ ...base, schemaVersion: 2 })).toBe(
      'INVALID_MANIFEST'
    );
    expect(rejectedCode({ ...base, unexpected: true })).toBe(
      'INVALID_MANIFEST'
    );
    expect(rejectedCode({ ...base, activeModelSha256: OTHER_SHA })).toBe(
      'INVALID_MANIFEST'
    );
    expect(
      rejectedCode({ ...base, models: [IMPORTED_MODEL, IMPORTED_MODEL] })
    ).toBe('INVALID_MANIFEST');
    expect(
      rejectedCode({
        ...base,
        models: [IMPORTED_MODEL, { ...IMPORTED_MODEL, sha256: OTHER_SHA }],
      })
    ).toBe('INVALID_MANIFEST');
  });

  it('Benchmark へ推論内容、File URI、端末識別子を追加すると全体を拒否する', () => {
    const privateFields = [
      { prompt: 'secret' },
      { answer: 'secret' },
      { bridge: 'secret' },
      { modelOutput: 'secret' },
      { fileUri: 'file:///private/model.gguf' },
      { deviceId: 'stable-device-id' },
    ];

    for (const privateField of privateFields) {
      expect(
        rejectedCode({
          schemaVersion: 1,
          activeModelSha256: SHA,
          models: [IMPORTED_MODEL],
          benchmarkReports: [{ ...BENCHMARK, ...privateField }],
        })
      ).toBe('INVALID_MANIFEST');
    }
  });

  it('Model 8 件、Report 20 件の上限を受理し、超過を拒否する', () => {
    const models = Array.from({ length: 8 }, (_, index) => ({
      ...IMPORTED_MODEL,
      sha256: index.toString(16).padStart(64, '0'),
      originalFileName: `model-${index}.gguf`,
      privateUri: `file:///private/models/${index.toString(16).padStart(64, '0')}.gguf`,
    }));
    const reports = Array.from({ length: 20 }, (_, index) => ({
      ...BENCHMARK,
      modelSha256: models[0]?.sha256 ?? SHA,
      measuredAt: `2026-07-18T01:${index.toString().padStart(2, '0')}:00.000Z`,
    }));
    const manifest = {
      schemaVersion: 1 as const,
      activeModelSha256: models[0]?.sha256 ?? null,
      models,
      benchmarkReports: reports,
    };

    expect(parseLocalModelManifest(manifest).models).toHaveLength(8);
    expect(parseLocalModelManifest(manifest).benchmarkReports).toHaveLength(20);
    expect(
      rejectedCode({
        ...manifest,
        models: [...models, { ...IMPORTED_MODEL, sha256: 'f'.repeat(64) }],
      })
    ).toBe('INVALID_MANIFEST');
    expect(
      rejectedCode({
        ...manifest,
        benchmarkReports: [...reports, BENCHMARK],
      })
    ).toBe('INVALID_MANIFEST');
  });
});
