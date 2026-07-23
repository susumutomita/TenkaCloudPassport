import { describe, expect, it } from 'bun:test';
import type { TrustedModelSource } from './trusted-model-catalog';
import {
  acquireTrustedModel,
  type TrustedModelAcquisitionDependencies,
  TrustedModelAcquisitionError,
  type TrustedModelDownloadOutcome,
  type TrustedModelDownloadPort,
  type TrustedModelDownloadProgress,
} from './trusted-model-download';

/**
 * Issue 104 PR #132（モデル入手経路）: Mock framework・stub API は使わず、
 * `model-lifecycle.test.ts` の `PrivateModelStore` と同じ流儀で Port の実挙動
 * （byte 数・digest・失敗注入）を持つ手書き Fake を使う。
 */
const SOURCE: TrustedModelSource = {
  id: 'test-model',
  displayName: 'Test Model',
  license: 'Apache-2.0',
  licenseUrl: 'https://example.com/license',
  url: 'https://example.com/models/test-model.gguf',
  sha256: 'a'.repeat(64),
  sizeBytes: 1_000,
  source: 'https://example.com',
};

class FakeDownloadPort implements TrustedModelDownloadPort {
  downloadedUri = 'file:///cache/test-model.gguf';
  resultSizeBytes: number;
  resultDigest: string;
  outcomeKind: 'completed' | 'cancelled' = 'completed';
  /**
   * code-reviewer 指摘（major）: Native adapter（`expo-trusted-model-download.native.ts`）は
   * abort 以外の genuine な転送失敗（回線切断・HTTP error）を reject で返しうる。
   * `outcomeKind` の 'cancelled'（resolve）とは別に、この reject 経路も
   * 手書き Fake で再現する。
   */
  startDownloadRejection: Error | null = null;
  sha256Failure = false;
  deleteFailure = false;
  startDownloadCalls = 0;
  deleteFileCalls: string[] = [];
  progressEvents: TrustedModelDownloadProgress[] = [];

  constructor(sizeBytes: number, digest: string) {
    this.resultSizeBytes = sizeBytes;
    this.resultDigest = digest;
  }

  async startDownload(
    _source: TrustedModelSource,
    options: {
      readonly onProgress?: (progress: TrustedModelDownloadProgress) => void;
      readonly signal?: AbortSignal;
    }
  ): Promise<TrustedModelDownloadOutcome> {
    this.startDownloadCalls += 1;
    if (this.startDownloadRejection) throw this.startDownloadRejection;
    const progress: TrustedModelDownloadProgress = {
      bytesWritten: this.resultSizeBytes,
      totalBytes: this.resultSizeBytes,
    };
    this.progressEvents.push(progress);
    options.onProgress?.(progress);
    if (this.outcomeKind === 'cancelled') return { kind: 'cancelled' };
    return {
      kind: 'completed',
      result: { uri: this.downloadedUri, sizeBytes: this.resultSizeBytes },
    };
  }

  async sha256OfFile(_uri: string): Promise<string> {
    if (this.sha256Failure) throw new Error('digest failed');
    return this.resultDigest;
  }

  async deleteFile(uri: string): Promise<void> {
    this.deleteFileCalls.push(uri);
    if (this.deleteFailure) throw new Error('delete failed');
  }
}

