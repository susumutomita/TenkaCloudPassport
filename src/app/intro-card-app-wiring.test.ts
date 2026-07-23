import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

/**
 * Issue 79: `PassportApp.tsx` はレンダリング用の統合テスト基盤を持たないため
 * （既存の `passport-app-stage-flow.test.ts` と同じ理由）、
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

  it('resetAllLocalMemory・closeSettings は introCardHomeStage 経由で着地先を決める（Pet 側の固定値に戻らない）', async () => {
    const text = await source();

    for (const marker of [
      'const resetAllLocalMemory = useCallback(',
      'function closeSettings(): void {',
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
      'settleIntroCardLoad(introCardStorage.load())',
      'introCardStorage.loadDraft().catch(() => null)',
      // Issue 111: 保存済みの明示言語選択も同じ Promise.all へ束ね、Profile /
      // Intro Card と同じコミットで反映する。
      'localePreferenceStorage.load().catch(() => null)',
      ']).then(([result, introCardLoad, loadedDraft, savedLocale]) => {',
      // Issue 111 major fix（Codex Finding 1）: effective locale を先に確定してから
      // Intro Card Notice を組み立てる（`introCardStorage.load()` と
      // `localePreferenceStorage.load()` のどちらが先に解決するかに依存しない）。
      'const effectiveLocale = applyEffectiveStartupLocale(savedLocale);',
      'const introCardOutcome = startupIntroCardOutcome(',
      'introCardRef.current = introCardOutcome.card',
      'setIntroCard(introCardOutcome.card)',
      'setIntroCardNotice(introCardOutcome.notice)',
      'applyIntroCardDraftFields(loadedDraft)',
      'setIntroCardDraftHydrated(true)',
      "result.kind === 'recovery-failed'",
      'applyStartupRecoveryResultRef.current(result)',
    ]);
  });

  it('起動時の Intro Card Notice は effective locale が確定した後にだけ組み立てる（Codex Finding 1: 保存済み選好の反映前に locale 依存の起動通知を作らない）', async () => {
    const text = await source();
    const effectStart = text.indexOf('void Promise.all([');
    const effectBody = text.slice(
      effectStart,
      text.indexOf('return () => {', effectStart)
    );

    // introCardStorage.load() 自体の catch は Notice を作らず、成否を
    // settleIntroCardLoad の戻り値へ畳み込むだけにする（レースの温床だった
    // 個別 catch ハンドラを廃止した）。
    expect(effectBody).not.toContain('introCardStorage.load().catch(');
    expect(effectBody).not.toContain(
      "introCardNoticeFromError(error, 'load', localeRef.current)"
    );

    // 順序（effectiveLocale 確定 → introCardOutcome 導出 → Notice 反映）自体は
    // 直前の test で expectInOrder により固定済みのため、ここでは重複させない。
    const thenStart = effectBody.indexOf(
      ']).then(([result, introCardLoad, loadedDraft, savedLocale]) => {'
    );
    const thenBody = effectBody.slice(thenStart);
    const outcomeAt = thenBody.indexOf(
      'const introCardOutcome = startupIntroCardOutcome('
    );
    expect(outcomeAt).toBeGreaterThan(-1);

    // Notice 組み立て（`startupIntroCardOutcome` 呼び出しより前）が
    // `localeRef.current` を直接読まないこと（effective locale の解決自体は
    // `applyEffectiveStartupLocale` 内に閉じ込め、`.then()` 本体からは
    // effectiveLocale という確定値だけを使う）。
    const beforeOutcome = thenBody.slice(0, outcomeAt);
    expect(beforeOutcome).not.toContain('localeRef.current');
  });

  it('applyEffectiveStartupLocale・startupIntroCardOutcome は effective locale の確定と Notice 組み立てを分離する（Issue 111 major fix / Finding 3: Cognitive Complexity 対応のリファクタリング）', async () => {
    const text = await source();

    const applyStart = text.indexOf(
      'const applyEffectiveStartupLocale = useCallback('
    );
    // パラメータ宣言（`(savedLocale: Locale | null): Locale => {`）に含まれる
    // 'savedLocale' という文字列自体が、呼び出し式内の同じ文字列より前に
    // マッチしてしまわないよう、本体（`=> {` の後）から切り出す。
    const applyBodyStart = text.indexOf('=> {', applyStart) + '=> {'.length;
    const applyEnd = text.indexOf('\n  );', applyStart);
    const applyBody = text.slice(applyBodyStart, applyEnd);
    expectInOrder(applyBody, [
      'const effectiveLocale = resolveEffectiveStartupLocale(',
      'localeRef.current,',
      'savedLocale',
      'if (effectiveLocale !== localeRef.current) {',
      'setLocale(effectiveLocale);',
      'localeRef.current = effectiveLocale;',
      'return effectiveLocale;',
    ]);

    const outcomeStart = text.indexOf('function startupIntroCardOutcome(');
    const outcomeEnd = text.indexOf('\n}\n', outcomeStart);
    const outcomeBody = text.slice(outcomeStart, outcomeEnd);
    expect(outcomeBody).toContain('if (introCardLoad.ok) {');
    expect(outcomeBody).toContain(
      'notice: buildInitialIntroCardNotice(effectiveLocale),'
    );
    expect(outcomeBody).toContain('notice: introCardNoticeFromError(');
  });

  it('起動時 effect は下書きが空でなければ水和し、result の分岐（recovery-failed 早期 return）より前に必ず introCardDraftHydrated を立てる（Issue 93）', async () => {
    const text = await source();
    const effectStart = text.indexOf('void Promise.all([');
    const effectBody = text.slice(
      effectStart,
      text.indexOf('return () => {', effectStart)
    );

    expect(effectBody).toContain(
      'if (loadedDraft && !isEmptyIntroCardDraft(loadedDraft)) {'
    );
    const hydratedSetAt = effectBody.indexOf('setIntroCardDraftHydrated(true)');
    const recoveryFailedAt = effectBody.indexOf(
      "result.kind === 'recovery-failed'"
    );
    expect(hydratedSetAt).toBeGreaterThan(-1);
    expect(hydratedSetAt).toBeLessThan(recoveryFailedAt);
  });

  it('下書き永続化 effect は introCardDraftHydrated が true になるまで何もせず、全欄空なら clearDraft、そうでなければ saveDraft を fire-and-forget で呼ぶ（Issue 93）', async () => {
    const text = await source();
    const start = text.indexOf(
      '* Issue 93: 編集画面の入力欄（11 個の draft state）が変わるたびに、下書き'
    );
    const effectStart = text.indexOf('useEffect(() => {', start);
    const effectEnd = text.indexOf(
      '}, [introCardDraftFieldsSnapshot, introCardDraftHydrated, introCardStorage]);',
      effectStart
    );
    const body = text.slice(effectStart, effectEnd);

    expectInOrder(body, [
      'if (!introCardDraftHydrated) return;',
      'const fields = introCardDraftFieldsSnapshot();',
      'if (isEmptyIntroCardDraft(fields)) {',
      'introCardStorage.clearDraft().catch(() => undefined);',
      '} else {',
      'introCardStorage.saveDraft(fields).catch(() => undefined);',
    ]);
  });

  it('openIntroCardEdit は下書きが空のときだけ保存済みカードから初期値を組み立て、下書きがあれば優先してそのまま使う（Issue 93）', async () => {
    const text = await source();
    const start = text.indexOf('function openIntroCardEdit(): void {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain(
      'if (introCard && isEmptyIntroCardDraft(introCardDraftFieldsSnapshot())) {'
    );
    expect(body).toContain('loadIntroCardDraftFrom(introCard);');
  });

  it('deleteIntroCard は introCardStorage.remove の直後に下書きも明示的に clearDraft する（アプリ強制終了で永続化 effect が間に合わない場合の保険、Issue 93）', async () => {
    const text = await source();
    const start = text.indexOf(
      'async function deleteIntroCard(): Promise<void> {'
    );
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      'await introCardStorage.remove();',
      'introCardStorage.clearDraft().catch(() => undefined);',
      'introCardRef.current = null;',
      'setIntroCard(null);',
      'applyIntroCardDraftFields(EMPTY_INTRO_CARD_DRAFT_FIELDS);',
    ]);
  });

  it('ProfileHomeGate から IntroCardStageGate へ言語切替・編集・削除の導線を渡す（Issue 118: Backup・Settings への導線は削除済み）', async () => {
    const text = await source();
    const gateCallStart = text.indexOf('<IntroCardStageGate');
    const gateCallEnd = text.indexOf('/>', gateCallStart);
    const gateCall = text.slice(gateCallStart, gateCallEnd);

    expect(gateCall).toContain('onChangeLocale={onChangeLocale}');
    expect(gateCall).toContain('onEdit={onEditIntroCard}');
    expect(gateCall).toContain('onDelete={onDeleteIntroCard}');
    expect(gateCall).not.toContain('onOpenBackup');
    expect(gateCall).not.toContain('onOpenSettings');

    const passportAppCallStart = text.indexOf(
      'onDeleteIntroCard={() => void deleteIntroCard()}'
    );
    expect(passportAppCallStart).toBeGreaterThan(-1);
    expect(text).toContain('onEditIntroCard={openIntroCardEdit}');
  });

  it('IntroCardStageGate は IntroCardScreen・IntroCardEditScreen の両方へ言語切替導線をそのまま渡す（Issue 118）', async () => {
    const text = await source();

    const introCardBlockStart = text.indexOf('<IntroCardScreen');
    const introCardBlockEnd = text.indexOf('/>', introCardBlockStart);
    const introCardBlock = text.slice(introCardBlockStart, introCardBlockEnd);
    expect(introCardBlock).toContain('onChangeLocale={onChangeLocale}');
    expect(introCardBlock).toContain('onEdit={onEdit}');
    expect(introCardBlock).toContain('onDelete={onDelete}');
    expect(introCardBlock).toContain('deleteError={');
    expect(introCardBlock).toContain(
      "edit.notice.kind === 'delete-error' ? edit.notice.message : null"
    );

    const editBlockStart = text.indexOf('<IntroCardEditScreen');
    const editBlockEnd = text.indexOf('/>', editBlockStart);
    const editBlock = text.slice(editBlockStart, editBlockEnd);
    expect(editBlock).toContain('onChangeLocale={onChangeLocale}');
    expect(editBlock).toContain('onSave={edit.onSave}');
  });

  it('saveIntroCard は保存前に createIntroCard と encodeIntroCardUrl の両方で検証してから introCardStorage.save を呼ぶ（Issue 84: QR の中身が URL へ変わったため検証対象も揃える）', async () => {
    const text = await source();
    const start = text.indexOf(
      'async function saveIntroCard(): Promise<void> {'
    );
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      'createIntroCard(introCardDraftAsShape())',
      'encodeIntroCardUrl(card)',
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

  it('intro-card / intro-card-edit の判定は ProfileHomeGate 内で Pet（Encounter / Creation）より前に行う（Issue 118: Backup Stage 自体を削除済み）', async () => {
    const text = await source();
    // Issue 79: `PassportApp` 本体へ `if` を追加すると Cognitive Complexity が
    // 上限を超えるため（既存の `ProfileHomeGate` と同じ設計判断）、
    // 判定自体を `ProfileHomeGate` の先頭へ委譲する。
    const gateStart = text.indexOf('function ProfileHomeGate({');
    const gateBody = text.slice(gateStart, text.indexOf('\n}\n', gateStart));

    expectInOrder(gateBody, [
      'INTRO_CARD_STAGES.has(stage)',
      '<IntroCardStageGate',
      "stage === 'encounter' && privateProfile",
      '<PassportCreationScreen',
    ]);
    expect(gateBody).not.toContain('isBackupStage');
  });

  it('resolveIntroCardErrorFieldKey は links フィールドだけ firstInvalidNamedLinkField で名前付き欄まで絞り込み、他はそのまま返す（Issue 92）', async () => {
    const text = await source();
    const start = text.indexOf('function resolveIntroCardErrorFieldKey(');
    const end = text.indexOf('\n}\n', start);
    const body = text.slice(start, end);

    expect(body).toContain(
      "if (notice.kind !== 'validation-error' || notice.field === undefined) {"
    );
    expect(body).toContain(
      "if (notice.field !== 'links') return notice.field;"
    );
    expect(body).toContain('return firstInvalidNamedLinkField(linksDraft);');
  });

  it('saveIntroCard の catch 節は、保存時点の draft スナップショットから resolveIntroCardErrorFieldKey で 1 回だけ該当欄を解決する（Issue 92）', async () => {
    const text = await source();
    const start = text.indexOf(
      'async function saveIntroCard(): Promise<void> {'
    );
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);
    const catchStart = body.indexOf('} catch (error: unknown) {');
    const catchBlock = body.slice(catchStart);

    expectInOrder(catchBlock, [
      "const nextNotice = introCardNoticeFromError(error, 'save', locale);",
      'setIntroCardNotice(nextNotice);',
      'setIntroCardErrorFieldKey(',
      'resolveIntroCardErrorFieldKey(nextNotice, introCardLinksDraftShape())',
    ]);
  });

  it('introCardDraftAsShape と saveIntroCard の catch 節は、同じ introCardLinksDraftShape() で links の draft を組み立てる（simplify レビュー指摘: 同じ object literal の重複を解消）', async () => {
    const text = await source();

    expect(text).toContain(
      'function introCardLinksDraftShape(): IntroCardLinksDraft {'
    );
    expect(text).toContain(
      'links: buildIntroCardLinks(introCardLinksDraftShape()),'
    );
    expect(
      text.match(/introCardLinksDraftShape\(\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(3);
  });

  it('保存成功・編集画面を開く・削除成功の各経路は errorFieldKey を undefined へ戻す（Issue 92: 前回の保存失敗の focus 対象を持ち越さない）', async () => {
    const text = await source();

    const saveStart = text.indexOf(
      'async function saveIntroCard(): Promise<void> {'
    );
    const saveTryBody = text.slice(
      saveStart,
      text.indexOf('} catch', saveStart)
    );
    expectInOrder(saveTryBody, [
      "kind: 'saved',",
      'setIntroCardErrorFieldKey(undefined);',
      "setStage('intro-card');",
    ]);

    const openStart = text.indexOf('function openIntroCardEdit(): void {');
    const openEnd = text.indexOf('\n  }', openStart);
    const openBody = text.slice(openStart, openEnd);
    expect(openBody).toContain('setIntroCardErrorFieldKey(undefined);');

    const deleteStart = text.indexOf(
      'async function deleteIntroCard(): Promise<void> {'
    );
    const deleteEnd = text.indexOf('\n  }', deleteStart);
    const deleteBody = text.slice(deleteStart, deleteEnd);
    const deleteCatchStart = deleteBody.indexOf('} catch (error: unknown) {');
    const deleteTryBody = deleteBody.slice(0, deleteCatchStart);
    expect(deleteTryBody).toContain('setIntroCardErrorFieldKey(undefined);');
  });

  it('IntroCardEditScreen へ errorFieldKey を渡し、introCardEdit の branch props にも含める（Issue 92）', async () => {
    const text = await source();

    const editBlockStart = text.indexOf('<IntroCardEditScreen');
    const editBlockEnd = text.indexOf('/>', editBlockStart);
    const editBlock = text.slice(editBlockStart, editBlockEnd);
    expect(editBlock).toContain('errorFieldKey={edit.errorFieldKey}');

    const branchStart = text.indexOf('introCardEdit={{');
    const branchEnd = text.indexOf('\n      }}', branchStart);
    const branchBody = text.slice(branchStart, branchEnd);
    expect(branchBody).toContain('errorFieldKey: introCardErrorFieldKey,');
  });
});
