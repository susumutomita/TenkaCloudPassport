import {
  type DownloadPauseState,
  DownloadTask,
  File,
  Paths,
} from 'expo-file-system';
import { AppState, type AppStateStatus } from 'react-native';
import { nativeMd5OfFile } from './native-md5.native';
import type { TrustedModelSource } from './trusted-model-catalog';
import {
  deriveFileName,
  type TrustedModelDownloadCallOptions,
  type TrustedModelDownloadOutcome,
  type TrustedModelDownloadPort,
  type TrustedModelDownloadProgress,
} from './trusted-model-download';

/**
 * Issue 104 PR #132（Codex 指摘 major、モデル入手経路）: `expo-file-system` の
 * `DownloadTask`（進捗コールバック・`AbortSignal` 経由の Cancel を Native が
 * 提供する）を前面(foreground)セッションで使う（Issue 138: background だと 100%
 * 到達後に完了 Promise が解決せず固まったため。`runSession` のコメント参照）。
 * ダウンロード先は `Paths.cache`（Issue 18 の既存 `.incoming.gguf` とは別領域）に
 * 置き、検証済みの結果だけを呼び出し側が `LocalModelLifecycle.importCandidate`
 * へ渡す（`LocalModelFileStore` の「1 つの incoming file だけを持つ」既存契約を
 * 崩さない）。
 *
 * ADR-0052（実機 blocker 1/2、画面遷移・Background 遷移で DL が死ぬ）:
 * foreground セッションは AppState が `'active'` でなくなると転送を続けられない。
 * `AppState` を監視し、`'active'` から離れる遷移を検知した時点で `task.pause()`
 * を要求して `DownloadTask.savable()` を取得し、`'active'` へ戻ったら
 * `DownloadTask.fromSavable()` で再開する。pause が転送停止に間に合わず reject
 * になった場合（`savable()` を得られない）は、`'active'` へ戻ってから最初から
 * 再ダウンロードする（`resumeDownload` ではなく `startDownload` を呼び直す）。
 */

// `/simplify` 指摘（reuse）: この shape は `trusted-model-download.ts` が
// export する `TrustedModelDownloadCallOptions` と同じもの。以前はここで
// 個別に再定義していた。
type CallOptions = TrustedModelDownloadCallOptions;

/** `/simplify` 指摘（reuse）: `expo-model-file-store.native.ts` の同名 helper と重複していたため、この native 専用ファイル内でも 1 箇所に集約する。 */
function deleteIfPresent(file: File): void {
  if (file.exists) file.delete();
}

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

function nativeDownloadOptions(options: CallOptions): {
  readonly onProgress?: (progress: {
    bytesWritten: number;
    totalBytes: number;
  }) => void;
  readonly signal?: AbortSignal;
} {
  return {
    ...(options.onProgress
      ? {
          // `/simplify` 指摘（simplification）: 以前はここで `progress` を
          // 同じ 2 field のまま複製してから `toProgress` へ渡していた
          // （無意味な copy）。`progress` の shape は既に `toProgress` の
          // 引数と互換なので直接渡す。
          onProgress: (progress: {
            bytesWritten: number;
            totalBytes: number;
          }) => {
            options.onProgress?.(toProgress(progress));
          },
        }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

function isForeground(): boolean {
  return AppState.currentState === 'active';
}

/**
 * `signal` が既に abort 済み、または既に foreground なら即座に解決する。
 * それ以外は次に `'active'` へ遷移するか、`signal` が abort されるまで待つ
 * （abort 時は「中断されたので待つのをやめる」ことだけが目的で、呼び出し側が
 * 直後に `signal.aborted` を見て cancelled 判定する）。
 */
function waitForForeground(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || isForeground()) return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') settle();
    });
    const onAbort = (): void => settle();
    function settle(): void {
      subscription.remove();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * `'active'` から離れる遷移を検知した時点で即座に `pause()` を要求する。
 * Native 側が転送を止める前に呼べるよう、`'inactive'`（iOS の permission
 * dialog・share sheet 等で一瞬発生するものも含む）でも `'background'` と同じく
 * 反応する。
 */
function attachBackgroundPause(task: DownloadTask): { remove(): void } {
  return AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next !== 'active' && task.state === 'active') task.pause();
  });
}

