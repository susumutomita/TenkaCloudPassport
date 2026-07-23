import type {
  ImportedLocalModel,
  LocalModelManifest,
} from '../local-agent/local-model-manifest';
import {
  type ActivationAssessment,
  type LocalModelLifecycle,
  ModelLifecycleError,
} from '../local-agent/model-lifecycle';
import type { TrustedModelSource } from '../local-agent/trusted-model-catalog';
import {
  acquireTrustedModel,
  deleteQuietly,
  type TrustedModelAcquisitionDependencies,
  TrustedModelAcquisitionError,
  type TrustedModelAcquisitionErrorCode,
  type TrustedModelDownloadProgress,
} from '../local-agent/trusted-model-download';
import {
  importLocalModelCandidate,
  performLocalModelActivation,
} from './local-model-management-controller';

/**
 * Follow-up F-FDRGS4（Issue 104 PR #132 の続き）: Settings の「オンデバイス AI を
 * 有効化」ボタン 1 つの背後にある合成を、既存の 3 契約
 *（`trusted-model-download.ts` の明示同意済みダウンロード、`model-lifecycle.ts` の
 * import・Resource Risk Gate 込み activate）をそのまま呼ぶだけの純関数として実装する。
 * 新しい Provider 選択・新しい Resource Gate は作らない。`useLocalModelManagement`
 *（Hook、React render harness が無いためこの Repo では直接実行テストしない）は
 * この関数を呼ぶだけの薄い glue に留める。
 */

type EnablementLifecycle = Pick<
  LocalModelLifecycle,
  'importCandidate' | 'assessActivation' | 'activate'
>;

export interface EnableOnDeviceAiInput {
  readonly acquisition: TrustedModelAcquisitionDependencies;
  readonly source: TrustedModelSource;
  readonly lifecycle: EnablementLifecycle;
  readonly signal: AbortSignal;
  /**
   * fail-closed: 呼び出し元（Settings 画面）が同意 UI を経て明示的に `true` を
   * 渡さない限りダウンロードを開始しない。UI 層の合意だけに頼らず、この関数
   * 自体の入口でも同じ契約を強制する。
   */
  readonly consented: boolean;
  readonly onProgress?: (progress: TrustedModelDownloadProgress) => void;
  /**
   * code-reviewer 指摘（Cancel ボタンの実効性、2 回目のレビューで修正）:
   * `assessActivation`/`activate` は `AbortSignal` を受け取らず中断できない
   * 区間だが、直前の `importLocalModelCandidate` は `signal` を渡しており、
   * copy・digest の各チェックポイントで実際に中断できる。呼び出し元
   *（Settings 画面）が Cancel 導線を隠すタイミングを、中断可能な import 完了
   * 直後・中断不能な activate 開始直前へ正確に合わせられるよう、import 成功
   * 直後に一度だけ呼ぶ（ダウンロード完了直後ではない）。
   */
  readonly onBeforeActivation?: () => void;
  readonly refresh: () => Promise<void>;
  readonly setCautionAssessment: (
    assessment: ActivationAssessment | null
  ) => void;
}

/**
 * 明示同意済みダウンロード -> 既存 GGUF import -> 既存 activate（Resource Risk
 * Gate 込み）を順に実行する。どの段階で失敗しても `activeModelSha256` は変更
 * されないため、既存の Provider 状態（Rules、または別の既取得 Local Model）は
 * そのまま維持される（fail-closed）。Resource Risk が `caution` のときは
 * `activate` を呼ばず確認待ちにする（既存 `performLocalModelActivation` の
 * 契約をそのまま使う）。
 *
 * code-reviewer 指摘（major、ストレージリーク）: `acquireTrustedModel` は
 * ダウンロード結果を一時領域（Native 実装では `Paths.cache`）に置いたまま返す。
 * `importLocalModelCandidate` はこれを private storage へ **Copy**（move ではない）
 * するため、一時領域の File を明示的に消さない限り、成功時も import 失敗時も
 * 同じ Model が 2 か所（一時領域 + private storage）に残り、容量を恒久的に
 * 二重消費する。import・activate の成否を問わず一時領域を掃除する
 *（削除失敗は握りつぶし、元の型付き失敗を上書きしない）。
 */
export async function enableOnDeviceAi(
  input: EnableOnDeviceAiInput
): Promise<ImportedLocalModel> {
  const acquired = await acquireTrustedModel(input.acquisition, input.source, {
    consented: input.consented,
    signal: input.signal,
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
  });
  try {
    const imported = await importLocalModelCandidate({
      lifecycle: input.lifecycle,
      candidate: acquired,
      signal: input.signal,
      refresh: input.refresh,
      onImported: () => undefined,
    });
    input.onBeforeActivation?.();
    await performLocalModelActivation({
      lifecycle: input.lifecycle,
      sha256: imported.sha256,
      refresh: input.refresh,
      setCautionAssessment: input.setCautionAssessment,
    });
    return imported;
  } finally {
    await deleteQuietly(input.acquisition.downloadPort, acquired.uri);
  }
}

export type OnDeviceAiStatus =
  | 'not-acquired'
  | 'active'
  | 'imported-not-active';

/**
 * 新しい state を持たず、既存 Manifest から「未取得 / 取得済み(使用中) /
 * 取得済み(未使用、caution 確認待ちまたは blocked)」を導出する。Settings 画面は
 * この結果と既存 `LocalModelCard`（caution/blocked の詳細表示）を組み合わせる。
 */
export function onDeviceAiStatusFromManifest(
  manifest: LocalModelManifest | null,
  source: TrustedModelSource
): OnDeviceAiStatus {
  if (!manifest) return 'not-acquired';
  const acquired = manifest.models.some(
    (model) => model.sha256 === source.sha256
  );
  if (!acquired) return 'not-acquired';
  return manifest.activeModelSha256 === source.sha256
    ? 'active'
    : 'imported-not-active';
}

export type OnDeviceAiErrorCode =
  | TrustedModelAcquisitionErrorCode
  | ModelLifecycleError['code'];

/**
 * `enableOnDeviceAi` の失敗を、既存 Settings 画面の `modelError()` 表示と同じ
 * 粒度（型付きコードの文字列）へ分類する。未知の Error は既存 hook の
 * `errorCode()` 既定と同じ `MANIFEST_READ_FAILED` へ fail-closed に倒す。
 */
export function mapOnDeviceAiErrorCode(error: unknown): OnDeviceAiErrorCode {
  if (error instanceof TrustedModelAcquisitionError) return error.code;
  if (error instanceof ModelLifecycleError) return error.code;
  return 'MANIFEST_READ_FAILED';
}
