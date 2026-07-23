import { DownloadTask, File, FileMode, Paths } from 'expo-file-system';
import { sha256HexFromSource } from './sha256';
import type { TrustedModelSource } from './trusted-model-catalog';
import {
  deriveFileName,
  type TrustedModelDownloadOutcome,
  type TrustedModelDownloadPort,
  type TrustedModelDownloadProgress,
} from './trusted-model-download';

/**
 * Issue 104 PR #132（Codex 指摘 major、モデル入手経路）: `expo-file-system` の
 * `DownloadTask`（iOS `sessionType: 'background'`・進捗コールバック・
 * `AbortSignal` 経由の Cancel を Native が提供する）を使う。ダウンロード先は
 * `Paths.cache`（Issue 18 の既存 `.incoming.gguf` とは別領域）に置き、検証済みの
 * 結果だけを呼び出し側が `LocalModelLifecycle.importCandidate` へ渡す
 * （`LocalModelFileStore` の「1 つの incoming file だけを持つ」既存契約を
 * 崩さない）。`DownloadTask.savable()`/`fromSavable()` によるアプリ再起動を
 * 跨いだ再開の永続化は、Settings 側の同意 UI・進捗表示と合わせて別 PR で扱う
 * （`docs/design/2026-07-23-on-device-conversation-agent.md` 参照）。
 */

function cacheDestinationFile(source: TrustedModelSource): File {
  // `/simplify` 指摘（reuse/simplification）: ファイル名の導出は
  // `trusted-model-download.ts` の `deriveFileName` に一本化する（以前は
  // ここで別実装を複製し、fallback が `source.id` と `source.url` で食い違って
  // いた）。
  return new File(Paths.cache, deriveFileName(source));
}

function toProgress(
  progress: TrustedModelDownloadProgress
): TrustedModelDownloadProgress {
  return {
    bytesWritten: progress.bytesWritten,
    totalBytes:
      progress.totalBytes !== null && progress.totalBytes >= 0
        ? progress.totalBytes
        : null,
  };
}

async function runDownload(
  destination: File,
  source: TrustedModelSource,
  options: {
    readonly onProgress?: (progress: TrustedModelDownloadProgress) => void;
    readonly signal?: AbortSignal;
  }
): Promise<TrustedModelDownloadOutcome> {
  const task = new DownloadTask(source.url, destination, {
    sessionType: 'background',
    ...(options.onProgress
      ? {
          onProgress: (progress: {
            bytesWritten: number;
            totalBytes: number;
          }) => {
            options.onProgress?.(
              toProgress({
                bytesWritten: progress.bytesWritten,
                totalBytes: progress.totalBytes,
              })
            );
          },
        }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  let downloaded: File | null;
  try {
    downloaded = await task.downloadAsync();
  } catch (error: unknown) {
    if (options.signal?.aborted) return { kind: 'cancelled' };
    throw error;
  } finally {
    task.release();
  }
  if (downloaded === null) return { kind: 'cancelled' };
  const info = downloaded.info();
  if (!info.exists || typeof info.size !== 'number') {
    throw new Error('Downloaded model file is unavailable.');
  }
  return {
    kind: 'completed',
    result: { uri: downloaded.uri, sizeBytes: info.size },
  };
}

/** Expo SDK 57 の `DownloadTask` / `File` API による信頼済み Model の Download Port。 */
export function createExpoTrustedModelDownloadPort(): TrustedModelDownloadPort {
  return {
    startDownload(source, options) {
      const destination = cacheDestinationFile(source);
      if (destination.exists) destination.delete();
      return runDownload(destination, source, options);
    },

    async sha256OfFile(uri) {
      const file = new File(uri);
      if (!file.exists) throw new Error('Downloaded model file is missing.');
      const info = file.info();
      if (!info.exists || typeof info.size !== 'number') {
        throw new Error('Downloaded model file is unavailable.');
      }
      const handle = file.open(FileMode.ReadOnly);
      try {
        return await sha256HexFromSource({
          sizeBytes: info.size,
          async read(offset, length) {
            handle.offset = offset;
            return handle.readBytes(length);
          },
        });
      } finally {
        handle.close();
      }
    },

    async deleteFile(uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}
