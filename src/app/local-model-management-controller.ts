import type { ImportedLocalModel } from '../local-agent/local-model-manifest';
import {
  type ActivationAssessment,
  type LocalModelLifecycle,
  type ModelImportCandidate,
  ModelLifecycleError,
  type TrustedImportVerification,
} from '../local-agent/model-lifecycle';
import { LocalDataAccessBlockedError } from './local-data-control';
import type {
  LocalModelMutationLease,
  LocalModelMutationLeasePort,
} from './local-model-mutation-lease';

type ActivationLifecycle = Pick<
  LocalModelLifecycle,
  'assessActivation' | 'activate'
>;

type ImportLifecycle = Pick<LocalModelLifecycle, 'importCandidate'>;

export interface LocalModelOperationLane {
  readonly run: (operation: () => Promise<void>) => boolean;
  readonly isPending: () => boolean;
  readonly dispose: () => void;
}

interface LocalModelOperationObserver {
  readonly onStart: () => void;
  readonly onError: (error: unknown) => void;
  readonly onFinish: () => void;
}

/** React render の間でも共有する単一 mutation lane。dispose 後は state callback を止める。 */
export function createLocalModelOperationLane(
  observer: LocalModelOperationObserver
): LocalModelOperationLane {
  let inFlight = false;
  let disposed = false;
  return {
    run(operation) {
      if (inFlight || disposed) return false;
      inFlight = true;
      observer.onStart();
      void operation()
        .catch((error: unknown) => {
          if (!disposed) observer.onError(error);
        })
        .finally(() => {
          inFlight = false;
          if (!disposed) observer.onFinish();
        });
      return true;
    },
    isPending() {
      return inFlight;
    },
    dispose() {
      disposed = true;
    },
  };
}

/**
 * 実機 blocker（owner フィードバック）: `LocalModelContextLeaseRegistry.acquireMutation()`
 * の失敗は常に `LocalDataAccessBlockedError` であり、その大半（起動確認待ち・他操作が
 * Model を使用中）は待てば・別操作が終われば自然に解消する一時的な衝突で、Native
 * Context 自体が壊れたわけではない。Native Composition
 * （`default-local-model-management.native.ts`）が一律 `NATIVE_CONTEXT_UNAVAILABLE`
 * （「App を完全に終了して再起動してください」）へ丸めていたのを、理由ごとに
 * 分けて非致命的な文言へ変える。Native import を持たないためここへ置き、
 * `use-local-model-management.test.ts` から直接実行検証できる。
 */
export function mutationLeaseBusyError(error: unknown): ModelLifecycleError {
  if (!(error instanceof LocalDataAccessBlockedError)) {
    return new ModelLifecycleError(
      'MODEL_CONTEXT_BUSY',
      'Local Model の Process lease を取得できませんでした。'
    );
  }
  if (error.reason === 'recovery') {
    return new ModelLifecycleError(
      'STARTUP_RECOVERY_PENDING',
      '起動時の復旧確認が完了するまで Local Model を操作できません。'
    );
  }
  return new ModelLifecycleError(
    'MODEL_CONTEXT_BUSY',
    `Local Model は他の処理（${error.reason}）で使用中のため操作できません。`
  );
}

/** Native Context と排他な Process lease を mutation の最終 refresh まで保持する。 */
export async function withLocalModelMutationLease<T>(
  mutationLeases: LocalModelMutationLeasePort,
  operation: () => Promise<T>
): Promise<T> {
  const lease: LocalModelMutationLease = mutationLeases.acquireMutation();
  try {
    return await operation();
  } finally {
    lease.release();
  }
}

interface ImportLocalModelCandidateInput {
  readonly lifecycle: ImportLifecycle;
  readonly candidate: ModelImportCandidate;
  /**
   * ADR-0046（実機 blocker、Issue 152）: 手動 GGUF import（file picker 経由）は
   * 常に signal を渡し、Owner の Cancel・画面 unmount のどちらでも中断できる
   * （既存契約、変更なし）。一方、信頼済み Model 取得の仕上げフェーズ
   * （`trusted-model-enablement-controller.ts` の `enableOnDeviceAi`）は
   * ダウンロード完了後、意図的に signal を渡さずにこの関数を呼ぶ
   * （構造的に中断不能にするため）。`lifecycle.importCandidate` 自体の
   * signal 引数が optional なため、ここでも optional にする。
   */
  readonly signal?: AbortSignal;
  /**
   * ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: 信頼済みダウンロードの
   * 取り込みだけが渡す。`lifecycle.importCandidate` へそのまま転送する
   * （`model-lifecycle.ts` の `TrustedImportVerification` 参照）。
   */
  readonly trustedVerification?: TrustedImportVerification;
  readonly refresh: () => Promise<void>;
  readonly onImported: () => void;
}

/** 失敗時も即時 reconcile を試みるが、refresh failure で元の型付き失敗を上書きしない。 */
export async function importLocalModelCandidate(
  input: ImportLocalModelCandidateInput
): Promise<ImportedLocalModel> {
  let imported: ImportedLocalModel;
  try {
    imported = await input.lifecycle.importCandidate(
      input.candidate,
      input.signal,
      input.trustedVerification
    );
  } catch (error: unknown) {
    try {
      await input.refresh();
    } catch {
      // Lifecycle の元の型付き失敗を維持し、次回 load / restart の reconcile に委ねる。
    }
    throw error;
  }
  input.onImported();
  await input.refresh();
  return imported;
}

export interface PerformLocalModelActivationInput {
  readonly lifecycle: ActivationLifecycle;
  readonly sha256: string;
  readonly refresh: () => Promise<void>;
  readonly setCautionAssessment: (
    assessment: ActivationAssessment | null
  ) => void;
}

/** Risk persistence と画面 refresh を同じ手順に固定し、古い判定根拠を表示しない。 */
export async function performLocalModelActivation(
  input: PerformLocalModelActivationInput
): Promise<void> {
  const assessment = await input.lifecycle.assessActivation(input.sha256);
  await input.refresh();
  if (assessment.risk.level === 'caution') {
    input.setCautionAssessment(assessment);
    return;
  }
  if (assessment.risk.level === 'blocked') {
    throw new ModelLifecycleError(
      'RESOURCE_BLOCKED',
      '現在の端末状態では Local Model を安全に開始できません。'
    );
  }
  try {
    await input.lifecycle.activate(input.sha256);
  } catch (error: unknown) {
    await input.refresh();
    throw error;
  }
  input.setCautionAssessment(null);
  await input.refresh();
}

interface ConfirmCautionActivationInput {
  readonly lifecycle: ActivationLifecycle;
  readonly assessment: ActivationAssessment;
  readonly refresh: () => Promise<void>;
  readonly setCautionAssessment: (
    assessment: ActivationAssessment | null
  ) => void;
}

export async function confirmLocalModelCaution(
  input: ConfirmCautionActivationInput
): Promise<ImportedLocalModel> {
  try {
    const activated = await input.lifecycle.activate(
      input.assessment.model.sha256,
      input.assessment.cautionConfirmationKey ?? undefined
    );
    input.setCautionAssessment(null);
    await input.refresh();
    return activated;
  } catch (error: unknown) {
    await input.refresh();
    throw error;
  }
}
