import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

/**
 * Issue 14: PassportApp.tsx / use-backup-flow.ts / BackupImportScreen.tsx は
 * レンダリング用の統合テスト基盤を持たないため（新規依存を増やさない方針、既存の
 * `passport-app-stage-flow.test.ts` と同じ理由）、Backup Export・Import の配線契約を
 * ソーステキスト検査で固定する。
 */
function passportAppSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'PassportApp.tsx');
}

function useBackupFlowSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-backup-flow.ts');
}

function backupImportScreenSource(): Promise<string> {
  return readSourceFile(import.meta.url, '../screens/BackupImportScreen.tsx');
}

describe('Backup Export・Import の配線契約（Issue 14）', () => {
  it('PassportCreationScreen（Profile 画面）から Backup 画面へ進む導線を持つ', async () => {
    const text = await passportAppSource();

    expect(text).toContain('onOpenBackup={backupFlow.open}');
  });

  it('Export 画面は Preview（preview prop）を渡し、明示操作（onShare）だけを Button に紐付ける', async () => {
    const text = await passportAppSource();
    const gateStart = text.indexOf('function BackupStageGate(');
    const gateBody = text.slice(gateStart);

    expect(gateBody).toContain('preview={backupFlow.exportPreview}');
    expect(gateBody).toContain('onShare={() => void backupFlow.share()}');
  });

  it('Import 画面本体は貼り付け → Validation → rejected 表示 → parsed 表示の順に並べる', async () => {
    const text = await backupImportScreenSource();
    const mainStart = text.indexOf(
      'export default function BackupImportScreen('
    );
    const mainBody = text.slice(mainStart);

    expectInOrder(mainBody, [
      'バックアップ JSON（貼り付け）',
      '内容を確認する（Preview / Validation）',
      "validation?.kind === 'rejected'",
      '読み込めませんでした。',
      "validation?.kind === 'parsed'",
      '<ParsedCandidateSection',
    ]);
  });

  it('ConflictChoiceSection は既存を残す・置き換える 2 択（per-profile granularity）を明示する', async () => {
    const text = await backupImportScreenSource();
    const sectionStart = text.indexOf('function ConflictChoiceSection(');
    const sectionEnd = text.indexOf('interface ParsedCandidateSectionProps');
    const sectionBody = text.slice(sectionStart, sectionEnd);

    expect(sectionBody).toContain(
      'すでに Local Profile があります。どちらを使いますか。'
    );
    expect(sectionBody).toContain("onChangeChoice('keep-existing')");
    expect(sectionBody).toContain("onChangeChoice('use-imported')");
  });

  it('Preview → Conflict 選択 → Commit の順で表示する（ParsedCandidateSection 内）', async () => {
    const text = await backupImportScreenSource();
    const sectionStart = text.indexOf('function ParsedCandidateSection(');
    const sectionEnd = text.indexOf('interface BackupImportScreenProps');
    const sectionBody = text.slice(sectionStart, sectionEnd);

    expectInOrder(sectionBody, [
      '読み込む内容（Preview）',
      '<BackupPreviewList',
      '<ConflictChoiceSection',
      '<BackupNoticeBanner',
      'この内容を Commit する',
    ]);
  });

  it('`share` は Export 画面の明示操作からしか呼ばれない（自動 Export・自動 Upload を行わない）', async () => {
    const text = await passportAppSource();

    const shareCallSites = text.match(/backupFlow\.share\(\)/g) ?? [];
    expect(shareCallSites).toHaveLength(1);
  });

  it('use-backup-flow.ts の share() は BackupSharePort.share を明示呼び出しの中だけで呼ぶ', async () => {
    const text = await useBackupFlowSource();
    const bodyStart = text.indexOf('const share = useCallback(');
    const bodyEnd = text.indexOf('const changeRawInput');
    const body = text.slice(bodyStart, bodyEnd);

    expect(body).toContain('backupSharePort.share(');
    // Share の呼び出し回数が 1 回だけであることを確認し、意図しない多重呼び出し・
    // 自動再試行が無いことを固定する。
    expect(body.match(/backupSharePort\.share\(/g)).toHaveLength(1);
  });

  it('commit() は Atomic Commit が成功した場合だけ onImportCommitted を呼ぶ（成功後に state を進める規約）', async () => {
    const text = await useBackupFlowSource();
    const bodyStart = text.indexOf('const commit = useCallback(');
    const bodyEnd = text.indexOf('}, [\n    importResult,');
    const body = text.slice(bodyStart, bodyEnd);

    // await commitBackupImport(...) の直後（同じ try 節内）で onImportCommitted を呼ぶ
    // 順序を固定する。catch 節では onImportCommitted を呼ばない（失敗時に state を
    // 進めない）ことも確認する。
    expectInOrder(body, [
      'await commitBackupImport(localProfileStorage, resolved)',
      'onImportCommitted(committed)',
      'setImportNotice(backupNoticeFromImportCommitSuccess())',
      '} catch (error: unknown) {',
      'setImportNotice(backupNoticeFromImportCommitFailure(error))',
      '} finally {',
    ]);
    const catchBlockStart = body.indexOf('} catch (error: unknown) {');
    const catchBlockEnd = body.indexOf('} finally {');
    const catchBlock = body.slice(catchBlockStart, catchBlockEnd);
    expect(catchBlock).not.toContain('onImportCommitted');
  });

  it('validate() は既存データに触れず parseBackupImportCandidate の結果をそのまま state へ入れる', async () => {
    const text = await useBackupFlowSource();
    const bodyStart = text.indexOf('const validate = useCallback(');
    const bodyEnd = text.indexOf('}, [rawInput, privateProfile]);');
    const body = text.slice(bodyStart, bodyEnd);

    expect(body).toContain('parseBackupImportCandidate(rawInput)');
    expect(body).not.toContain('commitBackupImport');
    expect(body).not.toContain('localProfileStorage');
  });
});
