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
  it('説明、言語セクション、選択肢、戻るボタンの順に配置する（Issue 118: 配布能力デバッグ表示は削除済み）', async () => {
    const text = await source();

    expectInOrder(text, [
      't.description',
      't.languageSectionTitle',
      'LOCALES.map(',
      't.backButton',
    ]);
  });

  it('配布能力デバッグ表示（Runtime / Tier / Rules Provider / Local Model / Nearby Transport）を持たない（Issue 118: 一般ユーザー向け設定画面から開発者向け情報を除去）', async () => {
    const text = await source();

    expect(text).not.toContain('distributionCapability');
    expect(text).not.toContain('DistributionCapability');
    expect(text).not.toContain('distributionCapabilityNotice');
    expect(text).not.toContain('capabilityNotice');
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

  it('Issue 110: クイズボタンは Pilot Measurement ボタンと戻るボタンの間に配置し、onOpenQuiz を呼ぶ', async () => {
    const text = await source();

    expectInOrder(text, [
      'onPress={onOpenPilotMeasurement}',
      'accessibilityHint={t.quizButtonHint}',
      'label={t.quizButton}',
      'onPress={onOpenQuiz}',
      'label={t.backButton}',
    ]);
  });

  it('major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カード未作成時は会話エージェントの入口を disabled にし、理由を案内する', async () => {
    const text = await source();

    expect(text).toContain(
      'disabled={(modelManagement?.busy ?? false) || !hasIntroCard}'
    );
    expect(text).toContain(
      'hasIntroCard\n            ? t.conversationAgentButtonHint\n            : t.conversationAgentButtonDisabledHint'
    );
  });

  it('Follow-up F-FDRGS4: オンデバイス AI 導線は Document Picker の GGUF 選択より前に配置し、未取得時は明示同意ボタンだけを出す', async () => {
    const text = await source();

    expectInOrder(text, [
      't.modelSectionTitle',
      '<OnDeviceAiSection modelManagement={modelManagement} t={t} />',
      't.selectModelButton',
    ]);
    expect(text).toContain(
      "onDeviceAiFlow === 'idle' && onDeviceAiStatus === 'not-acquired'"
    );
    expectInOrder(text, [
      't.onDeviceAiDescription(',
      'accessibilityHint={t.onDeviceAiEnableButtonHint}',
      'label={t.onDeviceAiEnableButton}',
      'onPress={modelManagement.requestEnableOnDeviceAi}',
    ]);
  });

  it('Follow-up F-FDRGS4: ダウンロード前に Model 名・Size・ライセンス・同意確認を表示し、同意後だけダウンロードを開始する', async () => {
    const text = await source();

    expectInOrder(text, [
      "onDeviceAiFlow === 'consent-pending'",
      't.onDeviceAiConsentTitle',
      't.onDeviceAiConsentBody(',
      'source.displayName',
      'source.license',
      'label={t.onDeviceAiConsentStartButton}',
      'onPress={modelManagement.confirmEnableOnDeviceAiConsent}',
      'label={t.onDeviceAiConsentCancelButton}',
      'onPress={modelManagement.cancelEnableOnDeviceAiConsent}',
    ]);
  });

  it('Follow-up F-FDRGS4: ダウンロード中は進捗を Live Region で読み上げ、中止できる', async () => {
    const text = await source();

    // `OnDeviceAiDownloadingCard` は `OnDeviceAiSection` から呼ばれる子
    // Component として先に定義されるため、ファイル内の出現順は
    // 「進捗表示 -> 呼び出し側の分岐」になる。子 Component 内部の並び順と、
    // 親からの呼び出し条件をそれぞれ固定する。
    expectInOrder(text, [
      't.onDeviceAiDownloadStatus(',
      'label={t.onDeviceAiDownloadCancelButton}',
      'onPress={modelManagement.cancelOnDeviceAiDownload}',
    ]);
    expect(text).toContain(
      '<Text accessibilityLiveRegion="polite" style={styles.body}>\n        {t.onDeviceAiDownloadStatus('
    );
    expectInOrder(text, [
      "onDeviceAiFlow === 'downloading'",
      '<OnDeviceAiDownloadingCard',
    ]);
  });

  it('Follow-up F-FDRGS4（code-reviewer 指摘、Cancel の実効性）: import/activate 中は Cancel を出さず仕上げ処理中であることだけを案内する', async () => {
    const text = await source();

    expectInOrder(text, [
      "onDeviceAiFlow === 'finalizing'",
      't.onDeviceAiFinalizingStatus',
    ]);
    expect(text).toContain(
      '<Text accessibilityLiveRegion="polite" style={styles.body}>\n          {t.onDeviceAiFinalizingStatus}'
    );
    // 'finalizing' の分岐だけを切り出し、Cancel ボタンを含まないことを固定する。
    const finalizingStart = text.indexOf("onDeviceAiFlow === 'finalizing'");
    const consentStart = text.indexOf(
      "onDeviceAiFlow === 'consent-pending'",
      finalizingStart
    );
    const finalizingBlock = text.slice(finalizingStart, consentStart);
    expect(finalizingBlock).not.toContain('onDeviceAiDownloadCancelButton');
  });

  it('Follow-up F-FDRGS4: 取得済みは使用中/未使用を示し、無効化(削除)は既存 deleteModel 経路（removeOnDeviceAiModel）へ委譲する', async () => {
    const text = await source();

    expect(text).toContain(
      "onDeviceAiFlow === 'idle' &&\n      onDeviceAiStatus &&\n      onDeviceAiStatus !== 'not-acquired'"
    );
    expectInOrder(text, [
      "onDeviceAiStatus === 'active'\n              ? t.onDeviceAiActiveStatus\n              : t.onDeviceAiImportedNotActiveStatus",
      'label={t.onDeviceAiRemoveButton}',
      'onPress={modelManagement.removeOnDeviceAiModel}',
    ]);
  });

  it('Follow-up F-FDRGS4（code-reviewer 指摘）: Expo Go / Web は modelManagement.available の分岐で ModelManagementSection ごと表示せず、OnDeviceAiSection の source null 分岐は将来の構成差分に備えた防御的な二重チェックである', async () => {
    const text = await source();

    // 実際の Expo Go / Web 除外は呼び出し側（modelManagement?.available）が担う。
    expect(text).toContain(
      'modelManagement?.available ? (\n        <ModelManagementSection'
    );
    // trustedModelSource は現状 native の唯一の実装で必ず設定されるため
    // 到達しないが、将来 source を持たない構成が増えたときのための防御。
    expect(text).toContain('if (!source) return null;');
  });
});
