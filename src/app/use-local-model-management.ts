import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AgentModelProvider,
  AgentModelProviderError,
} from '../domain/agent-model-provider';
import type { LocalModelManagementPort } from '../local-agent/local-model-management';
import type {
  ImportedLocalModel,
  LocalModelManifest,
} from '../local-agent/local-model-manifest';
import {
  type ActivationAssessment,
  type ModelImportCandidate,
  ModelLifecycleError,
} from '../local-agent/model-lifecycle';
import {
  confirmLocalModelCaution,
  createLocalModelOperationLane,
  importLocalModelCandidate,
  performLocalModelActivation,
  withLocalModelMutationLease,
} from './local-model-management-controller';
import type { LocalModelMutationLeasePort } from './local-model-mutation-lease';

export interface LocalModelManagementView {
  readonly available: boolean;
  readonly busy: boolean;
  readonly candidate: ModelImportCandidate | null;
  readonly candidateAvailableStorageBytes: number | null;
  readonly candidateSelectionBlocked: boolean;
  readonly manifest: LocalModelManifest | null;
  readonly cautionAssessment: ActivationAssessment | null;
  readonly importInProgress: boolean;
  readonly pendingProviderOperation:
    | 'import'
    | 'activate'
    | 'confirm-caution'
    | 'unload'
    | 'delete'
    | null;
  readonly errorCode:
    | ModelLifecycleError['code']
    | 'BENCHMARK_WRITE_FAILED'
    | null;
  readonly reload: () => void;
  readonly selectCandidate: () => void;
  readonly confirmImport: () => void;
  readonly cancelImport: () => void;
  readonly cancelCandidate: () => void;
  readonly activate: (sha256: string) => void;
  readonly confirmCautionActivation: () => void;
  readonly unload: () => void;
  readonly deleteModel: (sha256: string) => void;
  readonly confirmProviderOperation: () => void;
  readonly cancelProviderOperation: () => void;
}

interface UseLocalModelManagementInput {
  readonly management: LocalModelManagementPort | null;
  readonly mutationLeases: LocalModelMutationLeasePort | null;
  readonly fallbackProvider: AgentModelProvider;
  readonly waitForNativeTeardown: () => Promise<void>;
  readonly hasActiveProviderRun: boolean;
  readonly ready: boolean;
}

type PendingProviderOperation =
  | { readonly kind: 'import'; readonly candidate: ModelImportCandidate }
  | { readonly kind: 'activate'; readonly sha256: string }
  | { readonly kind: 'confirm-caution' }
  | { readonly kind: 'unload' }
  | { readonly kind: 'delete'; readonly sha256: string };

function errorCode(error: unknown): ModelLifecycleError['code'] {
  if (error instanceof AgentModelProviderError && error.nativeLaneQuarantined) {
    return 'NATIVE_CONTEXT_UNAVAILABLE';
  }
  return error instanceof ModelLifecycleError
    ? error.code
    : 'MANIFEST_READ_FAILED';
}

function activeModel(manifest: LocalModelManifest): ImportedLocalModel | null {
  return (
    manifest.models.find(
      (model) => model.sha256 === manifest.activeModelSha256
    ) ?? null
  );
}

