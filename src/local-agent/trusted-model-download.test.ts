import { describe, expect, it } from 'bun:test';
import type { TrustedModelSource } from './trusted-model-catalog';
import {
  acquireTrustedModel,
  type TrustedModelAcquisitionDependencies,
  TrustedModelAcquisitionError,
  type TrustedModelDownloadCallOptions,
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
  md5: 'b'.repeat(32),
  sizeBytes: 1_000,
  source: 'https://example.com',
};

// `/simplify` 指摘（reuse）: `trusted-model-download.ts` が export する
// `TrustedModelDownloadCallOptions` と同じ shape を個別に再定義していた。
type DownloadCallOptions = TrustedModelDownloadCallOptions;

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
  md5Failure = false;
  deleteFailure = false;
  startDownloadCalls = 0;
  resumeDownloadCalls: unknown[] = [];
  deleteFileCalls: string[] = [];
  progressEvents: TrustedModelDownloadProgress[] = [];
  /**
   * ADR-0052（実機 blocker 1/2、画面遷移・Background 遷移で DL が死ぬ）:
   * 設定した回数だけ最初の `startDownload` 呼び出しを `'interrupted'` として
   * 中断させ、指定した `pauseState` を返す。以降の `resumeDownload` 呼び出しで
   * 完了させる。
   */
  interruptCount = 0;
  interruptPauseState: unknown = 'pause-state-token';
  progressBeforeInterrupt: number | null = null;

  constructor(sizeBytes: number, digest: string) {
    this.resultSizeBytes = sizeBytes;
    this.resultDigest = digest;
  }

  // `/simplify` 指摘（simplification）: interrupt 分岐・complete/cancelled 分岐が
  // それぞれ個別に progress を組み立て・記録・通知していた（`bytesWritten` の
  // 値だけが異なる）。1 回だけ組み立て・記録・通知し、返す `kind` だけを分岐する。
  private settle(options: DownloadCallOptions): TrustedModelDownloadOutcome {
    const interrupting = this.interruptCount > 0;
    if (interrupting) this.interruptCount -= 1;
    const progress: TrustedModelDownloadProgress = {
      bytesWritten: interrupting
        ? (this.progressBeforeInterrupt ?? 0)
        : this.resultSizeBytes,
      totalBytes: this.resultSizeBytes,
    };
    this.progressEvents.push(progress);
    options.onProgress?.(progress);
    if (interrupting) {
      return { kind: 'interrupted', pauseState: this.interruptPauseState };
    }
    if (this.outcomeKind === 'cancelled') return { kind: 'cancelled' };
    return {
      kind: 'completed',
      result: { uri: this.downloadedUri, sizeBytes: this.resultSizeBytes },
    };
  }

  async startDownload(
    _source: TrustedModelSource,
    options: DownloadCallOptions
  ): Promise<TrustedModelDownloadOutcome> {
    this.startDownloadCalls += 1;
    if (this.startDownloadRejection) throw this.startDownloadRejection;
    return this.settle(options);
  }

  async resumeDownload(
    pauseState: unknown,
    options: DownloadCallOptions
  ): Promise<TrustedModelDownloadOutcome> {
    this.resumeDownloadCalls.push(pauseState);
    return this.settle(options);
  }

  async md5OfFile(_uri: string): Promise<string> {
    if (this.md5Failure) throw new Error('digest failed');
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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

  it('同意・容量・Download・MD5 すべて満たせば候補を返し、進捗コールバックを伝播する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes - 1, SOURCE.md5);
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

  it('MD5 の計算自体が失敗した場合、DOWNLOAD_FAILED を投げ、一時 File を削除する', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
    port.md5Failure = true;
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

  it('期待 MD5 と一致しない場合、fail-closed で INTEGRITY_MISMATCH を投げ、一時 File を削除する（import へ進ませない）', async () => {
    const port = new FakeDownloadPort(SOURCE.sizeBytes, 'c'.repeat(32));
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
    const port = new FakeDownloadPort(SOURCE.sizeBytes, 'c'.repeat(32));
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

  /**
   * ADR-0052（実機 blocker 1/2、Issue 152 実機フィードバック）: 画面遷移や
   * アプリの Background 遷移で Native の foreground URLSession が死んでも、
   * Native adapter は `'interrupted'`（`DownloadTask.savable()` 相当の
   * `pauseState` 付き）を返すことで、進捗を失わずに再開できる設計にする。
   * この loop（`attemptDownloadUntilSettled`）自体は platform 非依存のため、
   * 手書き Fake で「1 回中断してから再開で完了する」経路を port レベルで
   * 実行検証する。
   */
  describe('中断（画面遷移・Background 遷移）からの再開', () => {
    it('中断 → 再開で進捗が引き継がれ、resumeDownload が同じ pauseState で呼ばれる', async () => {
      const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
      port.interruptCount = 1;
      port.progressBeforeInterrupt = 400;
      const deps = dependenciesFor(port, 200_000_000);
      const seenProgress: TrustedModelDownloadProgress[] = [];

      const candidate = await acquireTrustedModel(deps, SOURCE, {
        consented: true,
        onProgress: (progress) => seenProgress.push(progress),
      });

      expect(candidate.sizeBytes).toBe(SOURCE.sizeBytes);
      expect(port.startDownloadCalls).toBe(1);
      expect(port.resumeDownloadCalls).toEqual(['pause-state-token']);
      expect(seenProgress).toEqual([
        { bytesWritten: 400, totalBytes: SOURCE.sizeBytes },
        { bytesWritten: SOURCE.sizeBytes, totalBytes: SOURCE.sizeBytes },
      ]);
    });

    it('中断が繰り返されても、そのたびに同じ options で resumeDownload を呼び続け、最終的に完了する', async () => {
      const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
      port.interruptCount = 3;
      const deps = dependenciesFor(port, 200_000_000);

      const candidate = await acquireTrustedModel(deps, SOURCE, {
        consented: true,
      });

      expect(candidate.sizeBytes).toBe(SOURCE.sizeBytes);
      expect(port.startDownloadCalls).toBe(1);
      expect(port.resumeDownloadCalls).toEqual([
        'pause-state-token',
        'pause-state-token',
        'pause-state-token',
      ]);
    });

    it('pauseState が無い中断（pause 前に転送自体が失敗）は resumeDownload ではなく startDownload から取り直す', async () => {
      const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
      port.interruptCount = 1;
      port.interruptPauseState = null;
      const deps = dependenciesFor(port, 200_000_000);

      const candidate = await acquireTrustedModel(deps, SOURCE, {
        consented: true,
      });

      expect(candidate.sizeBytes).toBe(SOURCE.sizeBytes);
      expect(port.startDownloadCalls).toBe(2);
      expect(port.resumeDownloadCalls).toEqual([]);
    });

    it('中断中に signal が abort 済みなら、resumeDownload 経由でも DOWNLOAD_CANCELLED として拒否する', async () => {
      const port = new FakeDownloadPort(SOURCE.sizeBytes, SOURCE.md5);
      port.interruptCount = 1;
      const controller = new AbortController();
      const deps = dependenciesFor(port, 200_000_000);

      const originalResume = port.resumeDownload.bind(port);
      port.resumeDownload = async (pauseState, options) => {
        controller.abort();
        return originalResume(pauseState, options);
      };
      port.outcomeKind = 'cancelled';

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
  });
});
