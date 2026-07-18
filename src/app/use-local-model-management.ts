import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentModelProvider } from '../domain/agent-model-provider';
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
} from './local-model-management-controller';

export interface LocalModelManagementView {
  readonly available: boolean;
  readonly busy: boolean;
  readonly candidate: ModelImportCandidate | null;
  readonly manifest: LocalModelManifest | null;
  readonly cautionAssessment: ActivationAssessment | null;
  readonly importInProgress: boolean;
  readonly pendingProviderOperation: 'activate' | 'unload' | 'delete' | null;
  readonly errorCode:
    | ModelLifecycleError['code']
    | 'BENCHMARK_WRITE_FAILED'
    | null;
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
  readonly fallbackProvider: AgentModelProvider;
  readonly waitForNativeTeardown: () => Promise<void>;
  readonly hasActiveProviderRun: boolean;
}

interface PendingProviderOperation {
  readonly kind: 'activate' | 'unload' | 'delete';
  readonly sha256: string | null;
}

function errorCode(error: unknown): ModelLifecycleError['code'] {
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
  readonly view: LocalModelManagementView;
} {
  const {
    management,
    fallbackProvider,
    waitForNativeTeardown,
    hasActiveProviderRun,
  } = input;
  const [provider, setProvider] = useState(fallbackProvider);
  const [manifest, setManifest] = useState<LocalModelManifest | null>(null);
  const [candidate, setCandidate] = useState<ModelImportCandidate | null>(null);
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
    if (!management) return () => undefined;
    setBusy(true);
    void management.lifecycle
      .load()
      .then((loaded) => {
        if (!active) return;
        setManifest(loaded);
        configureProvider(loaded);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorCode(caught));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [configureProvider, management]);

  const run = useCallback((operation: () => Promise<void>): boolean => {
    return operationLaneRef.current.run(operation);
  }, []);

  const selectCandidate = useCallback((): void => {
    if (!management) return;
    run(async () => {
      setCandidate(await management.pickCandidate());
    });
  }, [management, run]);

  const confirmImport = useCallback((): void => {
    if (!management || !candidate) return;
    const controller = new AbortController();
    const started = run(async () => {
      try {
        await importLocalModelCandidate({
          lifecycle: management.lifecycle,
          candidate,
          signal: controller.signal,
          refresh,
          onImported: () => setCandidate(null),
        });
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
  }, [candidate, management, refresh, run]);

  const cancelImport = useCallback((): void => {
    importControllerRef.current?.abort();
  }, []);

  const performActivation = useCallback(
    (sha256: string, cancelCurrentRun: boolean): void => {
      if (!management) return;
      run(async () => {
        await performLocalModelActivation({
          lifecycle: management.lifecycle,
          sha256,
          cancelCurrentRun,
          waitForNativeTeardown,
          refresh,
          setCautionAssessment,
        });
      });
    },
    [management, refresh, run, waitForNativeTeardown]
  );

  const activate = useCallback(
    (sha256: string): void => {
      if (hasActiveProviderRun) {
        setPendingProviderOperation({ kind: 'activate', sha256 });
        return;
      }
      performActivation(sha256, false);
    },
    [hasActiveProviderRun, performActivation]
  );

  const confirmCautionActivation = useCallback((): void => {
    if (!management || !cautionAssessment?.cautionConfirmationKey) return;
    run(async () => {
      await confirmLocalModelCaution({
        lifecycle: management.lifecycle,
        assessment: cautionAssessment,
        refresh,
        setCautionAssessment,
      });
    });
  }, [cautionAssessment, management, refresh, run]);

  const performUnload = useCallback((): void => {
    if (!management) return;
    run(async () => {
      await management.lifecycle.unload(waitForNativeTeardown);
      await refresh();
    });
  }, [management, refresh, run, waitForNativeTeardown]);

  const unload = useCallback((): void => {
    if (hasActiveProviderRun) {
      setPendingProviderOperation({ kind: 'unload', sha256: null });
      return;
    }
    performUnload();
  }, [hasActiveProviderRun, performUnload]);

  const performDelete = useCallback(
    (sha256: string): void => {
      if (!management) return;
      run(async () => {
        await management.lifecycle.deleteModel(sha256, waitForNativeTeardown);
        setCautionAssessment(null);
        await refresh();
      });
    },
    [management, refresh, run, waitForNativeTeardown]
  );

  const deleteModel = useCallback(
    (sha256: string): void => {
      if (hasActiveProviderRun && manifest?.activeModelSha256 === sha256) {
        setPendingProviderOperation({ kind: 'delete', sha256 });
        return;
      }
      performDelete(sha256);
    },
    [hasActiveProviderRun, manifest?.activeModelSha256, performDelete]
  );

  const confirmProviderOperation = useCallback((): void => {
    const pending = pendingProviderOperation;
    if (!pending) return;
    setPendingProviderOperation(null);
    if (pending.kind === 'activate' && pending.sha256) {
      performActivation(pending.sha256, true);
      return;
    }
    if (pending.kind === 'unload') {
      performUnload();
      return;
    }
    if (pending.sha256) performDelete(pending.sha256);
  }, [
    pendingProviderOperation,
    performActivation,
    performDelete,
    performUnload,
  ]);

  return {
    provider,
    view: {
      available: management !== null,
      busy,
      candidate,
      manifest,
      cautionAssessment,
      importInProgress,
      pendingProviderOperation: pendingProviderOperation?.kind ?? null,
      errorCode: error,
      selectCandidate,
      confirmImport,
      cancelImport,
      cancelCandidate: () => setCandidate(null),
      activate,
      confirmCautionActivation,
      unload,
      deleteModel,
      confirmProviderOperation,
      cancelProviderOperation: () => setPendingProviderOperation(null),
    },
  };
}
