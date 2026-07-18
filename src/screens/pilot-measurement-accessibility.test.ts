import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function feedbackSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'ConversationSelfReportScreen.tsx');
}

function measurementSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'PilotMeasurementScreen.tsx');
}

function settingsSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'SettingsScreen.tsx');
}

function appSource(): Promise<string> {
  return readSourceFile(import.meta.url, '../app/PassportApp.tsx');
}

describe('任意 Self-report 画面の Accessibility と即時退出契約', () => {
  it('任意説明、質問、3 回答、回答しない即時終了を同じ画面に順番に置く', async () => {
    const source = await feedbackSource();

    expectInOrder(source, [
      't.optionalNotice',
      't.question',
      't.startedConversationButton',
      't.notYetButton',
      't.preferNotToAnswerButton',
      't.skipButton',
    ]);
  });

  it('回答は選択値だけを callback へ渡し、自由記述入力や Lounge 内容を受け取らない', async () => {
    const source = await feedbackSource();

    expect(source).toContain("onAnswer('started-conversation')");
    expect(source).toContain("onAnswer('not-yet')");
    expect(source).toContain("onAnswer('prefer-not-to-answer')");
    expect(source).toContain('onPress={onSkip}');
    for (const forbidden of [
      'TextInput',
      'RetiredLounge',
      'PublicPassport',
      'Bridge',
      'ownerAlias',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('Composition Root は Lounge を complete で破棄してから Self-report を表示し、Exit / Host End では挟まない', async () => {
    const source = await appSource();
    const completeStart = source.indexOf('function complete()');
    const restartStart = source.indexOf(
      'function restartEncounter()',
      completeStart
    );
    const completeBody = source.slice(completeStart, restartStart);

    expect(completeBody).toContain("type: 'complete'");
    expectInOrder(completeBody, [
      'discardInviteFlow()',
      'setInteraction(null)',
      "type: 'complete'",
      'setShowConversationSelfReport(showSelfReport)',
    ]);
    expect(completeBody).toContain('pilotMeasurementFlow.selfReportPending');
    expect(source).toContain('<ConversationSelfReportScreen');
    expect(source).toContain('if (showConversationSelfReport)');

    const leaveBody = source.slice(
      source.indexOf('function leave()'),
      source.indexOf('function endAsHost()')
    );
    const hostEndBody = source.slice(
      source.indexOf('function endAsHost()'),
      completeStart
    );
    expect(leaveBody).not.toContain('setShowConversationSelfReport(true)');
    expect(hostEndBody).not.toContain('setShowConversationSelfReport(true)');
  });
});

describe('Pilot Aggregate Preview 画面の Accessibility 契約', () => {
  it('最低集計単位未満と Preview を区別し、JSON は Preview がある場合だけ表示する', async () => {
    const source = await measurementSource();

    expect(source).toContain('outcomeCount < PILOT_MINIMUM_AGGREGATION_UNIT');
    expect(source).toContain('t.belowMinimum(');
    expect(source).toContain('flow.preview ?');
    expect(source).toContain('flow.preview.json');
  });

  it('Research Counter は既定 OFF から別 Consent 確認後にだけ切り替える', async () => {
    const source = await measurementSource();

    expect(source).toContain('flow.researchEnabled');
    expect(source).toContain('t.researchDisabled');
    expect(source).toContain('t.enableResearchButton');
    expect(source).toContain('t.disableResearchButton');
    expect(source).toContain('flow.setResearchEnabled(');
  });

  it('再 Preview、明示 Share、戻るの順で ActionButton を置く', async () => {
    const source = await measurementSource();

    expectInOrder(source, [
      't.refreshButton',
      't.shareButton(flow.sharing)',
      't.backButton',
    ]);
    expect(source).toContain('disabled={!flow.preview || flow.sharing}');
  });

  it('Settings から Pilot Measurement を開く導線を Diagnostics と分離する', async () => {
    const source = await settingsSource();

    expect(source).toContain('onOpenPilotMeasurement');
    expect(source).toContain('t.pilotMeasurementButton');
    expect(source).toContain('t.diagnosticsButton');
  });
});
