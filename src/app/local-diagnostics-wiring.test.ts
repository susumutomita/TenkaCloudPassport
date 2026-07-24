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

function startupRecoverySource(): Promise<string> {
  return readSourceFile(import.meta.url, 'startup-local-recovery.ts');
}

function compositionSource(): Promise<string> {
  return readSourceFile(import.meta.url, '../../App.tsx');
}

function passportCreationSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    '../screens/PassportCreationScreen.tsx'
  );
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
    const text = await startupRecoverySource();

    expectInOrder(text, [
      'localDataControl.recoverPendingDeletion()',
      'localProfileStorage.load()',
    ]);
  });

  it('Profile の保存中は Diagnostic 全削除へ遷移できない（Issue 118: JSON Backup 機能自体を削除したため Backup 側の契約は無い）', async () => {
    const app = await appSource();
    const creation = await passportCreationSource();
    const openSettingsStart = app.indexOf('function openSettings()');
    const closeSettingsStart = app.indexOf(
      'function closeSettings()',
      openSettingsStart
    );

    expect(app.slice(openSettingsStart, closeSettingsStart)).toContain(
      'if (saving) return'
    );
    expect(creation.match(/disabled=\{saving\}/g)).toHaveLength(2);
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
    expect(flow).toContain('const enterRecovery = useCallback(');
    expect(flow).toContain('await onRetryStartupRecovery()');
    expect(app).toContain('const retryStartupRecovery = useCallback(');
    expect(app).toContain('onRetryStartupRecovery: retryStartupRecovery');
    expect(screen).toContain('t.retryRecoveryButton');
    expect(app).toContain('if (!recoveryRequired)');
  });

  it('壊れた Manifest だけでも Model 件数を偽らず削除対象 1 件として扱う', async () => {
    const flow = await flowSource();
    const screen = await screenSource();

    expect(flow).toContain('preview.model && preview.model.count > 0');
    expect(screen).toContain(
      'Math.max(preview.modelCount, preview.model ? 1 : 0)'
    );
  });

  it('Issue 138（実機 blocker B）: 診断画面への Settings 経由の手動導線は消費者ビルドから完全に除去したが、Stage 自体と起動時 Recovery 経由の到達は残す', async () => {
    const text = await appSource();

    // 診断 Screen・Stage 自体は削除しない（起動時 tombstone recovery が
    // `diagnosticsFlow.enterRecovery()` 経由で到達する、下の Recovery 系
    // テスト・`use-local-diagnostics-flow.ts` の `enterRecovery` 参照）。
    expect(text).toContain("'diagnostics'");
    expect(text).toContain('<LocalDiagnosticsScreen');
    // 消費者 Settings は開発者向け診断・削除詳細画面への手動導線を持たない
    // （owner 実機フィードバック、`SettingsScreen.tsx` から完全に除去した）。
    expect(text).not.toContain('onOpenDiagnostics={diagnosticsFlow.open}');
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

  it('Profile / Permission / Transport の失敗を本文なしの固定 Error Signal へ接続する（Issue 118: use-backup-flow.ts 自体を削除したため Backup 側の契約は無い。Diagnostics 自身の share() 失敗は phase: backup-export を引き続き使う、下のテスト参照）', async () => {
    const app = await appSource();

    expect(app).toContain("phase: 'profile-write'");
    expect(app).toContain("phase: 'permission'");
    expect(app).toContain("phase: 'transport'");
    expect(app).toContain("code: 'TRANSPORT_UNAVAILABLE'");
  });

  it('Diagnostic Report の共有失敗は phase: backup-export（共有 Port 呼び出し失敗の既存 Phase 名）で Error Signal を作る（Issue 118: BackupSharePort は Diagnostics・Pilot Measurement とも共有する Port であり削除していない）', async () => {
    const text = await flowSource();
    const shareStart = text.indexOf('const share = useCallback(');
    const shareEnd = text.indexOf('const endAndForgetLounge', shareStart);
    const shareBody = text.slice(shareStart, shareEnd);

    expect(shareBody).toContain("phase: 'backup-export'");
    expect(shareBody).toContain("code: 'UNEXPECTED_FAILURE'");
  });
});
