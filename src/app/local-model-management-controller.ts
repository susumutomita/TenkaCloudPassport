import type { ImportedLocalModel } from '../local-agent/local-model-manifest';
import {
  type ActivationAssessment,
  type LocalModelLifecycle,
  type ModelImportCandidate,
  ModelLifecycleError,
} from '../local-agent/model-lifecycle';
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
  readonly signal: AbortSignal;
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
      input.signal
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
