import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AgentModelProvider,
  AgentModelProviderError,
} from '../domain/agent-model-provider';
import type {
  ImportedLocalModel,
  LocalModelManifest,
} from '../local-agent/local-model-manifest';
import type {
  ActivationAssessment,
  ModelImportCandidate,
} from '../local-agent/model-lifecycle';
import type { TrustedModelSource } from '../local-agent/trusted-model-catalog';
import type { TrustedModelDownloadProgress } from '../local-agent/trusted-model-download';
import {
  confirmLocalModelCaution,
  createLocalModelOperationLane,
  importLocalModelCandidate,
  performLocalModelActivation,
  withLocalModelMutationLease,
} from './local-model-management-controller';
import type { LocalModelManagementPort } from './local-model-management-port';
import type { LocalModelMutationLeasePort } from './local-model-mutation-lease';
import {
  enableOnDeviceAi,
  mapOnDeviceAiErrorCode,
  type OnDeviceAiErrorCode,
  type OnDeviceAiStatus,
  onDeviceAiStatusFromManifest,
} from './trusted-model-enablement-controller';

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
    | 'enable-on-device-ai'
    | null;
  readonly errorCode: OnDeviceAiErrorCode | 'BENCHMARK_WRITE_FAILED' | null;
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
  /**
   * Follow-up F-FDRGS4: Settings の「オンデバイス AI を有効化」導線。
   * `trustedModelSource` は Native かつ Development Build のときだけ非 `null`
   *（`management` が有効な場合と同じ条件）。
   */
  readonly trustedModelSource: TrustedModelSource | null;
  readonly onDeviceAiStatus: OnDeviceAiStatus | null;
  /**
   * code-reviewer 指摘（simplify・altitude）: 「同意待ち」「ダウンロード中」は
   * 同じ一連の流れの排他な段階であり、独立した 2 つの boolean にすると
   * `SettingsScreen.tsx` 側で二重否定の条件分岐が必要になる。単一の tag に
   * まとめ、`LocalModelCard` 等が単一 flag で分岐する既存流儀に合わせる。
   * `finalizing`（code-reviewer 指摘、Cancel の実効性）: ダウンロード完了後の
   * import・activate は `AbortSignal` を受け取らない区間を含み、Cancel を
   * 押しても効かない。この区間では Cancel 導線自体を提示しない。
   */
  readonly onDeviceAiFlow:
    | 'idle'
    | 'consent-pending'
    | 'downloading'
    | 'finalizing';
  readonly onDeviceAiDownloadProgress: TrustedModelDownloadProgress | null;
  readonly requestEnableOnDeviceAi: () => void;
  readonly confirmEnableOnDeviceAiConsent: () => void;
  readonly cancelEnableOnDeviceAiConsent: () => void;
  readonly cancelOnDeviceAiDownload: () => void;
  readonly removeOnDeviceAiModel: () => void;
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
  | { readonly kind: 'delete'; readonly sha256: string }
  | { readonly kind: 'enable-on-device-ai' };

