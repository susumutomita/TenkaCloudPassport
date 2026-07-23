import { describe, expect, it } from 'bun:test';
import {
  createEmptyLocalModelManifest,
  type ImportedLocalModel,
  type LocalModelManifest,
  type ModelResourceRisk,
  type ModelResourceRiskLevel,
} from '../local-agent/local-model-manifest';
import {
  type ActivationAssessment,
  type ModelImportCandidate,
  ModelLifecycleError,
  REQUIRED_FREE_SPACE_BYTES,
} from '../local-agent/model-lifecycle';
import type { TrustedModelSource } from '../local-agent/trusted-model-catalog';
import {
  type TrustedModelAcquisitionDependencies,
  TrustedModelAcquisitionError,
  type TrustedModelDownloadPort,
  type TrustedModelDownloadProgress,
} from '../local-agent/trusted-model-download';
import {
  enableOnDeviceAi,
  mapOnDeviceAiErrorCode,
  onDeviceAiStatusFromManifest,
} from './trusted-model-enablement-controller';

/**
 * Follow-up F-FDRGS4: Mock framework・stub API は使わず、
 * `trusted-model-download.test.ts` / `use-local-model-management.test.ts` と
 * 同じ流儀で Port・Lifecycle の実挙動（byte 数・digest・失敗注入）を持つ
 * 手書き Fake を使う。
 */
const SOURCE: TrustedModelSource = {
  id: 'test-qwen',
  displayName: 'Test Qwen',
  license: 'Apache-2.0',
  licenseUrl: 'https://example.com/license',
  url: 'https://example.com/models/test-qwen.gguf',
  sha256: 'a'.repeat(64),
  sizeBytes: 1_000,
  source: 'https://example.com',
};

interface AcquisitionOptions {
  readonly availableBytes?: number;
  readonly startDownloadRejection?: Error;
  readonly outcomeKind?: 'completed' | 'cancelled';
  readonly resultSizeBytes?: number;
  readonly resultDigest?: string;
}

function createAcquisition(options: AcquisitionOptions = {}): {
  readonly dependencies: TrustedModelAcquisitionDependencies;
  readonly calls: {
    startDownload: number;
    sha256OfFile: number;
    readonly deleteFile: string[];
  };
} {
  const calls = {
    startDownload: 0,
    sha256OfFile: 0,
    deleteFile: [] as string[],
  };
  const downloadPort: TrustedModelDownloadPort = {
    async startDownload(source, downloadOptions) {
      calls.startDownload += 1;
      if (options.startDownloadRejection) throw options.startDownloadRejection;
      const sizeBytes = options.resultSizeBytes ?? source.sizeBytes;
      downloadOptions.onProgress?.({
        bytesWritten: sizeBytes,
        totalBytes: sizeBytes,
      });
      if ((options.outcomeKind ?? 'completed') === 'cancelled') {
        return { kind: 'cancelled' };
      }
      return {
        kind: 'completed',
        result: { uri: 'file:///cache/test-qwen.gguf', sizeBytes },
      };
    },
    async sha256OfFile() {
      calls.sha256OfFile += 1;
      return options.resultDigest ?? SOURCE.sha256;
    },
    async deleteFile(uri) {
      calls.deleteFile.push(uri);
    },
  };
  return {
    dependencies: {
      downloadPort,
      capacity: {
        availableDiskSpaceBytes: async () =>
          options.availableBytes ??
          SOURCE.sizeBytes + REQUIRED_FREE_SPACE_BYTES + 10_000_000,
      },
    },
    calls,
  };
}

function riskFor(level: ModelResourceRiskLevel): ModelResourceRisk {
  return {
    level,
    effectiveMemoryBytes: 4_000_000_000,
    estimatedWorkingSetBytes: 1_500_000_000,
    ratioPermille: level === 'blocked' ? 700 : level === 'caution' ? 500 : 200,
    reasons: [
      level === 'blocked'
        ? 'memory-ratio-blocked'
        : level === 'caution'
          ? 'memory-ratio-caution'
          : 'memory-ratio-supported',
    ],
  };
}

