import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'SettingsScreen.tsx');
}

/**
 * Issue 15 の受け入れ条件「Settings（言語切り替え）」を Screen のソーステキストで固定する。
 * この repo はレンダリング用の統合テスト基盤を持たないため、他の Screen の
 * Accessibility 契約と同じくソーステキスト検査で担保する。
 *
 * Issue 138（実機 blocker、owner TestFlight 実機フィードバック）: 生の GGUF
 * 選択・Model 一覧・import candidate カード・診断ボタン・Pilot Measurement
 * ボタンは開発者向けデバッグ UI であり、消費者ビルドでも露出していた
 * （「Settings がデバッグメニュー化している」）。これらは `__DEV__` ゲートでは
 * なく全ビルドから完全に除去し、消費者に残すのは 言語切替 /
 * `OnDeviceAiSection`（Qwen 有効化）/ クイズ / 会話 Agent / 簡潔な
 * 「全データ削除」/ 戻る だけにする。
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

  it('Issue 138（実機 blocker B）: 開発者向けの生 GGUF 選択・Model 一覧・import candidate カードを持たない（`__DEV__` ゲートではなく完全に除去し、owner がシミュレーターでも clean になったことを確認できる）', async () => {
    const text = await source();

    // コメントでの言及（除去した理由の説明）は許容し、実際の JSX 使用・
    // 関数定義だけが無いことを固定する。
    expect(text).not.toContain('label={t.selectModelButton}');
    expect(text).not.toContain('modelManagement.selectCandidate');
    expect(text).not.toContain('function LocalModelCard(');
    expect(text).not.toContain('function LocalModelCandidateCard(');
    expect(text).not.toContain('<LocalModelCard');
    expect(text).not.toContain('<LocalModelCandidateCard');
    expect(text).not.toContain('t.candidateSummary(');
    expect(text).not.toContain('t.candidateAvailableStorage(');
    expect(text).not.toContain('t.candidateWarning');
    expect(text).not.toContain('t.confirmImportButton');
    expect(text).not.toContain('t.cancelImportButton');
    expect(text).not.toContain('t.cancelRunningImportButton');
    expect(text).not.toContain('t.importedModelSummary(');
    expect(text).not.toContain('t.benchmarkSummary(');
    expect(text).not.toContain('t.modelSectionTitle');
    expect(text).not.toContain('t.modelDescription');
  });

  it('Issue 138（実機 blocker B）: 消費者 Settings は診断画面・Pilot Measurement への開発者向け導線を持たない', async () => {
    const text = await source();

    expect(text).not.toContain('onOpenDiagnostics');
    expect(text).not.toContain('onOpenPilotMeasurement');
    expect(text).not.toContain('diagnosticsButton');
    expect(text).not.toContain('pilotMeasurementButton');
  });

  it('Issue 138（実機 blocker A、DL 完了後フリーズの是正）: クイズ・会話 Agent・戻るは Local Model 操作中（busy）では disabled にしない（モデル DL 中でも他の消費者操作はできる）', async () => {
    const text = await source();
    const quizButtonStart = text.indexOf(
      'accessibilityHint={t.quizButtonHint}'
    );
    const quizButtonEnd = text.indexOf('/>', quizButtonStart);
    const quizButtonBlock = text.slice(quizButtonStart, quizButtonEnd);
    expect(quizButtonBlock).not.toContain('modelManagement');

    const backButtonStart = text.indexOf('label={t.backButton}');
    const backButtonBlockStart = text.lastIndexOf(
      '<ActionButton',
      backButtonStart
    );
    const backButtonBlock = text.slice(
      backButtonBlockStart,
      text.indexOf('/>', backButtonStart)
    );
    expect(backButtonBlock).not.toContain('modelManagement');
    // busy に連動した過剰 disable（旧: `modelManagement?.busy ?? false`）が
    // 3 ボタンのどこにも残っていないことを固定する。
    expect(text).not.toContain('modelManagement?.busy');
    expect(text).not.toContain('modelManagement.busy ?? false');
  });

  it('code-reviewer 指摘（Issue 138）: クイズ・会話 Agent・戻るは、全データ削除の確定処理中（dataErasure.busy）だけは disabled にする（resetAllLocalMemory による予期しない Stage 巻き戻しを避ける、`LocalDiagnosticsScreen` 自身の戻るボタンと同じ配慮）', async () => {
    const text = await source();

    expect(text).toContain(
      'accessibilityHint={t.quizButtonHint}\n        disabled={dataErasure.busy}'
    );
    expect(text).toContain('disabled={dataErasure.busy || !hasIntroCard}');
    expect(text).toContain(
      '<DataErasureSection dataErasure={dataErasure} locale={locale} t={t} />\n      <ActionButton\n        disabled={dataErasure.busy}\n        label={t.backButton}'
    );
  });

  it('major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カード未作成時は会話エージェントの入口を disabled にする。Issue 138（過剰 disable の是正）: modelManagement.busy では disabled にしない', async () => {
    const text = await source();

    expect(text).toContain('disabled={dataErasure.busy || !hasIntroCard}');
    // busy に連動した過剰 disable（旧: `(modelManagement?.busy ?? false) ||
    // !hasIntroCard`）が残っていないことを固定する。
    expect(text).not.toContain('modelManagement?.busy');
    expect(text).toContain(
      'hasIntroCard\n            ? t.conversationAgentButtonHint\n            : t.conversationAgentButtonDisabledHint'
    );
  });

  it('Follow-up F-FDRGS4: オンデバイス AI 導線は未取得時に明示同意ボタンだけを出す（Issue 138: 消費者ビルドに残る唯一の Local Model 導線）', async () => {
    const text = await source();

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

  it('Follow-up F-FDRGS4: 取得済みは使用中/未使用を示し、無効化(削除)は既存 deleteModel 経路（removeOnDeviceAiModel）へ委譲する（Issue 138: 消費者が容量を空けたい場合の唯一の削除導線）', async () => {
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

  it('Issue 18 / Issue 138: 長時間処理と Error を Live Region で読み上げ、Local Model 操作（同意・削除・注意確認・判定終了確認）だけに disabled 状態を付ける', async () => {
    const text = await source();

    expect(text).toContain('accessibilityLiveRegion="polite"');
    expect(text).toContain('accessibilityLiveRegion="assertive"');
    expect(text).toContain('disabled={modelManagement.busy}');
    expect(text).toContain('modelManagement.candidateSelectionBlocked');
  });

  it('Issue 18: 進行中の Local Model 判定を終える操作は影響を説明してから Confirm / Cancel を提示する（Qwen 有効化と共有する機構、Issue 138 でも維持）', async () => {
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

  it('Issue 18: Resource Risk が caution のときは確認カードを表示する（Qwen 有効化と共有する機構、Issue 138 でも維持）', async () => {
    const text = await source();

    expectInOrder(text, [
      'modelManagement.cautionAssessment',
      't.cautionTitle',
      't.cautionDescription',
      't.confirmCautionButton',
      'modelManagement.confirmCautionActivation',
    ]);
  });

  it('Issue 110: クイズボタンは会話 Agent ボタンより前、戻るボタンより前に配置し、onOpenQuiz を呼ぶ', async () => {
    const text = await source();

    expectInOrder(text, [
      'accessibilityHint={t.quizButtonHint}',
      'label={t.quizButton}',
      'onPress={onOpenQuiz}',
      'label={t.conversationAgentButton}',
      'label={t.backButton}',
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

  it('Issue 138（実機 blocker B）: 消費者向けの「全データ削除」導線は既存 useLocalDiagnosticsFlow の erasure 経路をそのまま再利用する', async () => {
    const text = await source();

    expect(text).toContain('export interface SettingsDataErasureProps');
    expect(text).toContain('readonly dataErasure: SettingsDataErasureProps');
    expect(text).toContain('<DataErasureSection dataErasure={dataErasure}');
    expectInOrder(text, [
      'label={t.eraseAllDataButton}',
      'onPress={dataErasure.requestDeleteAll}',
    ]);
    expectInOrder(text, [
      'dataErasure.deleteAllConfirmationRequested',
      't.eraseAllDataConfirmDescription',
      'label={t.eraseAllDataConfirmButton}',
      'dataErasure.confirmDeleteAll()',
      'label={t.eraseAllDataCancelButton}',
      'onPress={dataErasure.cancelDeleteAll}',
    ]);
  });

  it('Issue 138: 前回の全データ削除が完了しなかった（recoveryRequired）ときは、確認待ちより先に再試行カードを表示する', async () => {
    const text = await source();
    const functionStart = text.indexOf('function DataErasureSection(');
    // code-reviewer 指摘（low、test scoping bug）: `DataErasureSection` の
    // 閉じ `}` は `export default function SettingsScreen` より前にあるため、
    // 直後の `\n}\n` をそのまま探せば `DataErasureSection` 自身の範囲に収まる
    // （そこを跨いで `SettingsScreen` 側まで探索範囲を広げない）。
    const functionEnd = text.indexOf('\n}\n', functionStart);
    const body = text.slice(functionStart, functionEnd);

    expectInOrder(body, [
      'if (dataErasure.recoveryRequired) {',
      't.eraseAllDataRecoveryTitle',
      'label={t.eraseAllDataRetryButton}',
      'onPress={() => void dataErasure.retryRecovery()}',
      'if (dataErasure.deleteAllConfirmationRequested) {',
    ]);
  });

  it('Issue 138: 削除確認中に既存 erasure が失敗した場合は、diagnosticRecovery の案内文をその場に表示する（診断画面が開発者向けとして除去された後の唯一の到達経路）', async () => {
    const text = await source();

    expect(text).toContain("from '../app/diagnostic-recovery'");
    expect(text).toContain(
      'diagnosticRecovery(dataErasure.error.code, locale)'
    );
  });
});