async function settleSession(
  task: DownloadTask,
  start: (task: DownloadTask) => Promise<File | null>,
  options: CallOptions
): Promise<TrustedModelDownloadOutcome> {
  const pauseSubscription = attachBackgroundPause(task);
  try {
    let downloaded: File | null;
    try {
      downloaded = await start(task);
    } catch (error: unknown) {
      if (options.signal?.aborted) return { kind: 'cancelled' };
      if (!isForeground()) {
        // ADR-0052: pause() が転送停止に間に合わず reject になった。Background
        // 起因の中断とみなし、savable な再開状態を得られなかったとして
        // 'interrupted'（pauseState なし）を返す。呼び出し側は `'active'` へ
        // 戻ってから `startDownload` を呼び直す（最初から再ダウンロード）。
        return { kind: 'interrupted' };
      }
      throw error;
    } finally {
      pauseSubscription.remove();
    }
    if (downloaded === null) {
      // pause() 経由で完了した。savable() は 'paused' 状態でのみ呼べる。
      return { kind: 'interrupted', pauseState: task.savable() };
    }
    const info = downloaded.info();
    if (!info.exists || typeof info.size !== 'number') {
      throw new Error('Downloaded model file is unavailable.');
    }
    return {
      kind: 'completed',
      result: { uri: downloaded.uri, sizeBytes: info.size },
    };
  } finally {
    task.release();
  }
}

/**
 * `/simplify` 指摘（simplification）: `startDownloadSession`/`resumeDownloadSession`
 * が「foreground を待つ→abort 済みなら cancelled→`DownloadTask` を組み立てて
 * `settleSession` へ渡す」という同じ前段を複製していた。`DownloadTask` の
 * 組み立て方（`new DownloadTask(...)` か `DownloadTask.fromSavable(...)` か）
 * だけを呼び出し側から受け取り、前段の判定は 1 箇所にまとめる。
 */
async function runSession(
  buildTask: () => DownloadTask,
  start: (task: DownloadTask) => Promise<File | null>,
  options: CallOptions
): Promise<TrustedModelDownloadOutcome> {
  await waitForForeground(options.signal);
  if (options.signal?.aborted) return { kind: 'cancelled' };
  return settleSession(buildTask(), start, options);
}

function startDownloadSession(
  source: TrustedModelSource,
  options: CallOptions
): Promise<TrustedModelDownloadOutcome> {
  return runSession(
    () => {
      const destination = cacheDestinationFile(source);
      deleteIfPresent(destination);
      return new DownloadTask(
        source.url,
        destination,
        nativeDownloadOptions(options)
      );
    },
    (t) => t.downloadAsync(),
    options
  );
}

function resumeDownloadSession(
  pauseState: DownloadPauseState,
  options: CallOptions
): Promise<TrustedModelDownloadOutcome> {
  return runSession(
    () => DownloadTask.fromSavable(pauseState, nativeDownloadOptions(options)),
    (t) => t.resumeAsync(),
    options
  );
}

/** Expo SDK 57 の `DownloadTask` / `File` API による信頼済み Model の Download Port。 */
export function createExpoTrustedModelDownloadPort(): TrustedModelDownloadPort {
  return {
    startDownload: startDownloadSession,

    resumeDownload(pauseState, options) {
      return resumeDownloadSession(pauseState as DownloadPauseState, options);
    },

    md5OfFile: nativeMd5OfFile,

    async deleteFile(uri) {
      deleteIfPresent(new File(uri));
    },
  };
}