interface LifecycleOptions {
  readonly importFailure?: ModelLifecycleError;
  readonly riskLevel?: ModelResourceRiskLevel;
}

function createLifecycle(options: LifecycleOptions = {}): {
  readonly lifecycle: {
    importCandidate: (
      candidate: ModelImportCandidate
    ) => Promise<ImportedLocalModel>;
    assessActivation: (sha256: string) => Promise<ActivationAssessment>;
    activate: (sha256: string) => Promise<ImportedLocalModel>;
  };
  readonly events: string[];
} {
  const events: string[] = [];
  let imported: ImportedLocalModel | null = null;
  const riskLevel = options.riskLevel ?? 'supported';
  const risk = riskFor(riskLevel);
  return {
    events,
    lifecycle: {
      async importCandidate(candidate) {
        events.push('import');
        if (options.importFailure) throw options.importFailure;
        imported = {
          sha256: SOURCE.sha256,
          originalFileName: candidate.name,
          privateUri: `file:///private/local-models/${SOURCE.sha256}.gguf`,
          sizeBytes: candidate.sizeBytes,
          importedAt: '2026-07-23T00:00:00.000Z',
          metadata: { architecture: 'qwen', contextLength: 4_096, fileType: 2 },
          risk,
          configuration: { nCtx: 2_048, nGpuLayers: 99, nPredict: 96 },
        };
        return imported;
      },
      async assessActivation(sha256) {
        events.push('assess');
        if (!imported || imported.sha256 !== sha256) {
          throw new Error('assessActivation called before import in this Fake');
        }
        return {
          model: imported,
          risk,
          cautionConfirmationKey:
            riskLevel === 'caution' ? 'current-risk-key' : null,
        };
      },
      async activate(sha256) {
        events.push('activate');
        if (!imported || imported.sha256 !== sha256) {
          throw new Error('activate called before import in this Fake');
        }
        return imported;
      },
    },
  };
}

function manifestWith(
  models: readonly ImportedLocalModel[],
  activeModelSha256: string | null
): LocalModelManifest {
  return { ...createEmptyLocalModelManifest(), models, activeModelSha256 };
}

const IMPORTED_MODEL: ImportedLocalModel = {
  sha256: SOURCE.sha256,
  originalFileName: 'test-qwen.gguf',
  privateUri: `file:///private/local-models/${SOURCE.sha256}.gguf`,
  sizeBytes: SOURCE.sizeBytes,
  importedAt: '2026-07-23T00:00:00.000Z',
  metadata: { architecture: 'qwen', contextLength: 4_096, fileType: 2 },
  risk: riskFor('supported'),
  configuration: { nCtx: 2_048, nGpuLayers: 99, nPredict: 96 },
};

