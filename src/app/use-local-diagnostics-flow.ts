import { useCallback, useRef, useState } from 'react';
import type { BackupSharePort } from './backup-share-port';
import {
  type DiagnosticErrorSignal,
  localDataErrorSignal,
} from './diagnostic-recovery';
import {
  createDiagnosticReportPreview,
  type DiagnosticReportInput,
  type DiagnosticReportPreview,
} from './diagnostic-report';
import {
  type LocalDataControl,
  LocalDataControlError,
  type LocalDataPreview,
} from './local-data-control';

const DIAGNOSTIC_REPORT_FILE_NAME = 'tenkacloud-passport-diagnostic.json';

export type DiagnosticNoticeKind =
  | 'shared'
  | 'dismissed'
  | 'saved'
  | 'lounge-forgotten'
  | 'passport-reset'
  | 'model-removed'
  | 'all-deleted';

export interface LocalDiagnosticsFlow {
  readonly diagnosticPreview: DiagnosticReportPreview | null;
  readonly localDataPreview: LocalDataPreview | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly recoveryRequired: boolean;
  readonly sharing: boolean;
  readonly deleteAllConfirmationRequested: boolean;
  readonly notice: DiagnosticNoticeKind | null;
  readonly error: DiagnosticErrorSignal | null;
  readonly open: () => void;
  readonly enterRecovery: (cause: unknown) => void;
  readonly close: () => void;
  readonly refresh: () => Promise<void>;
  readonly share: () => Promise<void>;
  readonly endAndForgetLounge: () => void;
  readonly resetPassport: () => Promise<void>;
  readonly removeModel: () => Promise<void>;
  readonly requestDeleteAll: () => void;
  readonly cancelDeleteAll: () => void;
  readonly confirmDeleteAll: () => Promise<void>;
}

type RuntimeSnapshot = Omit<DiagnosticReportInput, 'model' | 'storage'>;

interface UseLocalDiagnosticsFlowParams {
  readonly localDataControl: LocalDataControl;
  readonly backupSharePort: BackupSharePort;
  readonly runtimeSnapshot: RuntimeSnapshot;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onEndAndForgetLounge: () => void;
  readonly onPassportReset: () => void;
  readonly onModelRemoved: () => void;
  readonly onAllDataDeleted: (recoveryRequired: boolean) => void;
  readonly onRetryStartupRecovery: () => Promise<'not-pending' | 'recovered'>;
  readonly onError: (error: DiagnosticErrorSignal) => void;
}

function reportStorage(preview: LocalDataPreview) {
  return {
    profileCount: preview.profileCount,
    settingsCount: preview.settingsCount,
    backupCacheCount: preview.backupCacheCount,
    modelCount: preview.modelCount,
    totalBytes: preview.totalBytes,
  };
}

function reportModel(preview: LocalDataPreview) {
  return preview.model && preview.model.count > 0 ? preview.model : null;
}

