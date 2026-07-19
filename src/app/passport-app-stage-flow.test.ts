import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

/**
 * PassportApp.tsx はレンダリング用の統合テスト基盤（React Testing Library 相当）を
 * 持たないため（新規依存を増やさない方針）、各関数の本体が正しい次の Stage へ
 * 遷移することをソーステキスト検査で固定する。過去に、Encounter 完了後の遷移先を
 * 誤って書き換え、Host が Invite QR へ到達できない回帰が発生したため、その再発を
 * この Test で防ぐ。
 */
function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'PassportApp.tsx');
}

const FUNCTION_NAMES = [
  'saveLocalProfile',
  'continueToPreview',
  'hostLounge',
  'markHostReady',
  'beginGuestScan',
  'performScan',
  'guestReady',
  'discardInviteFlow',
  'applyRoomAdvance',
  'applyLoungeAdvance',
  'startPetInteraction',
  'submitOwnerAnswer',
  'endInvite',
  'cancelInvite',
  'leave',
  'endAsHost',
  'complete',
  'restartEncounter',
  'editLocalProfile',
] as const;

/**
 * `{` / `}` の対応だけで関数本体を切り出す。対象関数（PassportApp.tsx の Stage 遷移
 * 関数）は文字列 / テンプレートリテラルの中に `{` や `}` を含まないため、この単純な
 * 深さ計測で正しく切り出せる。`function NAME(...) {` 宣言と、`useCallback` で包んだ
 * `const NAME = ... => {` 宣言の両方に対応する。将来、対象関数の本文にそのような文字を
 * 含む文字列リテラルを足す場合は、この前提が崩れないことを確認すること。
 */
function functionBody(text: string, name: string): string {
  const declarationPattern = new RegExp(
    `(?:function ${name}\\([^)]*\\)[^{]*|const ${name}\\s*=[^{]*)\\{`
  );
  const match = declarationPattern.exec(text);
  if (!match || match.index === undefined) {
    throw new Error(`関数 ${name} が見つかりません。`);
  }
  const start = match.index + match[0].length;
  let depth = 1;
  let index = start;
  while (depth > 0 && index < text.length) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') depth -= 1;
    index += 1;
  }
  return text.slice(start, index);
}