function errorCode(error: unknown): OnDeviceAiErrorCode {
  if (error instanceof AgentModelProviderError && error.nativeLaneQuarantined) {
    return 'NATIVE_CONTEXT_UNAVAILABLE';
  }
  return mapOnDeviceAiErrorCode(error);
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
  const [onDeviceAiFlow, setOnDeviceAiFlow] =
    useState<LocalModelManagementView['onDeviceAiFlow']>('idle');
  const [onDeviceAiDownloadProgress, setOnDeviceAiDownloadProgress] =
    useState<TrustedModelDownloadProgress | null>(null);
  const trustedModelControllerRef = useRef<AbortController | null>(null);
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
      trustedModelControllerRef.current?.abort();
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

  const requestEnableOnDeviceAi = useCallback((): void => {
    if (!management || hasActiveProviderRun) return;
    setOnDeviceAiFlow('consent-pending');
  }, [hasActiveProviderRun, management]);

  const cancelEnableOnDeviceAiConsent = useCallback((): void => {
    setOnDeviceAiFlow((flow) => (flow === 'consent-pending' ? 'idle' : flow));
  }, []);

  /**
   * code-reviewer 指摘（efficiency）: Native の `DownloadTask.onProgress` は
   * chunk ごとに間引きなしで発火するため、そのまま `setState` へ繋ぐと
   * 約 1 GB の Download 全体で大量の再 render を招く。四捨五入した % が
   * 変わったときだけ state を更新し、同じ % の連続通知は無視する。
   */
  const performEnableOnDeviceAi = useCallback((): void => {
    if (!management || !mutationLeases) return;
    const { trustedModelAcquisition, trustedModelSource, lifecycle } =
      management;
    const controller = new AbortController();
    setOnDeviceAiDownloadProgress(null);
    let lastReportedPercent = -1;
    const started = run(async () => {
      try {
        await waitForNativeTeardown();
        await withLocalModelMutationLease(mutationLeases, () =>
          enableOnDeviceAi({
            acquisition: trustedModelAcquisition,
            source: trustedModelSource,
            lifecycle,
            consented: true,
            signal: controller.signal,
            onProgress: (progress) => {
              const percent =
                trustedModelSource.sizeBytes > 0
                  ? Math.floor(
                      (progress.bytesWritten / trustedModelSource.sizeBytes) *
                        100
                    )
                  : 0;
              if (percent === lastReportedPercent) return;
              lastReportedPercent = percent;
              setOnDeviceAiDownloadProgress(progress);
            },
            onBeforeActivation: () => setOnDeviceAiFlow('finalizing'),
            refresh,
            setCautionAssessment,
          })
        );
      } finally {
        if (trustedModelControllerRef.current === controller) {
          trustedModelControllerRef.current = null;
          setOnDeviceAiFlow('idle');
          setOnDeviceAiDownloadProgress(null);
        }
      }
    });
    if (started) {
      trustedModelControllerRef.current = controller;
      setOnDeviceAiFlow('downloading');
    }
  }, [management, mutationLeases, refresh, run, waitForNativeTeardown]);

  /**
   * code-reviewer 指摘（altitude、major）: 他の全 Model mutation
   *（`confirmImport`・`activate`・`confirmCautionActivation`・`unload`・
   * `deleteModel`）は実行直前にも `hasActiveProviderRun` を再確認し、
   * 実行中なら `pendingProviderOperation` へ確認待ちにする。同意カードを
   * 開いた時点（`requestEnableOnDeviceAi`）でしか確認していなかったため、
   * カードを開いたまま Lounge が開始された場合に `waitForNativeTeardown()`
   * を無条件に呼んでしまう抜け穴があった。他の 4 操作と同じ形へ揃える。
   */
  const confirmEnableOnDeviceAiConsent = useCallback((): void => {
    if (!management || !mutationLeases) return;
    if (hasActiveProviderRun) {
      setOnDeviceAiFlow('idle');
      setPendingProviderOperation({ kind: 'enable-on-device-ai' });
      return;
    }
    setOnDeviceAiFlow('idle');
    performEnableOnDeviceAi();
  }, [
    hasActiveProviderRun,
    management,
    mutationLeases,
    performEnableOnDeviceAi,
  ]);

  const cancelOnDeviceAiDownload = useCallback((): void => {
    trustedModelControllerRef.current?.abort();
  }, []);

  const removeOnDeviceAiModel = useCallback((): void => {
    if (!management) return;
    deleteModel(management.trustedModelSource.sha256);
  }, [deleteModel, management]);

  const invalidateAfterExternalPurge = useCallback((): void => {
    importControllerRef.current?.abort();
    trustedModelControllerRef.current?.abort();
    setProvider(fallbackProvider);
    setManifest(null);
    setCandidate(null);
    setCandidateAvailableStorageBytes(null);
    setCautionAssessment(null);
    setPendingProviderOperation(null);
    setError(null);
    setOnDeviceAiFlow('idle');
    setOnDeviceAiDownloadProgress(null);
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
    if (pending.kind === 'enable-on-device-ai') {
      performEnableOnDeviceAi();
      return;
    }
    performDelete(pending.sha256);
  }, [
    pendingProviderOperation,
    performActivation,
    performCautionActivation,
    performDelete,
    performEnableOnDeviceAi,
    performImport,
    performUnload,
  ]);

  /**
   * code-reviewer 指摘（efficiency）: `busy` や `candidate` など無関係な
   * state の更新でも毎 render `manifest.models` を走査していたため、
   * manifest / management が変わったときだけ再計算する。
   */
  const onDeviceAiStatus = useMemo(
    () =>
      management
        ? onDeviceAiStatusFromManifest(manifest, management.trustedModelSource)
        : null,
    [management, manifest]
  );

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
      trustedModelSource: management?.trustedModelSource ?? null,
      onDeviceAiStatus,
      onDeviceAiFlow,
      onDeviceAiDownloadProgress,
      requestEnableOnDeviceAi,
      confirmEnableOnDeviceAiConsent,
      cancelEnableOnDeviceAiConsent,
      cancelOnDeviceAiDownload,
      removeOnDeviceAiModel,
    },
  };
}
