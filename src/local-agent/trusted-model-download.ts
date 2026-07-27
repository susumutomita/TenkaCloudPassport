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

export type TrustedModelDownloadOutcomeKind =
  | 'completed'
  | 'cancelled'
  | 'interrupted';

export interface TrustedModelDownloadResult {
  readonly uri: string;
  readonly sizeBytes: number;
}

export interface TrustedModelDownloadOutcome {
  readonly kind: TrustedModelDownloadOutcomeKind;
  /** `kind === 'completed'` のときだけ存在する。 */
  readonly result?: TrustedModelDownloadResult;
  /**
   * ADR-0052（実機 blocker 1/2、画面遷移・Background 遷移で DL が死ぬ）:
   * `kind === 'interrupted'` のときだけ意味を持つ。Native 側の実体は
   * `expo-file-system` の `DownloadPauseState`（`DownloadTask.savable()`）だが、
   * この層は platform 非依存のため opaque な値として扱い、`resumeDownload` へ
   * そのまま渡す以外の操作をしない。Native が pause する前に転送自体が失敗し、
   * savable な再開状態を得られなかった場合は `null`（呼び出し側は
   * `startDownload` から取り直す＝再ダウンロードにフォールバックする）。
   */
  readonly pauseState?: unknown;
}

/**
 * `/simplify` 指摘（reuse）: この shape が native adapter・test fake で個別に
 * 再定義されていた。ここを正本として export し、両方でこの型を再利用する。
 */
export type TrustedModelDownloadCallOptions = {
  readonly onProgress?: (progress: TrustedModelDownloadProgress) => void;
  readonly signal?: AbortSignal;
};

/**
 * Native 側の実体は `expo-file-system` の `DownloadTask`
 * （`sessionType: 'foreground'`・AppState 監視による `pause()`・
 * `DownloadPauseState` を介した `savable()`/`fromSavable()` 再開を Native が
 * 提供する、ADR-0052）を使う。ダウンロード先は Issue 18 の既存
 * `.incoming.gguf`（`LocalModelFileStore` が管理する private storage）とは
 * 別の一時領域（例: `Paths.cache`）に置き、検証済みの候補だけを
 * `ModelImportCandidate` として既存 `importCandidate` へ渡す
 * （`LocalModelFileStore` の「1 つの incoming file だけを持つ」既存契約を崩さない）。
 */
export interface TrustedModelDownloadPort {
  readonly startDownload: (
    source: TrustedModelSource,
    options: TrustedModelDownloadCallOptions
  ) => Promise<TrustedModelDownloadOutcome>;
  /**
   * ADR-0052: `startDownload`/`resumeDownload` が `'interrupted'` を返したとき、
   * 同じ options（onProgress・signal）で再開を試みる。呼び出し側
   * （`acquireTrustedModel`）は `outcome.pauseState` が非 `null` の間だけこれを
   * 呼び、`null` のときは `startDownload` から取り直す。
   */
  readonly resumeDownload: (
    pauseState: unknown,
    options: TrustedModelDownloadCallOptions
  ) => Promise<TrustedModelDownloadOutcome>;
  /**
   * ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: 一時領域に置いた
   * ダウンロード結果の MD5 をネイティブ計算する（managed store には触れない）。
   * 以前はここで純 TypeScript SHA-256（`sha256.ts`）を全量計算していたが、
   * 1 GiB 級 File では Hermes 上で数分〜十数分かかり、DL 100% 到達後もこの
   * 検証が終わるまで UI が「ダウンロード中」のまま固まって見えた
   * （既存 `trusted-model-enablement-controller.test.ts` の
   * 「Issue 138（実機 blocker A）」がまさにこの症状）。
   */
  readonly md5OfFile: (uri: string) => Promise<string>;
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

/**
 * code-reviewer 指摘（major、follow-up F-FDRGS4）: 呼び出し側
 *（`trusted-model-enablement-controller.ts`）が import 成功後も一時領域の
 * File を消し忘れると、private storage（copy 先）と `Paths.cache`（download 先）
 * の 2 か所に同じ Model が残り続け、容量を恒久的に二重消費する。ここで export し、
 * 呼び出し側が import・activate の成否を問わず同じ規約で掃除できるようにする。
 */
export async function deleteQuietly(
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
 * ADR-0052（実機 blocker 1/2）: Native が `'interrupted'` を返す限り、同じ
 * options（onProgress・signal）で再開を試み続ける。`pauseState` が無いとき
 * （pause 前に転送自体が失敗し savable な状態を得られなかった場合）は
 * `startDownload` から取り直す（=最初から再ダウンロード）。この loop 自体は
 * platform 非依存で、Native adapter が「いつ interrupted を返すか」（AppState
 * 監視で Background 遷移を検知した場合）だけを Native 側の責務として切り離す。
 */
async function attemptDownloadUntilSettled(
  downloadPort: TrustedModelDownloadPort,
  source: TrustedModelSource,
  callOptions: TrustedModelDownloadCallOptions
): Promise<TrustedModelDownloadOutcome> {
  let outcome = await downloadPort.startDownload(source, callOptions);
  while (outcome.kind === 'interrupted') {
    outcome =
      outcome.pauseState === null || outcome.pauseState === undefined
        ? await downloadPort.startDownload(source, callOptions)
        : await downloadPort.resumeDownload(outcome.pauseState, callOptions);
  }
  return outcome;
}

/**
 * 信頼済み Model を取得し、期待 MD5 と一致した候補だけを返す。
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

  const callOptions: TrustedModelDownloadCallOptions = {
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  let outcome: TrustedModelDownloadOutcome;
  try {
    outcome = await attemptDownloadUntilSettled(
      dependencies.downloadPort,
      source,
      callOptions
    );
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

  let md5: string;
  try {
    md5 = await dependencies.downloadPort.md5OfFile(result.uri);
  } catch {
    await deleteQuietly(dependencies.downloadPort, result.uri);
    throw new TrustedModelAcquisitionError(
      'DOWNLOAD_FAILED',
      'ダウンロードした Model を読み取れませんでした。'
    );
  }
  if (md5 !== source.md5) {
    // fail-closed: 期待 MD5 と一致しない File を import へ進ませない。
    await deleteQuietly(dependencies.downloadPort, result.uri);
    throw new TrustedModelAcquisitionError(
      'INTEGRITY_MISMATCH',
      'ダウンロードした Model の MD5 が一致しません。'
    );
  }

  return {
    name: deriveFileName(source),
    uri: result.uri,
    sizeBytes: result.sizeBytes,
  };
}
