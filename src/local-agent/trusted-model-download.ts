import { REQUIRED_FREE_SPACE_BYTES } from './model-lifecycle';
import type { TrustedModelSource } from './trusted-model-catalog';

/**
 * Issue 104 PR #132（Codex 指摘 major、モデル入手経路）: 信頼済み URL からの
 * Model 取得を「明示同意 → 容量確認 → ダウンロード → 期待 SHA-256 照合」の
 * 純粋な orchestration として実装する。ダウンロード自体（background・
 * pause/resume・進捗）は Native 側の Port（`TrustedModelDownloadPort`）に
 * 委譲し、ここでは fail-closed な手順の順序だけを保証する。検証済みの結果は
 * 呼び出し側が Issue 18 の既存 `LocalModelLifecycle.importCandidate` へそのまま
 * 渡す（private copy 以降の chunked SHA-256・GGUF 検証・Resource Risk・
 * manifest 更新は複製しない）。
 */

export type TrustedModelAcquisitionErrorCode =
  | 'CONSENT_REQUIRED'
  | 'INSUFFICIENT_STORAGE'
  | 'DOWNLOAD_CANCELLED'
  | 'DOWNLOAD_FAILED'
  | 'INTEGRITY_MISMATCH';

export class TrustedModelAcquisitionError extends Error {
  readonly code: TrustedModelAcquisitionErrorCode;

  constructor(code: TrustedModelAcquisitionErrorCode, message: string) {
    super(message);
    this.name = 'TrustedModelAcquisitionError';
    this.code = code;
  }
}

export interface TrustedModelDownloadProgress {
  readonly bytesWritten: number;
  /** サーバーが Content-Length を返さない場合は `null`（`source.sizeBytes` を代わりに使う）。 */
  readonly totalBytes: number | null;
}

export type TrustedModelDownloadOutcomeKind = 'completed' | 'cancelled';

export interface TrustedModelDownloadResult {
  readonly uri: string;
  readonly sizeBytes: number;
}

export interface TrustedModelDownloadOutcome {
  readonly kind: TrustedModelDownloadOutcomeKind;
  /** `kind === 'completed'` のときだけ存在する。 */
  readonly result?: TrustedModelDownloadResult;
}

/**
 * Native 側の実体は `expo-file-system` の `DownloadTask`（iOS
 * `sessionType: 'background'`・`pauseAsync`/`resumeAsync`・`DownloadPauseState`
 * による永続化を Native が提供する）を使う想定。ダウンロード先は Issue 18 の
 * 既存 `.incoming.gguf`（`LocalModelFileStore` が管理する private storage）とは
 * 別の一時領域（例: `Paths.cache`）に置き、検証済みの候補だけを
 * `ModelImportCandidate` として既存 `importCandidate` へ渡す
 * （`LocalModelFileStore` の「1 つの incoming file だけを持つ」既存契約を崩さない）。
 */
export interface TrustedModelDownloadPort {
  readonly startDownload: (
    source: TrustedModelSource,
    options: {
      readonly onProgress?: (progress: TrustedModelDownloadProgress) => void;
      readonly signal?: AbortSignal;
    }
  ) => Promise<TrustedModelDownloadOutcome>;
  /** 一時領域に置いたダウンロード結果の SHA-256 を計算する（managed store には触れない）。 */
  readonly sha256OfFile: (uri: string) => Promise<string>;
  /** 検証失敗・import 完了後に一時 File を消す。 */
  readonly deleteFile: (uri: string) => Promise<void>;
}

export interface TrustedModelAcquisitionCapacityCheck {
  readonly availableDiskSpaceBytes: () => Promise<number>;
}

export interface TrustedModelAcquisitionDependencies {
  readonly downloadPort: TrustedModelDownloadPort;
  readonly capacity: TrustedModelAcquisitionCapacityCheck;
}

export interface TrustedModelAcquisitionOptions {
  /**
   * fail-closed: 呼び出し側が明示的に `true` を渡さない限り取得を開始しない。
   * ライセンス・サイズ表示を経た明示同意を、呼び出し元（Settings 画面）が
   * ここへ渡す前に取得済みである前提。
   */
  readonly consented: boolean;
  readonly onProgress?: (progress: TrustedModelDownloadProgress) => void;
  readonly signal?: AbortSignal;
}