describe('PassportApp の Stage 遷移契約', () => {
  it('各関数の本体を過不足なく抽出できる', async () => {
    const text = await source();
    for (const name of FUNCTION_NAMES) {
      expect(functionBody(text, name).length).toBeGreaterThan(0);
    }
  });

  it('保存・復元は Encounter（相手の公開内容入力）へ進む', async () => {
    const text = await source();

    expect(functionBody(text, 'saveLocalProfile')).toContain(
      "setStage('encounter')"
    );
    expect(text).toContain("setStage('encounter')");
  });

  it('Encounter の続行は Owner 自身の共有 Preview（Host 前段）へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'continueToPreview');

    expect(body).toContain("setStage('share-preview')");
    expect(body).not.toContain("setStage('guest-share-preview')");
  });

  it('Owner の Lounge 開始操作は Host Invite 画面（QR 表示）へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'hostLounge');

    expect(body).toContain("setStage('host-invite')");
    expect(body).toContain('joinLoungeRoom');
    expect(body).toContain('qrScannerPort.publish(');
  });

  it('ゲストとして QR を読み取る操作は Guest Scan 画面へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'beginGuestScan');

    expect(body).toContain("setStage('guest-scan')");
  });

  it('Scan 成功後は新規入力を求めず Guest の共有 Preview へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'performScan');

    expect(body).toContain("setStage('guest-share-preview')");
    expect(body).not.toContain("setStage('encounter')");
    expect(body).toContain('resolveGuestProfile');
  });

  it('Host / Guest どちらの Ready 操作も ready 到達時に Agent State Machine を開始し、Room の tick を破棄する', async () => {
    const text = await source();
    const hostBody = functionBody(text, 'markHostReady');
    const guestBody = functionBody(text, 'guestReady');

    for (const body of [hostBody, guestBody]) {
      expect(body).toContain("status === 'ready'");
      expect(body).toContain('activateReadyLounge');
    }
    const activationBody = functionBody(text, 'activateReadyLounge');
    expect(activationBody).toContain('startLoungeFromRoom');
    expect(activationBody).toContain('setLoungeRoom(null)');
  });

  it('Guest は Handshake 認証後だけ Public Passport を Room へ渡す', async () => {
    const body = functionBody(await source(), 'guestReady');

    expectInOrder(body, [
      'createLoungeJoinRequest',
      'authorizeJoin',
      'createPassportShare',
      'joinLoungeRoom',
    ]);
  });

  it('Guest 認証成功時点で Host Ready を待たず QR と Secret 参照を解放する', async () => {
    const body = functionBody(await source(), 'guestReady');

    expectInOrder(body, [
      'authorizeJoin',
      'qrScannerPort.publish(null)',
      'setIssuedHandshake(null)',
      'setScannedInvite(null)',
      'setSeenRawPayloads(new Set())',
      "readied.status === 'ready'",
    ]);
  });

  it('Guest Ready の二重実行を同期的に予約し RNG 失敗も同じ UI Error 経路へ収束させる', async () => {
    const body = functionBody(await source(), 'guestReady');

    expect(body).toContain('guestJoinInFlightRef.current');
    expectInOrder(body, [
      'guestJoinInFlightRef.current = true',
      'try {',
      'createParticipantId',
    ]);
    const failurePath = body.slice(body.indexOf('catch (error: unknown)'));
    expectInOrder(failurePath, [
      'catch (error: unknown)',
      'setErrorMessage',
      'finally',
      'guestJoinInFlightRef.current = false',
    ]);
  });

  it('Invite Flow の破棄は Handshake Key と走査済み Invite も解放する', async () => {
    const body = functionBody(await source(), 'discardInviteFlow');

    expect(body).toContain('issuedHandshake?.host.dispose()');
    expect(body).toContain('setIssuedHandshake(null)');
    expect(body).toContain('setScannedInvite(null)');
    expect(body).toContain('guestJoinInFlightRef.current = false');
    expect(body).toContain('inviteFlowGenerationRef.current += 1');
  });

  it('破棄後に完了した非同期 Handshake は状態を復活させず Key を破棄する', async () => {
    const hostBody = functionBody(await source(), 'hostLounge');

    expect(hostBody).toContain(
      'inviteFlowGenerationRef.current !== flowGeneration'
    );
    expect(hostBody).toContain('handshake.host.dispose()');
  });

  it('Pilot Start は現在世代の Handshake 成立後だけ加算し、失敗・破棄済み Lounge を数えない', async () => {
    const hostBody = functionBody(await source(), 'hostLounge');
    const handshakeRequest = hostBody.indexOf('issueLoungeHandshake({');
    const handshakeSuccess = hostBody.indexOf('.then((handshake) =>');
    const pilotStart = hostBody.indexOf('pilotMeasurementFlow.start()');

    expect(handshakeRequest).toBeGreaterThan(-1);
    expect(handshakeSuccess).toBeGreaterThan(handshakeRequest);
    expect(pilotStart).toBeGreaterThan(handshakeSuccess);
    expectInOrder(hostBody.slice(handshakeSuccess), [
      'inviteFlowGenerationRef.current !== flowGeneration',
      'handshake.host.dispose()',
      'return;',
      'pilotMeasurementFlow.start()',
      'qrScannerPort.publish(',
    ]);
  });

  it('Model 未導入の既定 Provider Status を Active Lounge へ明示的に渡す', async () => {
    const text = await source();

    expect(text).toContain('agentModelProvider = RULES_MODEL_PROVIDER');
    expect(text).toContain('useState<ProviderRuntimeState>');
    expect(text).toContain('providerStatus={providerRuntimeState.status}');
  });

  it('Issue 18: 進行中の判定を伴う Model 操作は Native Context の解放完了を待つ', async () => {
    const text = await source();
    const teardownBody = functionBody(text, 'waitForActiveProviderTeardown');
    const trackingBody = functionBody(text, 'trackProviderTeardown');

    expect(teardownBody).toContain('providerRunner');
    expect(teardownBody).toContain('.cancelAllAndWait()');
    expect(teardownBody).not.toContain('activeEncounterKeyRef.current = null');
    expect(teardownBody).toContain('providerResultApplicationGate.clear()');
    expect(teardownBody).toContain('trackProviderTeardown');
    expect(teardownBody).toContain('existing.then(cancelAfterDrain)');
    expect(trackingBody).toContain('providerTeardownPendingRef.current');
    expect(trackingBody).toContain('setProviderRunPending(true)');
    expect(trackingBody).toContain('setProviderRunPending(false)');
    expect(text).toContain(
      'waitForNativeTeardown: waitForActiveProviderTeardown'
    );
    expect(text).toContain('hasActiveProviderRun: providerRunPending');
    expect(text).toContain('ready: !restoring');
  });

  it('開始操作は共通 Provider Runner を通し、検証済み Decision だけを Lounge へ適用する', async () => {
    const text = await source();
    const body = functionBody(text, 'startPetInteraction');

    expect(body).toContain('providerRunner');
    expect(body).toContain('provider: localModels.provider');
    expect(body).toContain('applyAgentModelDecision');
    expect(body).toContain('activeEncounterKeyRef.current !== encounterKey');
    expect(body).toContain('providerTeardownPendingRef.current');
    expect(body).toContain('localModels.isMutationPending()');
    expectInOrder(body, [
      '.run({',
      'waitForSettledProviderTeardown()',
      'applyAgentModelDecisionBeforeLoungeExpiry',
    ]);
    expect(body).not.toContain(
      '.finally(() => providerRunner.waitForNativeTeardowns())'
    );
    expect(body).not.toContain('setProviderRunPending(false)');
    expect(body).toContain('providerResultApplicationGate.begin(encounterKey)');
    expect(body).toContain(
      'providerResultApplicationGate.settle(applicationToken)'
    );
    expect(body).toContain('applyAgentModelDecisionBeforeLoungeExpiry');
    expect(body).toContain('outcomeClock');
    expect(text).toContain('providerBusy={providerRunPending}');
  });

  it('起動削除 Recovery 後だけ Model を読み、外部 purge と同時に旧 Provider を無効化する', async () => {
    const text = await source();
    const recoveryStart = text.indexOf('recoverLocalStateAtStartup(');
    const recoveryEnd = text.indexOf('/**\n   * Issue 11:', recoveryStart);
    const recovery = text.slice(recoveryStart, recoveryEnd);
    const recoveryFailureStart = recovery.indexOf(
      "result.kind === 'recovery-failed'"
    );
    const recoveryFailure = recovery.slice(recoveryFailureStart);

    expect(text).toContain('ready: !restoring');
    expectInOrder(recoveryFailure, [
      "result.kind === 'recovery-failed'",
      'diagnosticsFlow.enterRecovery(result.error)',
    ]);
    expect(recoveryFailure).toContain(
      'diagnosticsFlow.enterRecovery(result.error);\n          return;'
    );
    expect(recovery).toContain('applyStartupRecoveryResultRef.current(result)');
    expect(text).toContain("result.kind === 'profile-load-failed'");
    expect(text).toContain("result.recovery === 'recovered'");
    expect(recovery).toContain(
      'recoverLocalStateAtStartup(localDataControl, localProfileStorage)'
    );
    expectInOrder(text.slice(text.indexOf('const retryStartupRecovery')), [
      'recoverLocalStateAtStartup(',
      "result.kind === 'recovery-failed'",
      'applyStartupRecoveryResultRef.current(result)',
    ]);
    expect(text).toContain('localModels.invalidateAfterExternalPurge()');
    expect(text).toContain(
      'onModelRemoved: localModels.invalidateAfterExternalPurge'
    );
  });

  it('Invite フローからの離脱経路（再開・Profile 編集）は discardInviteFlow を直接呼ぶ', async () => {
    const text = await source();

    for (const name of ['restartEncounter', 'editLocalProfile']) {
      expect(functionBody(text, name)).toContain('discardInviteFlow()');
    }
  });

  it('Lounge をキャンセルする操作は Room の Terminal Event 共通処理（endInvite）経由で discardInviteFlow を呼ぶ', async () => {
    const text = await source();

    expect(functionBody(text, 'cancelInvite')).toContain(
      "endInvite('host-ended')"
    );
    expect(functionBody(text, 'endInvite')).toContain('discardInviteFlow()');
  });

  it('QR Scan 画面から Passport 編集へ戻る操作は、Room データがあった場合だけ破棄済み Notice を表示する', async () => {
    const text = await source();
    const body = functionBody(text, 'editLocalProfile');

    expect(body).toContain('hadInviteInProgress');
    expect(body).toContain("kind: 'lounge-discarded'");
  });

  it('discardInviteFlow は相手の宣言内容（encountered*）も含めて Lounge 由来の一時データを破棄する', async () => {
    const text = await source();
    const body = functionBody(text, 'discardInviteFlow');

    // guestProfile / guestShareSelection の「元データ」である encountered* を
    // 一緒に初期化しない限り、'lounge-discarded' Notice が案内する
    // 「参加者、共有内容、Invite QR は残っていません」が事実と矛盾する
    // （相手が declare した Pet Name / 手掛かりが次の Encounter 画面に残ってしまう）。
    for (const resetCall of [
      'setEncounteredPetName(',
      'setEncounteredPetEmoji(',
      'setEncounteredSelection(',
      'setEncounteredConfirmed(',
    ]) {
      expect(body).toContain(resetCall);
    }
  });

  it('結果完了は Self-report 表示前の同一遷移で Lounge 内容と Interaction を破棄する', async () => {
    const text = await source();
    const body = functionBody(text, 'complete');

    expectInOrder(body, [
      'const showSelfReport',
      'discardInviteFlow()',
      'setInteraction(null)',
      "type: 'complete'",
      'setShowConversationSelfReport(showSelfReport)',
    ]);
    const discardBody = functionBody(text, 'discardInviteFlow');
    for (const resetCall of [
      'setGuestProfile(null)',
      'setGuestShareSelection(null)',
      "setEncounteredPetName('')",
      'setEncounteredSelection([])',
      'setSeenRawPayloads(new Set())',
    ]) {
      expect(discardBody).toContain(resetCall);
    }
  });

  it('QR Scan 画面から離脱して Profile を保存し直しても、相手の宣言内容が次の Encounter 画面へ残らない', async () => {
    // シナリオ: Guest として QR を読み取る（guest-scan）→ Passport 編集へ戻る
    // （onBackToProfile が editLocalProfile を呼ぶ）→ Local Profile を明示保存し直す
    // （saveLocalProfile が stage を 'encounter' へ進める）→ EncounterSetupScreen が
    // 再び表示される、という一連の経路で、相手の宣言内容（encountered*）が
    // 前回の Lounge のまま残っていないことを固定する。
    const text = await source();

    // 1. QrScanScreen の「Passport の編集へ戻る」は editLocalProfile を呼ぶ。
    expect(text).toContain('onBackToProfile={editLocalProfile}');

    // 2. editLocalProfile は discardInviteFlow を呼ぶ（Room データの有無に関わらず）。
    expect(functionBody(text, 'editLocalProfile')).toContain(
      'discardInviteFlow()'
    );

    // 3. discardInviteFlow が encountered* を初期値へ戻す（前段のテストで確認済みの
    //    契約を、このシナリオの一部として改めて固定する）。
    const discardBody = functionBody(text, 'discardInviteFlow');
    expect(discardBody).toContain("setEncounteredPetName('')");
    expect(discardBody).toContain('setEncounteredSelection([])');

    // 4. saveLocalProfile は保存成功後に 'encounter' 画面へ進み、`ProfileHomeGate` へ渡す
    //    `encounter` object は encounteredPetName / encounteredSelection の state を
    //    shorthand で直接渡す（別のキャッシュ値を経由しない）ため、初期化済みの値が
    //    そのまま画面へ反映される。
    expect(functionBody(text, 'saveLocalProfile')).toContain(
      "setStage('encounter')"
    );
    const encounterObjectBody = text.slice(
      text.indexOf('encounter={{'),
      text.indexOf('privateProfile={privateProfile}')
    );
    expect(encounterObjectBody).toContain('encounteredPetName,');
    expect(encounterObjectBody).toContain('encounteredSelection,');
  });

  it('Room の 20 分満了は tick / resume ハンドラの中で即座に破棄する（中間 render を作らない）', async () => {
    const text = await source();
    const body = functionBody(text, 'applyRoomAdvance');

    // Room の 'expired' を一度 state へ保持してから別の useEffect で検出する 2 段構えに
    // 戻すと、その間の 1 render だけ画面条件が崩れて Step 1 （PassportCreationScreen）へ
    // 一瞬フォールバックする回帰が起こるため、同じ関数の中で discardInviteFlow() と
    // setLounge(...) を同期的に呼ぶ実装を固定する。
    expect(body).toContain("advanced.status === 'expired'");
    expect(body).toContain('discardInviteFlow()');
    expect(body).toContain(
      "setLounge({ status: 'destroyed', reason: 'expired' })"
    );
    expect(body).toContain('setLoungeRoom(advanced)');

    // Room の tick と Background 復帰（resume）ハンドラの両方が、Room を直接
    // advanceLoungeRoom で更新するのではなく、この単一の関数へ委譲していることを固定する。
    const callSites = text.match(/applyRoomAdvance\(loungeRoom/g) ?? [];
    expect(callSites.length).toBe(2);
  });

  it('Guest の共有 Preview からの Back は再走査を強制する画面へ戻さない', async () => {
    const text = await source();

    expect(text).not.toContain("onBackToHostInvite'");
    // guest-share-preview の Back 実装が 'guest-scan' を setStage しないことを確認する。
    const guestPreviewIndex = text.indexOf("stage === 'guest-share-preview'");
    const sharePreviewIndex = text.indexOf(
      "stage === 'share-preview' &&",
      guestPreviewIndex
    );
    const guestPreviewBlock = text.slice(guestPreviewIndex, sharePreviewIndex);
    expect(guestPreviewBlock).not.toContain("setStage('guest-scan')");
  });

  describe('Issue 11: Owner Question の Consent Flow を Active Lounge の実判定経路へ配線する', () => {
    it('「会話の糸を探す」操作は Agent Model Decision で interaction と lounge の両方を更新する', async () => {
      const text = await source();
      const body = functionBody(text, 'startPetInteraction');

      expect(body).toContain('applyAgentModelDecisionBeforeLoungeExpiry(');
      expect(body).toContain('RULES_INTERACTION_PROVIDER');
      expect(body).toContain('setInteraction(step.interaction)');
      expect(body).toContain('setLounge(step.lounge)');
    });

    it('Owner Question への回答は submitOwnerQuestionAnswer の結果で interaction と lounge の両方を更新する', async () => {
      const text = await source();
      const body = functionBody(text, 'submitOwnerAnswer');

      expect(body).toContain('submitOwnerQuestionAnswer(');
      expect(body).toContain('setInteraction(step.interaction)');
      expect(body).toContain('setLounge(step.lounge)');
    });

    it('Active Lounge の tick / Background 復帰は Pet Interaction の 45 秒締切も同じ関数でまとめて評価する', async () => {
      const text = await source();
      const body = functionBody(text, 'applyLoungeAdvance');

      expect(body).toContain('applyPetInteractionTick(');
      expect(body).toContain("step.lounge.status !== 'active'");
      expect(body).toContain('setInteraction(step.interaction)');

      // Active Lounge の 1 秒 tick と Background 復帰（resume）の両方が、この単一の関数へ
      // 委譲していることを固定する（Room 側の applyRoomAdvance と同じ設計原則）。
      const callSites = text.match(/applyLoungeAdvance\(lounge,/g) ?? [];
      expect(callSites.length).toBe(2);
    });

    it('Active Lounge 自体が 20 分満了した場合、clarifying 中の interaction も確実に破棄する', async () => {
      const text = await source();
      const body = functionBody(text, 'applyLoungeAdvance');

      // Pet Interaction の 45 秒締切ではなく、Lounge 本体の期限（reduceLounge）が
      // 'active' から他の状態へ落としたケースでも interaction を null に戻す。
      expect(body).toContain(
        "current.status === 'active' && advanced.status !== 'active'"
      );
      expect(body).toContain('setInteraction(null)');
    });

    it('applyLoungeAdvance は締切内で変化がない場合の再設定という到達しない分岐を持たない', async () => {
      const text = await source();
      const body = functionBody(text, 'applyLoungeAdvance');

      // applyPetInteractionTick は変化がなければ同じ interaction 参照を返す契約
      // のため、`step.interaction !== interaction` を確認する分岐は常に false にしか
      // ならない到達不能コードだった。この分岐を削除したことを固定する。
      expect(body).not.toContain('step.interaction !== interaction');
    });

    it('clarifying 中に退出・Host 終了しても interaction を確実に破棄する', async () => {
      const text = await source();

      for (const name of ['leave', 'endAsHost'] as const) {
        expect(functionBody(text, name)).toContain('setInteraction(null)');
      }
    });

    it('新しい Active Lounge 開始（Ready 到達）は必ず interaction を初期化する', async () => {
      const text = await source();
      const body = functionBody(text, 'activateReadyLounge');

      expect(body).toContain('setInteraction(null)');
      expect(body).toContain('startLoungeFromRoom(');
      expect(body).toContain('activeEncounterKeyRef.current = room.loungeId');
    });

    it('Lounge Exit / Host 終了 / 再開 / Diagnostic 破棄は実行中 Native Provider を破棄する', async () => {
      const text = await source();

      for (const name of [
        'leave',
        'endAsHost',
        'restartEncounter',
        'forgetLoungeForDiagnostics',
      ] as const) {
        expect(functionBody(text, name)).toContain('cancelActiveProvider()');
      }
      expect(functionBody(text, 'cancelActiveProvider')).toContain(
        'providerRunner.forget(encounterKey)'
      );
      expect(functionBody(text, 'cancelActiveProvider')).toContain(
        'providerRunner.waitForNativeTeardowns()'
      );
    });

    it('非同期 Provider の確定時刻を Pilot Outcome に使い、開始時刻から推論時間を落とさない', async () => {
      const text = await source();
      const body = functionBody(text, 'startPetInteraction');

      expect(body).toContain('const outcomeClock = currentClock()');
      expect(body).toContain('recordPilotOutcome(');
      expect(body).toContain('outcomeClock');
      expect(body).toContain('pilotProviderRunFromOutcome(result.outcome)');
    });

    it('Encounter の再開も Lounge 由来の一時データと同様に interaction を破棄する', async () => {
      const text = await source();

      expect(functionBody(text, 'restartEncounter')).toContain(
        'setInteraction(null)'
      );
    });

    it('clarifying 中は Active Lounge Screen ではなく Owner Question Screen を表示する', async () => {
      const text = await source();

      expectInOrder(text, [
        "lounge?.status === 'active' && interaction?.phase === 'clarifying'",
        '<OwnerQuestionScreen',
        'onAnswer={submitOwnerAnswer}',
        "if (lounge?.status === 'active') {",
        '<ActiveLoungeScreen',
        'onBeginInteraction={startPetInteraction}',
      ]);
    });

    it('Owner Question Screen も他の Lounge 段階と同じ退出・Host 終了の Terminal Event を持つ', async () => {
      const text = await source();
      const ownerQuestionBlockStart = text.indexOf('<OwnerQuestionScreen');
      const activeLoungeBlockStart = text.indexOf(
        '<ActiveLoungeScreen',
        ownerQuestionBlockStart
      );
      const ownerQuestionBlock = text.slice(
        ownerQuestionBlockStart,
        activeLoungeBlockStart
      );

      expect(ownerQuestionBlock).toContain('onExit={leave}');
      expect(ownerQuestionBlock).toContain('onHostEnd={endAsHost}');
    });
  });

  describe('Issue 15: Settings（言語切り替え）は Lounge State と Consent を失わない', () => {
    it('stage === "settings" の判定は Lounge の状態確認より先に行う（Active Lounge 中でも Settings へ到達できる）', async () => {
      const text = await source();

      expectInOrder(text, [
        "if (stage === 'settings') {",
        '<SettingsScreen',
        "if (lounge?.status === 'active' && interaction?.phase === 'clarifying') {",
      ]);
    });

    it('実行中 Provider の Context を Settings 自動 reload として再評価しない', async () => {
      const text = await source();

      expect(text).toContain(
        "if (stage === 'settings' && !providerRunPending)"
      );
    });

    it('Issue 28: Settings へ実行時の配布能力をそのまま渡す', async () => {
      const text = await source();
      const settingsBlockStart = text.indexOf('<SettingsScreen');
      const settingsBlockEnd = text.indexOf('/>', settingsBlockStart);
      const settingsBlock = text.slice(settingsBlockStart, settingsBlockEnd);

      expect(settingsBlock).toContain(
        'distributionCapability={distributionCapability}'
      );
    });

    it('openSettings / closeSettings は setStage だけを呼び、Lounge / Room / Interaction / Profile の state に触れない', async () => {
      const text = await source();
      const forbiddenSetters = [
        'setLounge',
        'setLoungeRoom',
        'setInteraction',
        'setPrivateProfile',
        'setShareSelection',
        'setPetName',
        'setOwnerSelection',
      ];

      for (const name of ['openSettings', 'closeSettings']) {
        const body = functionBody(text, name);
        expect(body).toContain('setStage(');
        for (const forbidden of forbiddenSetters) {
          expect(body).not.toContain(forbidden);
        }
      }
    });

    it('discardInviteFlow / restartEncounter / leave / endAsHost / editLocalProfile は setLocale を一切呼ばない', async () => {
      const text = await source();

      for (const name of [
        'discardInviteFlow',
        'restartEncounter',
        'leave',
        'endAsHost',
        'editLocalProfile',
      ] as const) {
        expect(functionBody(text, name)).not.toContain('setLocale');
      }
    });

    it('applyLoungeAdvance / applyRoomAdvance（Room / Lounge の 1 秒 tick と Background 復帰）も setLocale を呼ばない', async () => {
      const text = await source();

      for (const name of ['applyLoungeAdvance', 'applyRoomAdvance'] as const) {
        expect(functionBody(text, name)).not.toContain('setLocale');
      }
    });

    it('Active Lounge 画面から Settings を開ける（onOpenSettings を渡す）', async () => {
      const text = await source();
      const activeLoungeStart = text.indexOf('<ActiveLoungeScreen');
      const activeLoungeEnd = text.indexOf('/>', activeLoungeStart);
      const activeLoungeBlock = text.slice(activeLoungeStart, activeLoungeEnd);

      expect(activeLoungeBlock).toContain('onOpenSettings={openSettings}');
    });

    it('PassportCreationScreen（Step 1）からも Settings を開ける', async () => {
      const text = await source();

      expect(text).toContain('onOpenSettings={onOpenSettings}');
    });

    it('PassportApp.tsx は setLocale を直接呼び出さず、SettingsScreen の onChangeLocale へ関数参照として渡すだけ', async () => {
      const text = await source();

      // PassportApp.tsx 自身は `setLocale(...)` という呼び出しを一度も行わない
      // （Settings 以外の Stage 遷移関数から locale を書き換える経路が無いことの固定）。
      expect(text.match(/setLocale\(/g) ?? []).toHaveLength(0);
      expect(text).toContain('onChangeLocale={setLocale}');
    });
  });
});