function dependenciesFor(
  downloadPort: TrustedModelDownloadPort,
  availableDiskSpaceBytes: number
): TrustedModelAcquisitionDependencies {
  return {
    downloadPort,
    capacity: {
      availableDiskSpaceBytes: () => Promise.resolve(availableDiskSpaceBytes),
    },
  };
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

describe('acquireTrustedModel（Issue 104 PR #132、信頼済み Model 取得の orchestration）', () => {
  it('明示同意が無ければ CONSENT_REQUIRED を投げ、Download を開始しない', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: false })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('CONSENT_REQUIRED');
    }
    expect(port.startDownloadCalls).toBe(0);
  });

  it('空き容量が Model Size + reserve 未満なら INSUFFICIENT_STORAGE を投げ、Download を開始しない', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    const deps = dependenciesFor(port, SOURCE.sizeBytes); // reserve 分足りない

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('INSUFFICIENT_STORAGE');
    }
    expect(port.startDownloadCalls).toBe(0);
  });

  it('空き容量確認が安全な整数でない値を返した場合も INSUFFICIENT_STORAGE として拒否する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    const deps: TrustedModelAcquisitionDependencies = {
      downloadPort: port,
      capacity: { availableDiskSpaceBytes: () => Promise.resolve(Number.NaN) },
    };

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('INSUFFICIENT_STORAGE');
    }
  });

  it('同意・容量・Download・SHA-256 すべて満たせば候補を返し、進捗コールバックを伝播する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    const deps = dependenciesFor(port, 200_000_000);
    const seenProgress: TrustedModelDownloadProgress[] = [];

    const candidate = await acquireTrustedModel(deps, SOURCE, {
      consented: true,
      onProgress: (progress) => seenProgress.push(progress),
    });

    expect(candidate).toEqual({
      name: 'test-model.gguf',
      uri: port.downloadedUri,
      sizeBytes: SOURCE.sizeBytes,
    });
    expect(seenProgress).toEqual(port.progressEvents);
    expect(port.deleteFileCalls).toEqual([]);
  });

  it('Download が cancelled で終わった場合、DOWNLOAD_CANCELLED を投げる', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    port.outcomeKind = 'cancelled';
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('DOWNLOAD_CANCELLED');
    }
  });

  it('code-reviewer 指摘（major）: startDownload 自体が reject した場合（回線切断・HTTP error 等）、素通りさせず DOWNLOAD_FAILED として分類する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    port.startDownloadRejection = new Error('network dropped');
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('DOWNLOAD_FAILED');
    }
  });

  it('startDownload が reject したときに signal が既に abort 済みなら DOWNLOAD_CANCELLED として分類する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    port.startDownloadRejection = new Error('aborted');
    const deps = dependenciesFor(port, 200_000_000);
    const controller = new AbortController();
    controller.abort();

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, {
        consented: true,
        signal: controller.signal,
      })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('DOWNLOAD_CANCELLED');
    }
  });

  it('ダウンロード結果の Size が期待と一致しない場合、DOWNLOAD_FAILED を投げ、一時 File を削除する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes - 1, SOURCE.sha256);
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('DOWNLOAD_FAILED');
    }
    expect(port.deleteFileCalls).toEqual([port.downloadedUri]);
  });

  it('SHA-256 の計算自体が失敗した場合、DOWNLOAD_FAILED を投げ、一時 File を削除する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.sha256);
    port.sha256Failure = true;
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('DOWNLOAD_FAILED');
    }
    expect(port.deleteFileCalls).toEqual([port.downloadedUri]);
  });

  it('期待 SHA-256 と一致しない場合、fail-closed で INTEGRITY_MISMATCH を投げ、一時 File を削除する（import へ進ませない）', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, 'b'.repeat(64));
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('INTEGRITY_MISMATCH');
    }
    expect(port.deleteFileCalls).toEqual([port.downloadedUri]);
  });

  it('一時 File の削除自体が失敗しても、元の型付き失敗（INTEGRITY_MISMATCH）を隠さない', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, 'b'.repeat(64));
    port.deleteFailure = true;
    const deps = dependenciesFor(port, 200_000_000);

    const error = await captureError(() =>
      acquireTrustedModel(deps, SOURCE, { consented: true })
    );

    expect(error).toBeInstanceOf(TrustedModelAcquisitionError);
    if (error instanceof TrustedModelAcquisitionError) {
      expect(error.code).toBe('INTEGRITY_MISMATCH');
    }
  });
});