describe('オンデバイス AI 有効化（信頼済みダウンロード -> import -> activate の合成）', () => {
  it('同意・容量・ダウンロード・import・activate が全て成功したとき、活性化済み Model を返し一時 File を削除する', async () => {
    const { dependencies, calls } = createAcquisition();
    const { lifecycle, events } = createLifecycle();
    const refreshCalls: number[] = [];
    const cautionEvents: (ActivationAssessment | null)[] = [];
    const receivedProgress: TrustedModelDownloadProgress[] = [];

    const model = await enableOnDeviceAi({
      acquisition: dependencies,
      source: SOURCE,
      lifecycle,
      consented: true,
      signal: new AbortController().signal,
      onProgress: (progress) => receivedProgress.push(progress),
      onBeforeActivation: () => events.push('before-activation'),
      refresh: async () => {
        refreshCalls.push(refreshCalls.length);
      },
      setCautionAssessment: (value) => cautionEvents.push(value),
    });

    expect(model.sha256).toBe(SOURCE.sha256);
    expect(calls.startDownload).toBe(1);
    expect(calls.sha256OfFile).toBe(1);
    // code-reviewer 指摘（major、ストレージリーク）: 一時領域（`Paths.cache`
    // 相当）の File が import 成功後も残ると容量を二重消費するため、
    // 一時 File が掃除されることを固定する。
    // code-reviewer 指摘（2 回目、Cancel の実効性）: `importLocalModelCandidate`
    // は signal を受け取り実際に中断できるため、`onBeforeActivation` は
    // import 完了直後・中断不能な activate 開始直前に呼ばれる（ダウンロード
    // 完了直後ではない）ことを固定する。
    expect(events).toEqual([
      'import',
      'before-activation',
      'assess',
      'activate',
    ]);
    expect(calls.deleteFile).toEqual(['file:///cache/test-qwen.gguf']);
    expect(refreshCalls.length).toBe(3);
    expect(cautionEvents).toEqual([null]);
    expect(receivedProgress).toEqual([
      { bytesWritten: SOURCE.sizeBytes, totalBytes: SOURCE.sizeBytes },
    ]);
  });

  it('同意していないときは Download を試みずに CONSENT_REQUIRED を拒否する', async () => {
    const { dependencies, calls } = createAcquisition();
    const { lifecycle, events } = createLifecycle();

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: false,
        signal: new AbortController().signal,
        refresh: async () => undefined,
        setCautionAssessment: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(calls.startDownload).toBe(0);
    expect(events).toEqual([]);
  });

  it('空き容量が不足しているときは Download を試みずに INSUFFICIENT_STORAGE を拒否する', async () => {
    const { dependencies, calls } = createAcquisition({ availableBytes: 0 });
    const { lifecycle, events } = createLifecycle();

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: true,
        signal: new AbortController().signal,
        refresh: async () => undefined,
        setCautionAssessment: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STORAGE' });
    expect(calls.startDownload).toBe(0);
    expect(events).toEqual([]);
  });

  it('Download 自体が失敗したときは import を試みずに DOWNLOAD_FAILED を拒否する', async () => {
    const { dependencies } = createAcquisition({
      startDownloadRejection: new Error('connection reset'),
    });
    const { lifecycle, events } = createLifecycle();

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: true,
        signal: new AbortController().signal,
        refresh: async () => undefined,
        setCautionAssessment: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    expect(events).toEqual([]);
  });

  it('Download を中止したときは import を試みずに DOWNLOAD_CANCELLED を拒否する', async () => {
    const { dependencies } = createAcquisition({ outcomeKind: 'cancelled' });
    const { lifecycle, events } = createLifecycle();

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: true,
        signal: new AbortController().signal,
        refresh: async () => undefined,
        setCautionAssessment: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'DOWNLOAD_CANCELLED' });
    expect(events).toEqual([]);
  });

  it('ダウンロード内容の SHA-256 が期待値と一致しないときは import を試みずに INTEGRITY_MISMATCH を拒否する', async () => {
    const { dependencies, calls } = createAcquisition({
      resultDigest: 'f'.repeat(64),
    });
    const { lifecycle, events } = createLifecycle();

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: true,
        signal: new AbortController().signal,
        refresh: async () => undefined,
        setCautionAssessment: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'INTEGRITY_MISMATCH' });
    expect(events).toEqual([]);
    expect(calls.deleteFile).toEqual(['file:///cache/test-qwen.gguf']);
  });

  it('import 段階が失敗したとき（同じ内容の Model が既に取り込み済み）は activate を試みずに失敗を伝播しつつ一時 File を削除する', async () => {
    const { dependencies, calls } = createAcquisition();
    const failure = new ModelLifecycleError(
      'DUPLICATE_MODEL',
      '同じ内容の Local Model は既に取り込まれています。'
    );
    const { lifecycle, events } = createLifecycle({ importFailure: failure });

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: true,
        signal: new AbortController().signal,
        refresh: async () => undefined,
        setCautionAssessment: () => undefined,
      })
    ).rejects.toBe(failure);
    expect(events).toEqual(['import']);
    // code-reviewer 指摘（major、ストレージリーク）: import 失敗時も一時
    // File を消し忘れない（型付き失敗は上書きしない）。
    expect(calls.deleteFile).toEqual(['file:///cache/test-qwen.gguf']);
  });

  it('Resource Risk が caution のときは activate せず確認待ちにし、一時 File は削除する（会話 Agent は既存 Provider 状態のまま）', async () => {
    const { dependencies, calls } = createAcquisition();
    const { lifecycle, events } = createLifecycle({ riskLevel: 'caution' });
    const cautionEvents: (ActivationAssessment | null)[] = [];

    const model = await enableOnDeviceAi({
      acquisition: dependencies,
      source: SOURCE,
      lifecycle,
      consented: true,
      signal: new AbortController().signal,
      refresh: async () => undefined,
      setCautionAssessment: (value) => cautionEvents.push(value),
    });

    expect(model.risk.level).toBe('caution');
    expect(events).toEqual(['import', 'assess']);
    expect(cautionEvents.length).toBe(1);
    expect(cautionEvents[0]?.risk.level).toBe('caution');
    expect(calls.deleteFile).toEqual(['file:///cache/test-qwen.gguf']);
  });

  it('Resource Risk が blocked のときは import 済みでも activate せず RESOURCE_BLOCKED を拒否しつつ一時 File を削除する（会話 Agent は既存 Provider 状態のまま）', async () => {
    const { dependencies, calls } = createAcquisition();
    const { lifecycle, events } = createLifecycle({ riskLevel: 'blocked' });
    let refreshCalls = 0;

    await expect(
      enableOnDeviceAi({
        acquisition: dependencies,
        source: SOURCE,
        lifecycle,
        consented: true,
        signal: new AbortController().signal,
        refresh: async () => {
          refreshCalls += 1;
        },
        setCautionAssessment: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'RESOURCE_BLOCKED' });
    expect(events).toEqual(['import', 'assess']);
    expect(refreshCalls).toBe(2);
    expect(calls.deleteFile).toEqual(['file:///cache/test-qwen.gguf']);
  });
});