export interface AcquiredTrustedModelCandidate {
  readonly name: string;
  readonly uri: string;
  readonly sizeBytes: number;
}

/**
 * `/simplify` 指摘（reuse/simplification）: Native adapter
 * （`expo-trusted-model-download.native.ts`）が同じロジックを別実装で複製して
 * いた（fallback が `source.url` と `source.id` で食い違っていた）。ここへ
 * 一本化し、Native adapter はこの関数を呼ぶ。
 */
export function deriveFileName(source: TrustedModelSource): string {
  const lastSlash = source.url.lastIndexOf('/');
  const candidate =
    lastSlash === -1 ? source.url : source.url.slice(lastSlash + 1);
  return candidate.length > 0 ? candidate : `${source.id}.gguf`;
}

async function deleteQuietly(
  downloadPort: TrustedModelDownloadPort,
  uri: string
): Promise<void> {
  try {
    await downloadPort.deleteFile(uri);
  } catch {
    // 一時領域の掃除に失敗しても、既に投げた型付き失敗を上書きしない。
  }
}

/**
 * 信頼済み Model を取得し、期待 SHA-256 と一致した候補だけを返す。
 * 呼び出し側は戻り値をそのまま `LocalModelLifecycle.importCandidate` へ渡す。
 */
export async function acquireTrustedModel(
  dependencies: TrustedModelAcquisitionDependencies,
  source: TrustedModelSource,
  options: TrustedModelAcquisitionOptions
): Promise<AcquiredTrustedModelCandidate> {
  if (!options.consented) {
    throw new TrustedModelAcquisitionError(
      'CONSENT_REQUIRED',
      'Model の取得には明示同意が必要です。'
    );
  }

  const availableBytes = await dependencies.capacity.availableDiskSpaceBytes();
  if (
    !Number.isSafeInteger(availableBytes) ||
    availableBytes < source.sizeBytes + REQUIRED_FREE_SPACE_BYTES
  ) {
    throw new TrustedModelAcquisitionError(
      'INSUFFICIENT_STORAGE',
      'Model を安全に取得する空き容量がありません。'
    );
  }

  let outcome: TrustedModelDownloadOutcome;
  try {
    outcome = await dependencies.downloadPort.startDownload(source, {
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    // code-reviewer 指摘（major）: Native adapter は abort 以外の genuine な
    // 転送失敗（回線切断・HTTP error・timeout）を reject で返しうる
    // （`expo-trusted-model-download.native.ts` の `runDownload` 参照）。
    // ここで捕まえず素通りさせると、他の失敗経路と違って型付き
    // `TrustedModelAcquisitionError` にならず、呼び出し側の分岐が効かない。
    if (options.signal?.aborted) {
      throw new TrustedModelAcquisitionError(
        'DOWNLOAD_CANCELLED',
        'Model の取得を中止しました。'
      );
    }
    throw new TrustedModelAcquisitionError(
      'DOWNLOAD_FAILED',
      'Model のダウンロードに失敗しました。'
    );
  }

  if (outcome.kind === 'cancelled' || !outcome.result) {
    throw new TrustedModelAcquisitionError(
      'DOWNLOAD_CANCELLED',
      'Model の取得を中止しました。'
    );
  }

  const { result } = outcome;
  if (result.sizeBytes !== source.sizeBytes) {
    await deleteQuietly(dependencies.downloadPort, result.uri);
    throw new TrustedModelAcquisitionError(
      'DOWNLOAD_FAILED',
      'Model のダウンロードが完了しませんでした（Size が一致しません）。'
    );
  }

  let digest: string;
  try {
    digest = await dependencies.downloadPort.sha256OfFile(result.uri);
  } catch {
    await deleteQuietly(dependencies.downloadPort, result.uri);
    throw new TrustedModelAcquisitionError(
      'DOWNLOAD_FAILED',
      'ダウンロードした Model を読み取れませんでした。'
    );
  }
  if (digest !== source.sha256) {
    // fail-closed: 期待 SHA-256 と一致しない File を import へ進ませない。
    await deleteQuietly(dependencies.downloadPort, result.uri);
    throw new TrustedModelAcquisitionError(
      'INTEGRITY_MISMATCH',
      'ダウンロードした Model の SHA-256 が一致しません。'
    );
  }

  return {
    name: deriveFileName(source),
    uri: result.uri,
    sizeBytes: result.sizeBytes,
  };
}
