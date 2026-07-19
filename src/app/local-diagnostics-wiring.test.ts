import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

function appSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'PassportApp.tsx');
}

function flowSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-local-diagnostics-flow.ts');
}

function compositionSource(): Promise<string> {
  return readSourceFile(import.meta.url, '../../App.tsx');
}

function backupFlowSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-backup-flow.ts');
}

function passportCreationSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    '../screens/PassportCreationScreen.tsx'
  );
}

function backupImportSource(): Promise<string> {
  return readSourceFile(import.meta.url, '../screens/BackupImportScreen.tsx');
}

function screenSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    '../screens/LocalDiagnosticsScreen.tsx'
  );
}

describe('端末内 Diagnostic と削除の配線契約', () => {
  it('Composition Root は Profile と deletion journal を同じ LocalDataControl へ接続する', async () => {
    const text = await compositionSource();

    expectInOrder(text, [
      'const localDataLeases = new LocalModelContextLeaseRegistry()',
      'const localDeletionJournal = createDefaultLocalDeletionJournal()',
      'const localProfileStorage = new DeletionCoordinatedLocalProfileStorageAdapter(',
      'createDefaultLocalProfileStorage()',
      'const backupSharePort = createDefaultBackupSharePort()',
      'const agentModelProvider = createDefaultAgentModelProvider(localDataLeases)',
      'const localDataControl = createLocalDataControl({',
      'profileStorage: localProfileStorage',
      'modelContexts: localDataLeases',
      'deletionJournal: localDeletionJournal',
      'agentModelProvider={agentModelProvider}',
      'localDataControl={localDataControl}',
    ]);
    expect(text).toContain('appVersion={packageManifest.version}');
  });

  it('起動時は tombstone recovery を Profile load より先に完了する', async () => {
    const text = await appSource();

    expectInOrder(text, [
      '.recoverPendingDeletion()',
      'localProfileStorage.load()',
    ]);
  });

  it('Profile / Backup の保存中は Diagnostic 全削除へ遷移できない', async () => {
    const app = await appSource();
    const backup = await backupFlowSource();
    const creation = await passportCreationSource();
    const backupImport = await backupImportSource();
    const openSettingsStart = app.indexOf('function openSettings()');
    const closeSettingsStart = app.indexOf(
      'function closeSettings()',
      openSettingsStart
    );

    expect(app.slice(openSettingsStart, closeSettingsStart)).toContain(
      'if (saving) return'
    );
    expect(backup).toContain('if (committing) return');
    expect(creation.match(/disabled=\{saving\}/g)).toHaveLength(3);
    expect(backupImport.match(/disabled=\{committing\}/g)).toHaveLength(3);
  });

  it('削除中は Back を閉じ、commit 後中断は旧 Preview を破棄して Recovery 専用状態に留まる', async () => {
    const app = await appSource();
    const flow = await flowSource();
    const screen = await screenSource();
    const closeStart = flow.indexOf('const close = useCallback(');
    const shareStart = flow.indexOf('const share = useCallback(', closeStart);
    const closeBody = flow.slice(closeStart, shareStart);

    expect(closeBody).toContain('if (busy || recoveryRequired) return');
    expect(screen).toContain('disabled={flow.busy || flow.recoveryRequired}');
    expect(flow).toContain('refreshGeneration.current += 1');
    expect(flow).toContain('invalidatePreview();');
    expect(flow).toContain('onAllDataDeleted(true)');
    expect(flow).toContain('setRecoveryRequired(true)');
    expect(flow).toContain('localDataControl.recoverPendingDeletion()');
    expect(screen).toContain('t.retryRecoveryButton');
    expect(app).toContain('if (!recoveryRequired)');
  });

  it('Settings から Diagnostic 画面へ進み、戻ると元の状態を変更しない', async () => {
    const text = await appSource();

    expect(text).toContain("'diagnostics'");
    expect(text).toContain('onOpenDiagnostics={diagnosticsFlow.open}');
    expect(text).toContain('<LocalDiagnosticsScreen');
  });

  it('Sanitized Report は Preview 後の明示 share からだけ Share Port を 1 回呼ぶ', async () => {
    const text = await flowSource();
    const shareStart = text.indexOf('const share = useCallback(');
    const shareEnd = text.indexOf('const endAndForgetLounge', shareStart);
    const shareBody = text.slice(shareStart, shareEnd);

    expect(shareBody).toContain('backupSharePort.share({');
    expect(shareBody.match(/backupSharePort\.share\(/g)).toHaveLength(1);
    expect(shareBody).toContain('diagnosticPreview');
  });

  it('全削除は Preview → request → confirm の別操作で、confirm 前に deleteAll を呼ばない', async () => {
    const text = await flowSource();
    const requestStart = text.indexOf('const requestDeleteAll');
    const confirmStart = text.indexOf('const confirmDeleteAll');
    const requestBody = text.slice(requestStart, confirmStart);
    const confirmBody = text.slice(confirmStart);

    expect(requestBody).toContain('setDeleteAllConfirmationRequested(true)');
    expect(requestBody).not.toContain('localDataControl.deleteAll(');
    expect(confirmBody).toContain('localDataControl.deleteAll(');
  });

  it('Lounge、Passport、Model、全 Data の操作を別々の ActionButton として表示する', async () => {
    const text = await screenSource();

    expectInOrder(text, [
      't.endLoungeButton',
      't.resetPassportButton',
      't.removeModelButton',
      't.deleteAllButton',
    ]);
    expect(text).toContain('t.confirmDeleteAllButton');
    expect(text).toContain('t.cancelDeleteAllButton');
  });

  it('Diagnostic 画面は Loading、Error、空、成功を区別する', async () => {
    const text = await screenSource();

    expect(text).toContain('loading');
    expect(text).toContain('error');
    expect(text).toContain('diagnosticPreview');
    expect(text).toContain('localDataPreview');
  });

  it('Profile / Backup / Permission / Transport の失敗を本文なしの固定 Error Signal へ接続する', async () => {
    const app = await appSource();
    const backup = await backupFlowSource();

    expect(app).toContain("phase: 'profile-write'");
    expect(app).toContain("phase: 'permission'");
    expect(app).toContain("phase: 'transport'");
    expect(app).toContain("code: 'TRANSPORT_UNAVAILABLE'");
    expect(backup).toContain("phase: 'backup-export'");
    expect(backup).toContain("phase: 'backup-import'");
    expect(backup).toContain('onDiagnosticError({');
  });
});
