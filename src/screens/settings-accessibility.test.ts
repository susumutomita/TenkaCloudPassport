import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'SettingsScreen.tsx');
}

/**
 * Issue 15 の受け入れ条件「Settings（言語切り替え）」を Screen のソーステキストで固定する。
 * この repo はレンダリング用の統合テスト基盤を持たないため、他の Screen の
 * Accessibility 契約と同じくソーステキスト検査で担保する。
 */
describe('Settings 画面（言語切り替え）の Accessibility 契約', () => {
  it('説明、現在の配布能力、言語セクション、選択肢、戻るボタンの順に配置する', async () => {
    const text = await source();

    expectInOrder(text, [
      't.description',
      't.distributionSectionTitle',
      'capabilityNotice.runtime',
      'capabilityNotice.tier',
      'capabilityNotice.rulesProvider',
      'capabilityNotice.localModel',
      'capabilityNotice.nearbyTransport',
      't.languageSectionTitle',
      'LOCALES.map(',
      't.backButton',
    ]);
  });

  it('配布能力は Platform Composition から受け取り、Screen 内で Runtime を推測しない', async () => {
    const text = await source();

    expect(text).toContain('distributionCapability: DistributionCapability');
    expect(text).toMatch(
      /distributionCapabilityNotice\(\s*distributionCapability,\s*locale\s*\)/
    );
    expect(text).not.toContain('isRunningInExpoGo');
    expect(text).not.toContain('Platform.OS');
  });

  it('各言語の選択肢は ActionButton で表示され、選択中かどうかを variant と文言の両方で示す', async () => {
    const text = await source();

    expect(text).toContain('variant={selected ? ');
    expect(text).toContain('t.languageOptionAccessibilityLabel(');
    expect(text).toContain('accessibilityHint={t.languageOptionHint}');
  });

  it('言語切替は onChangeLocale だけを呼び、Lounge / Room / Profile の state に触れない', async () => {
    const text = await source();

    expect(text).toContain('onPress={() => onChangeLocale(option)}');
    for (const forbidden of [
      'setLounge',
      'setLoungeRoom',
      'setInteraction',
      'setPrivateProfile',
      'discardInviteFlow',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('LOCALES の全 Locale 分の選択肢を用意する（JA/EN の両方）', async () => {
    const text = await source();

    expect(text).toContain("from '../app/i18n/locale'");
    expect(text).toContain('LOCALES');
  });

  it('Issue 18: Picker 選択後に Size・Copy 前空き容量・警告を表示し、Owner 確定まで Import を開始しない', async () => {
    const text = await source();

    expect(text).toContain('modelManagement.selectCandidate');
    expect(text).toContain('modelManagement.candidate');
    expectInOrder(text, [
      't.candidateSummary(',
      't.candidateAvailableStorage(',
      't.candidateWarning',
      'onPress={onConfirm}',
    ]);
    expect(text).toContain('readableBytes(candidate.sizeBytes)');
    expect(text).toContain('availableStorageBytes');
    expectInOrder(text, [
      'importInProgress',
      't.cancelRunningImportButton',
      'onPress={onCancelRunning}',
    ]);
  });

  it('Issue 18: supported / caution / blocked と active 状態を示し、blocked は再評価なしに Context を開始しない', async () => {
    const text = await source();

    expect(text).toContain("model.risk.level === 'supported'");
    expect(text).toContain("model.risk.level === 'caution'");
    expect(text).toContain("model.risk.level === 'blocked'");
    expect(text).toContain('t.reassessBlockedModelButton');
    expect(text).toContain("model.risk.level === 'blocked'");
    expect(text).toContain('t.confirmCautionButton');
    expect(text).toContain('t.blockedDescription');
    expect(text).toContain('riskBasis(model, t)');
    expect(text).toContain('model.risk.estimatedWorkingSetBytes');
    expect(text).toContain('model.risk.effectiveMemoryBytes');
    expect(text).toContain('model.risk.ratioPermille');
    expect(text).toContain('model.risk.reasons.map(');
  });

  it('Issue 18: Unload / Delete と内容非保持 Benchmark を表示し、File URI や digest は画面へ出さない', async () => {
    const text = await source();

    expect(text).toContain('onUnload={modelManagement.unload}');
    expect(text).toContain('onDelete={modelManagement.deleteModel}');
    expect(text).toContain('t.benchmarkSummary(');
    expect(text).toContain('latestImport?.importDurationMs');
    expect(text).toContain('latestExecution?.loadDurationMs');
    expect(text).toContain('latestExecution?.firstTokenDurationMs');
    expect(text).toContain('latestExecution?.completionDurationMs');
    expect(text).toContain('latestResource.peakProcessMemoryBytes');
    expect(text).toContain('latestResource.thermalStateBefore');
    expect(text).toContain('latestResource.thermalStateAfter');
    expect(text).toContain('latestResource.batteryDeltaPermille');
    expect(text).not.toContain('model.privateUri');
    expect(text).not.toContain(
      't.importedModelSummary(\n                    model.sha256'
    );
  });

  it('Issue 18: 長時間処理と Error を Live Region で読み上げ、全操作に disabled 状態を付ける', async () => {
    const text = await source();

    expect(text).toContain('accessibilityLiveRegion="polite"');
    expect(text).toContain('accessibilityLiveRegion="assertive"');
    expect(text).toContain('disabled={modelManagement.busy}');
    expect(text).toContain('modelManagement.candidateSelectionBlocked');
  });

  it('Issue 18: 進行中の Local Model 判定を終える操作は影響を説明してから Confirm / Cancel を提示する', async () => {
    const text = await source();

    expectInOrder(text, [
      'modelManagement.pendingProviderOperation',
      't.providerOperationTitle',
      't.providerOperationDescription',
      't.confirmProviderOperationButton',
      'modelManagement.confirmProviderOperation',
      't.cancelProviderOperationButton',
      'modelManagement.cancelProviderOperation',
    ]);
  });
});
