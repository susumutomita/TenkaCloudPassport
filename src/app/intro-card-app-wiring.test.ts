import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

/**
 * Issue 79: `PassportApp.tsx` はレンダリング用の統合テスト基盤を持たないため
 * （既存の `passport-app-stage-flow.test.ts` / `backup-app-wiring.test.ts` と同じ理由）、
 * 自己紹介カードピボット Step 1 のメインフロー配線をソーステキスト検査で固定する。
 */
function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'PassportApp.tsx');
}

describe('自己紹介カードピボット Step 1（Issue 79）のメインフロー配線契約', () => {
  it('起動時の着地先は introCardHomeStage（Intro Card の有無）で決まり、Pet 側の固定値には戻らない', async () => {
    const text = await source();
    const homeStageStart = text.indexOf(
      'const introCardHomeStage = useCallback('
    );
    const homeStageBody = text.slice(
      homeStageStart,
      text.indexOf('\n  );', homeStageStart)
    );

    expect(homeStageBody).toContain(
      "introCardRef.current ? 'intro-card' : 'intro-card-edit'"
    );

    const applyStart = text.indexOf(
      'const applyStartupRecoveryResult = useCallback('
    );
    const applyEnd = text.indexOf('const applyStartupRecoveryResultRef');
    const applyBody = text.slice(applyStart, applyEnd);
    expect(applyBody.match(/setStage\(introCardHomeStage\(\)\)/g)).toHaveLength(
      3
    );
    expect(applyBody).not.toContain("setStage('profile')");
    expect(applyBody).not.toContain("setStage('encounter')");
  });

  it('resetAllLocalMemory・closeSettings・closeBackupStage は introCardHomeStage 経由で着地先を決める（Pet 側の固定値に戻らない）', async () => {
    const text = await source();

    for (const marker of [
      'const resetAllLocalMemory = useCallback(',
      'function closeSettings(): void {',
      'const closeBackupStage = useCallback(',
    ]) {
      const start = text.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      const body = text.slice(start, start + 400);
      expect(body).toContain('introCardHomeStage()');
    }
  });

  it('起動時 effect は Local Profile Recovery と Intro Card Storage を Promise.all で束ね、両方が揃ってから stage を決める', async () => {
    const text = await source();
    const effectStart = text.indexOf('void Promise.all([');
    const effectBody = text.slice(
      effectStart,
      text.indexOf('return () => {', effectStart)
    );

    expectInOrder(effectBody, [
      'recoverLocalStateAtStartup(localDataControl, localProfileStorage)',
      'introCardStorage.load().catch(',
      ']).then(([result, loadedIntroCard]) => {',
      'introCardRef.current = loadedIntroCard',
      'setIntroCard(loadedIntroCard)',
      "result.kind === 'recovery-failed'",
      'applyStartupRecoveryResultRef.current(result)',
    ]);
  });

  it('ProfileHomeGate から IntroCardStageGate へ Backup・Settings・編集・削除の導線を渡す', async () => {
    const text = await source();
    const gateCallStart = text.indexOf('<IntroCardStageGate');
    const gateCallEnd = text.indexOf('/>', gateCallStart);
    const gateCall = text.slice(gateCallStart, gateCallEnd);

    expect(gateCall).toContain('onOpenBackup={backupFlow.open}');
    expect(gateCall).toContain('onOpenSettings={onOpenSettings}');
    expect(gateCall).toContain('onEdit={onEditIntroCard}');
    expect(gateCall).toContain('onDelete={onDeleteIntroCard}');

    const passportAppCallStart = text.indexOf(
      'onDeleteIntroCard={() => void deleteIntroCard()}'
    );
    expect(passportAppCallStart).toBeGreaterThan(-1);
    expect(text).toContain('onEditIntroCard={openIntroCardEdit}');
  });

  it('IntroCardStageGate は IntroCardScreen・IntroCardEditScreen の両方へ Backup・Settings 導線をそのまま渡す', async () => {
    const text = await source();

    const introCardBlockStart = text.indexOf('<IntroCardScreen');
    const introCardBlockEnd = text.indexOf('/>', introCardBlockStart);
    const introCardBlock = text.slice(introCardBlockStart, introCardBlockEnd);
    expect(introCardBlock).toContain('onOpenBackup={onOpenBackup}');
    expect(introCardBlock).toContain('onOpenSettings={onOpenSettings}');
    expect(introCardBlock).toContain('onEdit={onEdit}');
    expect(introCardBlock).toContain('onDelete={onDelete}');
    expect(introCardBlock).toContain('deleteError={');
    expect(introCardBlock).toContain(
      "edit.notice.kind === 'delete-error' ? edit.notice.message : null"
    );

    const editBlockStart = text.indexOf('<IntroCardEditScreen');
    const editBlockEnd = text.indexOf('/>', editBlockStart);
    const editBlock = text.slice(editBlockStart, editBlockEnd);
    expect(editBlock).toContain('onOpenBackup={onOpenBackup}');
    expect(editBlock).toContain('onOpenSettings={onOpenSettings}');
    expect(editBlock).toContain('onSave={edit.onSave}');
  });

  it('saveIntroCard は保存前に createIntroCard と encodeVCard の両方で検証してから introCardStorage.save を呼ぶ', async () => {
    const text = await source();
    const start = text.indexOf(
      'async function saveIntroCard(): Promise<void> {'
    );
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      'createIntroCard(introCardDraftAsShape())',
      'encodeVCard(card)',
      'await introCardStorage.save(card)',
      "setStage('intro-card')",
    ]);
    expect(body).toContain('introCardNoticeFromError(error, ');
  });

  it('deleteIntroCard は introCardStorage.remove の後に draft を空へ戻し編集画面へ戻す', async () => {
    const text = await source();
    const start = text.indexOf(
      'async function deleteIntroCard(): Promise<void> {'
    );
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      'await introCardStorage.remove()',
      'introCardRef.current = null',
      'setIntroCard(null)',
      "setStage('intro-card-edit')",
    ]);
  });

  it('deleteIntroCard の失敗時は stage を変えず delete 操作として Notice を作る（保存失敗の文言を流用しない）', async () => {
    const text = await source();
    const start = text.indexOf(
      'async function deleteIntroCard(): Promise<void> {'
    );
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);
    const catchStart = body.indexOf('} catch (error: unknown) {');
    const catchBlock = body.slice(catchStart);

    expect(catchBlock).toContain(
      "introCardNoticeFromError(error, 'delete', locale)"
    );
    expect(catchBlock).not.toContain('setStage(');
  });

  it('intro-card / intro-card-edit の判定は ProfileHomeGate 内で Pet（Backup / Encounter / Creation）より前に行う', async () => {
    const text = await source();
    // Issue 79: `PassportApp` 本体へ `if` を追加すると Cognitive Complexity が
    // 上限を超えるため（既存の `ProfileHomeGate` / `BackupStageGate` と同じ設計判断）、
    // 判定自体を `ProfileHomeGate` の先頭へ委譲する。
    const gateStart = text.indexOf('function ProfileHomeGate({');
    const gateBody = text.slice(gateStart, text.indexOf('\n}\n', gateStart));

    expectInOrder(gateBody, [
      'INTRO_CARD_STAGES.has(stage)',
      '<IntroCardStageGate',
      'isBackupStage(stage)',
      "stage === 'encounter' && privateProfile",
      '<PassportCreationScreen',
    ]);
  });
});