export function useLocalDiagnosticsFlow({
  localDataControl,
  backupSharePort,
  runtimeSnapshot,
  onOpen,
  onClose,
  onEndAndForgetLounge,
  onPassportReset,
  onModelRemoved,
  onAllDataDeleted,
  onRetryStartupRecovery,
  onError,
}: UseLocalDiagnosticsFlowParams): LocalDiagnosticsFlow {
  const [diagnosticPreview, setDiagnosticPreview] =
    useState<DiagnosticReportPreview | null>(null);
  const [localDataPreview, setLocalDataPreview] =
    useState<LocalDataPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleteAllConfirmationRequested, setDeleteAllConfirmationRequested] =
    useState(false);
  const [notice, setNotice] = useState<DiagnosticNoticeKind | null>(null);
  const [error, setError] = useState<DiagnosticErrorSignal | null>(null);
  const refreshGeneration = useRef(0);

  const invalidatePreview = useCallback((): void => {
    refreshGeneration.current += 1;
    setDiagnosticPreview(null);
    setLocalDataPreview(null);
    setLoading(false);
  }, []);

  const applyError = useCallback(
    (cause: unknown): void => {
      const signal = localDataErrorSignal(cause);
      setError(signal);
      onError(signal);
    },
    [onError]
  );

  const retryRecovery = useCallback(
    async (generation: number): Promise<void> => {
      const recovery = await onRetryStartupRecovery();
      if (refreshGeneration.current !== generation) return;
      setRecoveryRequired(false);
      if (recovery === 'recovered') setNotice('all-deleted');
    },
    [onRetryStartupRecovery]
  );

  const refresh = useCallback(async (): Promise<void> => {
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    setLoading(true);
    setError(null);
    try {
      if (recoveryRequired) {
        await retryRecovery(generation);
        return;
      }
      const data = await localDataControl.preview();
      const preview = createDiagnosticReportPreview({
        ...runtimeSnapshot,
        model: reportModel(data),
        storage: reportStorage(data),
      });
      if (refreshGeneration.current !== generation) return;
      setLocalDataPreview(data);
      setDiagnosticPreview(preview);
    } catch (cause: unknown) {
      if (refreshGeneration.current !== generation) return;
      setLocalDataPreview(null);
      setDiagnosticPreview(null);
      applyError(cause);
    } finally {
      if (refreshGeneration.current === generation) setLoading(false);
    }
  }, [
    applyError,
    localDataControl,
    recoveryRequired,
    retryRecovery,
    runtimeSnapshot,
  ]);

  const open = useCallback((): void => {
    if (recoveryRequired) return;
    invalidatePreview();
    setNotice(null);
    setDeleteAllConfirmationRequested(false);
    onOpen();
    void refresh();
  }, [invalidatePreview, onOpen, recoveryRequired, refresh]);

  const enterRecovery = useCallback(
    (cause: unknown): void => {
      invalidatePreview();
      setNotice(null);
      setDeleteAllConfirmationRequested(false);
      setRecoveryRequired(true);
      applyError(cause);
      onOpen();
    },
    [applyError, invalidatePreview, onOpen]
  );

  const close = useCallback((): void => {
    if (busy || recoveryRequired) return;
    invalidatePreview();
    setDeleteAllConfirmationRequested(false);
    onClose();
  }, [busy, invalidatePreview, onClose, recoveryRequired]);

  const share = useCallback(async (): Promise<void> => {
    if (!diagnosticPreview || sharing || busy || recoveryRequired) return;
    setSharing(true);
    try {
      const outcome = await backupSharePort.share({
        fileName: DIAGNOSTIC_REPORT_FILE_NAME,
        json: diagnosticPreview.json,
      });
      setNotice(
        outcome.kind === 'shared'
          ? 'shared'
          : outcome.kind === 'dismissed'
            ? 'dismissed'
            : 'saved'
      );
    } catch {
      const signal: DiagnosticErrorSignal = {
        code: 'UNEXPECTED_FAILURE',
        phase: 'backup-export',
      };
      setError(signal);
      onError(signal);
    } finally {
      setSharing(false);
    }
  }, [
    backupSharePort,
    busy,
    diagnosticPreview,
    onError,
    recoveryRequired,
    sharing,
  ]);

  const endAndForgetLounge = useCallback((): void => {
    if (busy || recoveryRequired) return;
    onEndAndForgetLounge();
    invalidatePreview();
    setNotice('lounge-forgotten');
  }, [busy, invalidatePreview, onEndAndForgetLounge, recoveryRequired]);

  const resetPassport = useCallback(async (): Promise<void> => {
    if (busy || recoveryRequired) return;
    setBusy(true);
    try {
      await localDataControl.resetPassport();
      onPassportReset();
      setNotice('passport-reset');
      await refresh();
    } catch (cause: unknown) {
      applyError(cause);
    } finally {
      setBusy(false);
    }
  }, [
    applyError,
    busy,
    localDataControl,
    onPassportReset,
    recoveryRequired,
    refresh,
  ]);

  const removeModel = useCallback(async (): Promise<void> => {
    if (busy || recoveryRequired) return;
    setBusy(true);
    try {
      await localDataControl.removeModel();
      onModelRemoved();
      setNotice('model-removed');
      await refresh();
    } catch (cause: unknown) {
      applyError(cause);
    } finally {
      setBusy(false);
    }
  }, [
    applyError,
    busy,
    localDataControl,
    onModelRemoved,
    recoveryRequired,
    refresh,
  ]);

  const requestDeleteAll = useCallback((): void => {
    if (recoveryRequired) return;
    setDeleteAllConfirmationRequested(true);
  }, [recoveryRequired]);

  const cancelDeleteAll = useCallback((): void => {
    if (recoveryRequired) return;
    setDeleteAllConfirmationRequested(false);
  }, [recoveryRequired]);

  const confirmDeleteAll = useCallback(async (): Promise<void> => {
    if (busy || recoveryRequired || !deleteAllConfirmationRequested) return;
    setBusy(true);
    try {
      await localDataControl.deleteAll();
      onAllDataDeleted(false);
      invalidatePreview();
      setNotice('all-deleted');
      setDeleteAllConfirmationRequested(false);
    } catch (cause: unknown) {
      const signal = localDataErrorSignal(cause);
      if (cause instanceof LocalDataControlError && cause.committed) {
        onAllDataDeleted(true);
        invalidatePreview();
        setDeleteAllConfirmationRequested(false);
        setRecoveryRequired(true);
      }
      setError(signal);
      onError(signal);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    deleteAllConfirmationRequested,
    localDataControl,
    invalidatePreview,
    onAllDataDeleted,
    onError,
    recoveryRequired,
  ]);

  return {
    diagnosticPreview,
    localDataPreview,
    loading,
    busy,
    recoveryRequired,
    sharing,
    deleteAllConfirmationRequested,
    notice,
    error,
    open,
    enterRecovery,
    close,
    refresh,
    share,
    endAndForgetLounge,
    resetPassport,
    removeModel,
    requestDeleteAll,
    cancelDeleteAll,
    confirmDeleteAll,
  };
}
