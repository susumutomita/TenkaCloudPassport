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
 * なく全ビルドから完全に除去した。
 *
 * v1.0（ADR-0038、owner 実機 TestFlight フィードバック）: オンデバイス LLM
 * （Qwen ダウンロード + llama.rn 推論）は、ダウンロードが 100% で完了せず固まる・
 * 未完了のまま会話 Agent を開くと native crash する の 2 件が実機で確認され、
 * 呼び出し元を実機テストできないため、Issue 138 で消費者ビルドに残した唯一の
 * Local Model 導線（`OnDeviceAiSection` / `ModelManagementSection`）も含めて
 * ここから完全に除去した。消費者に残すのは 言語切替 / 会話 Agent /
 * 簡潔な「全データ削除」/ 戻る だけになる。Local Model 管理の実装
 * （`use-local-model-management.ts` 等）はリポジトリに残し、v1.1 で実機テストして
 * 再有効化する。
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

  it('ADR-0057 / ADR-0058（Follow-up F-056000）: Settings から Qwen（オンデバイス AI）の有効化・DL 進捗・削除 UI を撤去した', async () => {
    const text = await source();

    // Apple Intelligence は OS 内蔵・対応可否は起動時 Availability Gate が自動判定
    // するため、Settings に明示的な有効化 UI は不要になった（ModelAcquisitionSection
    // 自体は再導入口としてリポジトリに残し、Settings からの呼び出しだけを切る）。
    expect(text).not.toContain('modelManagement,');
    expect(text).not.toContain('modelManagement?:');
    expect(text).not.toContain("from './ModelAcquisitionSection'");
    expect(text).not.toContain('<ModelAcquisitionSection');
    expect(text).not.toContain('readableBytes');
    expect(text).not.toContain('t.onDeviceAiEnableButtonHint');
    expect(text).not.toContain('t.onDeviceAiEnableButton');
    expect(text).not.toContain('t.onDeviceAiDescription(');
  });

  it('Issue 138（実機 blocker A、DL 完了後フリーズの是正 / v1.0 ADR-0038）: 会話 Agent・戻るは dataErasure.busy だけを disabled 条件にする（Local Model 管理 UI 自体が無いため busy 連動の過剰 disable も発生し得ない）', async () => {
    const text = await source();

    expect(text).toContain('disabled={dataErasure.busy || !hasIntroCard}');
    expect(text).toContain(
      '<DataErasureSection dataErasure={dataErasure} locale={locale} t={t} />\n      <ActionButton\n        disabled={dataErasure.busy}\n        label={t.backButton}'
    );
  });

  it('major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カード未作成時は会話エージェントの入口を disabled にする', async () => {
    const text = await source();

    expect(text).toContain('disabled={dataErasure.busy || !hasIntroCard}');
    expect(text).toContain(
      'hasIntroCard\n            ? t.conversationAgentButtonHint\n            : t.conversationAgentButtonDisabledHint'
    );
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
