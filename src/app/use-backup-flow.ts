import { useCallback, useMemo, useState } from 'react';
import type { LocalPrivateProfile } from '../domain/passport';
import {
  type BackupExportPreview,
  backupExportFileName,
  createBackupExportPreview,
  createDefaultDeviceSettings,
} from './backup-export';
import {
  type BackupImportConflictChoice,
  type BackupImportParseResult,
  commitBackupImport,
  defaultBackupImportChoice,
  parseBackupImportCandidate,
  resolveImportedProfile,
} from './backup-import';
import {
  BACKUP_NOTICE_IDLE,
  type BackupNotice,
  backupNoticeFromImportCommitFailure,
  backupNoticeFromImportCommitSuccess,
  backupNoticeFromShareFailure,
  backupNoticeFromShareOutcome,
} from './backup-notice';
import type { BackupSharePort } from './backup-share-port';
import type { LocalProfileStoragePort } from './local-profile-storage';

export type BackupStage = 'backup-export' | 'backup-import';

export interface BackupFlow {
  readonly exportPreview: BackupExportPreview | null;
  readonly sharing: boolean;
  readonly exportNotice: BackupNotice;
  readonly rawInput: string;
  readonly importResult: BackupImportParseResult | null;
  readonly importChoice: BackupImportConflictChoice;
  readonly committing: boolean;
  readonly importNotice: BackupNotice;
  readonly open: () => void;
  readonly openImport: () => void;
  readonly close: () => void;
  readonly share: () => Promise<void>;
  readonly changeRawInput: (value: string) => void;
  readonly validate: () => void;
  readonly setImportChoice: (choice: BackupImportConflictChoice) => void;
  readonly commit: () => Promise<void>;
}

interface UseBackupFlowParams {
  readonly localProfileStorage: LocalProfileStoragePort;
  readonly backupSharePort: BackupSharePort;
  readonly privateProfile: LocalPrivateProfile | null;
  readonly onImportCommitted: (profile: LocalPrivateProfile) => void;
  readonly onOpenStage: (stage: BackupStage) => void;
  readonly onCloseStage: () => void;
}

/**
 * Backup Export・Import（Issue 14）は Lounge / Room / Pet Interaction のどの state とも
 * 相互作用しない独立した機能であるため、専用 Hook へ切り出す。`PassportApp` 本体へ直接
 * 展開すると Cognitive Complexity が上限（15）を超えるため、状態と Use Case の呼び出しを
 * ここへ集約する（`src/app/qr-scan-flow.ts` 等の既存 flow モジュールと同じ「呼び出しの
 * 並び順だけをここへ持ち、実際の判定は domain / protocol 層へ委譲する」方針）。
 */
export function useBackupFlow({
  localProfileStorage,
  backupSharePort,
  privateProfile,
  onImportCommitted,
  onOpenStage,
  onCloseStage,
}: UseBackupFlowParams): BackupFlow {
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [exportNotice, setExportNotice] =
    useState<BackupNotice>(BACKUP_NOTICE_IDLE);
  const [rawInput, setRawInput] = useState('');
  const [importResult, setImportResult] =
    useState<BackupImportParseResult | null>(null);
  const [importChoice, setImportChoiceState] =
    useState<BackupImportConflictChoice>('use-imported');
  const [committing, setCommitting] = useState(false);
  const [importNotice, setImportNotice] =
    useState<BackupNotice>(BACKUP_NOTICE_IDLE);

  const exportPreview = useMemo(() => {
    if (!privateProfile || !exportedAt) return null;
    try {
      return createBackupExportPreview({
        localPrivateProfile: privateProfile,
        deviceSettings: createDefaultDeviceSettings(),
        modelVerification: null,
        exportedAt,
      });
    } catch {
      return null;
    }
  }, [privateProfile, exportedAt]);

  const openImport = useCallback((): void => {
    setRawInput('');
    setImportResult(null);
    setImportNotice(BACKUP_NOTICE_IDLE);
    onOpenStage('backup-import');
  }, [onOpenStage]);

  /**
   * Export した JSON が暗号化されないこと、含まれる全項目を Preview で確認できることを
   * 常に最新の状態で示すため、開くたびに Export 日時を取り直し、前回の共有結果 Notice も
   * 破棄する。Profile が無い場合は Export する対象が無いため Import 画面へ直接進む。
   */
  const open = useCallback((): void => {
    if (!privateProfile) {
      openImport();
      return;
    }
    setExportedAt(new Date().toISOString());
    setExportNotice(BACKUP_NOTICE_IDLE);
    onOpenStage('backup-export');
  }, [privateProfile, openImport, onOpenStage]);

  const close = useCallback((): void => {
    onCloseStage();
  }, [onCloseStage]);

  /** Export は利用者の明示操作（この関数の呼び出し元である Button）だけが Share Sheet を開く。 */
  const share = useCallback(async (): Promise<void> => {
    if (!exportPreview || sharing) return;
    setSharing(true);
    try {
      const outcome = await backupSharePort.share({
        fileName: backupExportFileName(exportPreview.backup.exportedAt),
        json: exportPreview.json,
      });
      setExportNotice(backupNoticeFromShareOutcome(outcome));
    } catch (error: unknown) {
      setExportNotice(backupNoticeFromShareFailure(error));
    } finally {
      setSharing(false);
    }
  }, [exportPreview, sharing, backupSharePort]);

  const changeRawInput = useCallback((value: string): void => {
    setRawInput(value);
    setImportResult(null);
    setImportNotice(BACKUP_NOTICE_IDLE);
  }, []);

  /**
   * Preview → Validation の境目。不正 JSON・未知 Version・欠落 Field・過大 File はここで
   * rejected として確定し、既存の Local Profile には一切触れない。
   */
  const validate = useCallback((): void => {
    const result = parseBackupImportCandidate(rawInput);
    setImportResult(result);
    setImportChoiceState(defaultBackupImportChoice(privateProfile !== null));
    setImportNotice(BACKUP_NOTICE_IDLE);
  }, [rawInput, privateProfile]);

  /**
   * Conflict 選択の確定後に Atomic Commit する。`commitBackupImport` が reject した場合は
   * catch 節へ入るだけで `onImportCommitted` を一切呼ばないため、失敗時は表示中の Profile
   * も Storage 上の Profile も変更されない。
   */
  const commit = useCallback(async (): Promise<void> => {
    if (importResult?.kind !== 'parsed' || committing) return;
    setCommitting(true);
    try {
      const resolved = resolveImportedProfile(
        importResult.backup,
        privateProfile,
        importChoice
      );
      const committed = await commitBackupImport(localProfileStorage, resolved);
      onImportCommitted(committed);
      setImportNotice(backupNoticeFromImportCommitSuccess());
    } catch (error: unknown) {
      setImportNotice(backupNoticeFromImportCommitFailure(error));
    } finally {
      setCommitting(false);
    }
  }, [
    importResult,
    committing,
    privateProfile,
    importChoice,
    localProfileStorage,
    onImportCommitted,
  ]);

  return {
    exportPreview,
    sharing,
    exportNotice,
    rawInput,
    importResult,
    importChoice,
    committing,
    importNotice,
    open,
    openImport,
    close,
    share,
    changeRawInput,
    validate,
    setImportChoice: setImportChoiceState,
    commit,
  };
}