describe('Manifest からのオンデバイス AI 状態導出', () => {
  it('Manifest が無いときは not-acquired を返す', () => {
    expect(onDeviceAiStatusFromManifest(null, SOURCE)).toBe('not-acquired');
  });

  it('対象 sha256 の Model が Manifest に無いときは not-acquired を返す', () => {
    const manifest = manifestWith([], null);
    expect(onDeviceAiStatusFromManifest(manifest, SOURCE)).toBe('not-acquired');
  });

  it('対象 sha256 の Model が active のときは active を返す', () => {
    const manifest = manifestWith([IMPORTED_MODEL], IMPORTED_MODEL.sha256);
    expect(onDeviceAiStatusFromManifest(manifest, SOURCE)).toBe('active');
  });

  it('対象 sha256 の Model が Manifest にあるが active ではないときは imported-not-active を返す', () => {
    const manifest = manifestWith([IMPORTED_MODEL], null);
    expect(onDeviceAiStatusFromManifest(manifest, SOURCE)).toBe(
      'imported-not-active'
    );
  });
});

describe('オンデバイス AI 失敗の型分類', () => {
  it('TrustedModelAcquisitionError はそのコードのまま分類する', () => {
    const error = new TrustedModelAcquisitionError(
      'INSUFFICIENT_STORAGE',
      'no space'
    );
    expect(mapOnDeviceAiErrorCode(error)).toBe('INSUFFICIENT_STORAGE');
  });

  it('ModelLifecycleError はそのコードのまま分類する', () => {
    const error = new ModelLifecycleError('RESOURCE_BLOCKED', 'blocked');
    expect(mapOnDeviceAiErrorCode(error)).toBe('RESOURCE_BLOCKED');
  });

  it('未知の Error は MANIFEST_READ_FAILED として扱う（既存 errorCode 既定と同じ fail-closed）', () => {
    expect(mapOnDeviceAiErrorCode(new Error('unexpected'))).toBe(
      'MANIFEST_READ_FAILED'
    );
    expect(mapOnDeviceAiErrorCode('not an error')).toBe('MANIFEST_READ_FAILED');
  });
});