/** React state は候補 URI を manifest へ混ぜず、Owner 操作後だけ lifecycle を進める。 */
export function useLocalModelManagement(input: UseLocalModelManagementInput): {
  readonly provider: AgentModelProvider;
  readonly isMutationPending: () => boolean;
  readonly invalidateAfterExternalPurge: () => void;
  readonly view: LocalModelManagementView;
} {
  const {
    management,
    mutationLeases,
    fallbackProvider,
    waitForNativeTeardown,
    hasActiveProviderRun,
    ready,
  } = input;
  const [provider, setProvider] = useState(fallbackProvider);
  const [manifest, setManifest] = useState<LocalModelManifest | null>(null);
  const [candidate, setCandidate] = useState<ModelImportCandidate | null>(null);
  const [candidateAvailableStorageBytes, setCandidateAvailableStorageBytes] =
    useState<number | null>(null);
  const [cautionAssessment, setCautionAssessment] =
    useState<ActivationAssessment | null>(null);
  const [pendingProviderOperation, setPendingProviderOperation] =
    useState<PendingProviderOperation | null>(null);
  const [importInProgress, setImportInProgress] = useState(false);
  const importControllerRef = useRef<AbortController | null>(null);
  const [error, setError] =
    useState<LocalModelManagementView['errorCode']>(null);
  const [busy, setBusy] = useState(false);
  const operationLaneRef = useRef(
    createLocalModelOperationLane({
      onStart() {
        setBusy(true);
        setError(null);
      },
      onError(caught) {
        setError(errorCode(caught));
      },
      onFinish() {
        setBusy(false);
      },
    })
  );
  const run = useCallback((operation: () => Promise<void>): boolean => {
    return operationLaneRef.current.run(operation);
  }, []);
  const clearPendingImport = useCallback((): void => {
    setPendingProviderOperation((pending) =>
      pending?.kind === 'import' ? null : pending
    );
  }, []);

  const configureProvider = useCallback(
    (loaded: LocalModelManifest): void => {
      const active = activeModel(loaded);
      setProvider(
        active && management
          ? management.createProvider(active, () =>
              setError('BENCHMARK_WRITE_FAILED')
            )
          : fallbackProvider
      );
    },
    [fallbackProvider, management]
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!management) return;
    const loaded = await management.lifecycle.load();
    setManifest(loaded);
    configureProvider(loaded);
  }, [configureProvider, management]);

  useEffect(
    () => () => {
      importControllerRef.current?.abort();
      operationLaneRef.current.dispose();
    },
    []
  );

  useEffect(() => {
    let active = true;
    if (!management || !mutationLeases || !ready) return () => undefined;
    run(async () => {
      const loaded = await withLocalModelMutationLease(mutationLeases, () =>
        management.lifecycle.load()
      );
      if (!active) return;
      setManifest(loaded);
      configureProvider(loaded);
    });
    return () => {
      active = false;
    };
  }, [configureProvider, management, mutationLeases, ready, run]);

  const reload = useCallback((): void => {
    if (!mutationLeases) return;
    run(() => withLocalModelMutationLease(mutationLeases, refresh));
  }, [mutationLeases, refresh, run]);

  const selectCandidate = useCallback((): void => {
    if (hasActiveProviderRun) return;
    clearPendingImport();
    if (!management || !mutationLeases) return;
    run(async () => {
      const selected = await management.pickCandidate();
      const availableBytes = await withLocalModelMutationLease(
        mutationLeases,
        () => management.lifecycle.assessImportCandidate(selected)
      );
      setCandidate(selected);
      setCandidateAvailableStorageBytes(availableBytes);
    });
  }, [
    clearPendingImport,
    hasActiveProviderRun,
    management,
    mutationLeases,
    run,
  ]);

  const performImport = useCallback(
    (selectedCandidate: ModelImportCandidate): void => {
      if (!management || !mutationLeases) return;
      const controller = new AbortController();
      const started = run(async () => {
        try {
          await waitForNativeTeardown();
          await withLocalModelMutationLease(mutationLeases, () =>
            importLocalModelCandidate({
              lifecycle: management.lifecycle,
              candidate: selectedCandidate,
              signal: controller.signal,
              refresh,
              onImported: () => {
                setCandidate(null);
                setCandidateAvailableStorageBytes(null);
              },
            })
          );
        } finally {
          if (importControllerRef.current === controller) {
            importControllerRef.current = null;
            setImportInProgress(false);
          }
        }
      });
      if (started) {
        importControllerRef.current = controller;
        setImportInProgress(true);
      }
    },
    [management, mutationLeases, refresh, run, waitForNativeTeardown]
  );

  const confirmImport = useCallback((): void => {
    if (!candidate || !management || !mutationLeases) return;
    if (hasActiveProviderRun) {
      setPendingProviderOperation({ kind: 'import', candidate });
      return;
    }
    clearPendingImport();
    performImport(candidate);
  }, [
    candidate,
    clearPendingImport,
    hasActiveProviderRun,
    management,
    mutationLeases,
    performImport,
  ]);

  const cancelImport = useCallback((): void => {
    importControllerRef.current?.abort();
  }, []);

  const performActivation = useCallback(
    (sha256: string): void => {
      if (!management || !mutationLeases) return;
      run(async () => {
        await waitForNativeTeardown();
        await withLocalModelMutationLease(mutationLeases, () =>
          performLocalModelActivation({
            lifecycle: management.lifecycle,
            sha256,
            refresh,
            setCautionAssessment,
          })
        );
      });
    },
    [management, mutationLeases, refresh, run, waitForNativeTeardown]
  );

  const activate = useCallback(
    (sha256: string): void => {
      if (hasActiveProviderRun) {
        setPendingProviderOperation({ kind: 'activate', sha256 });
        return;
      }
      performActivation(sha256);
    },
    [hasActiveProviderRun, performActivation]
  );

  const performCautionActivation = useCallback((): void => {
    if (
      !management ||
      !mutationLeases ||
      !cautionAssessment?.cautionConfirmationKey
    ) {
      return;
    }
    run(async () => {
      await waitForNativeTeardown();
      await withLocalModelMutationLease(mutationLeases, () =>
        confirmLocalModelCaution({
          lifecycle: management.lifecycle,
          assessment: cautionAssessment,
          refresh,
          setCautionAssessment,
        })
      );
    });
  }, [
    cautionAssessment,
    management,
    mutationLeases,
    refresh,
    run,
    waitForNativeTeardown,
  ]);

  const confirmCautionActivation = useCallback((): void => {
    if (!cautionAssessment?.cautionConfirmationKey) return;
    if (hasActiveProviderRun) {
      setPendingProviderOperation({ kind: 'confirm-caution' });
      return;
    }
    performCautionActivation();
  }, [cautionAssessment, hasActiveProviderRun, performCautionActivation]);

  const performUnload = useCallback((): void => {
    if (!management || !mutationLeases) return;
    run(async () => {
      await waitForNativeTeardown();
      await withLocalModelMutationLease(mutationLeases, async () => {
        await management.lifecycle.unload(async () => undefined);
        await refresh();
      });
    });
  }, [management, mutationLeases, refresh, run, waitForNativeTeardown]);

  const unload = useCallback((): void => {
    if (hasActiveProviderRun) {
      setPendingProviderOperation({ kind: 'unload' });
      return;
    }
    performUnload();
  }, [hasActiveProviderRun, performUnload]);

  const performDelete = useCallback(
    (sha256: string): void => {
      if (!management || !mutationLeases) return;
      run(async () => {
        await waitForNativeTeardown();
        await withLocalModelMutationLease(mutationLeases, async () => {
          await management.lifecycle.deleteModel(sha256, async () => undefined);
          setCautionAssessment(null);
          await refresh();
        });
      });
    },
    [management, mutationLeases, refresh, run, waitForNativeTeardown]
  );

  const deleteModel = useCallback(
    (sha256: string): void => {
      if (hasActiveProviderRun) {
        setPendingProviderOperation({ kind: 'delete', sha256 });
        return;
      }
      performDelete(sha256);
    },
    [hasActiveProviderRun, performDelete]
  );

  const invalidateAfterExternalPurge = useCallback((): void => {
    importControllerRef.current?.abort();
    setProvider(fallbackProvider);
    setManifest(null);
    setCandidate(null);
    setCandidateAvailableStorageBytes(null);
    setCautionAssessment(null);
    setPendingProviderOperation(null);
    setError(null);
  }, [fallbackProvider]);

  const confirmProviderOperation = useCallback((): void => {
    const pending = pendingProviderOperation;
    if (!pending) return;
    setPendingProviderOperation(null);
    if (pending.kind === 'import') {
      performImport(pending.candidate);
      return;
    }
    if (pending.kind === 'activate' && pending.sha256) {
      performActivation(pending.sha256);
      return;
    }
    if (pending.kind === 'unload') {
      performUnload();
      return;
    }
    if (pending.kind === 'confirm-caution') {
      performCautionActivation();
      return;
    }
    performDelete(pending.sha256);
  }, [
    pendingProviderOperation,
    performActivation,
    performCautionActivation,
    performDelete,
    performImport,
    performUnload,
  ]);

  return {
    provider,
    isMutationPending: () => operationLaneRef.current.isPending(),
    invalidateAfterExternalPurge,
    view: {
      available: management !== null && mutationLeases !== null,
      busy,
      candidate,
      candidateAvailableStorageBytes,
      candidateSelectionBlocked: hasActiveProviderRun,
      manifest,
      cautionAssessment,
      importInProgress,
      pendingProviderOperation: pendingProviderOperation?.kind ?? null,
      errorCode: error,
      reload,
      selectCandidate,
      confirmImport,
      cancelImport,
      cancelCandidate: () => {
        clearPendingImport();
        setCandidate(null);
        setCandidateAvailableStorageBytes(null);
      },
      activate,
      confirmCautionActivation,
      unload,
      deleteModel,
      confirmProviderOperation,
      cancelProviderOperation: () => setPendingProviderOperation(null),
    },
  };
}
