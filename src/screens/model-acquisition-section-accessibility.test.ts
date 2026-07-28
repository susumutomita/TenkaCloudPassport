import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

/**
 * Issue 180: `ModelAcquisitionSection.tsx`（Settings / 会話エージェント画面が
 * 共有する信頼済み Model 取得 UI）の Accessibility 契約。この repo はレンダリング用
 * テスト基盤を持たないため、他の Screen / Component と同じくソーステキスト検査で
 * 固定する。
 *
 * ADR-0043 が確立した「Settings から有効化・進捗・削除へ到達できる」契約の pin は、
 * このファイルへ移した（旧 `settings-accessibility.test.ts` が
 * `SettingsScreen.tsx` 直書きの `OnDeviceAiSection`/`ModelManagementSection` を
 * 検査していたものを、実態に合わせて移動）。
 */
function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ModelAcquisitionSection.tsx');
}

describe('ModelAcquisitionSection（Issue 180: Settings / 会話エージェント画面共有）の Accessibility 契約', () => {
  it('trustedModelSource が無い（Expo Go / Web）場合は何も描画しない', async () => {
    const text = await source();

    expect(text).toContain('if (!source) return null;');
  });

  it('状態分岐は resolveModelAcquisitionViewState（実行テスト付き純関数）へ委譲する', async () => {
    const text = await source();

    expect(text).toContain("from '../app/model-acquisition-view'");
    expect(text).toContain('resolveModelAcquisitionViewState({');
  });

  it('カード系スタイルは SettingsScreen.tsx（DataErasureSection）と共有する model-card-styles.ts から import し、独自定義しない（jscpd 対策）', async () => {
    const text = await source();

    expect(text).toContain("from './model-card-styles'");
    expect(text).not.toContain('modelCard:');
    expect(text).not.toContain('modelTitle:');
  });

  it('カードの外枠は既存の Card プリミティブを再利用し、角丸・枠線幅・padding を再定義しない（/simplify 指摘: reuse）', async () => {
    const text = await source();

    expect(text).toContain("import Card from '../components/Card'");
    expect(text).toContain('<Card style={modelCardOverride}>');
    expect(text).not.toContain('borderRadius:');
    expect(text).not.toContain('borderWidth:');
  });

  it('busy / error は取得 UI 本体より前に表示する', async () => {
    const text = await source();

    expectInOrder(text, [
      'modelManagement.busy ? (',
      't.modelBusy',
      'modelManagement.errorCode ? (',
      't.modelError(modelManagement.errorCode)',
      '<Card style={modelCardOverride}>',
    ]);
  });

  it('downloading 状態は進捗表示と中止ボタンを持つ', async () => {
    const text = await source();

    expect(text).toContain('function DownloadingCard(');
    expect(text).toContain(
      'onPress={modelManagement.cancelOnDeviceAiDownload}'
    );
    expectInOrder(text, [
      "view.kind === 'downloading' ? (",
      '<DownloadingCard',
    ]);
  });

  it('consent-pending 状態は同意・キャンセルの両ボタンを持つ', async () => {
    const text = await source();

    expectInOrder(text, [
      "view.kind === 'consent-pending' ? (",
      'onPress={modelManagement.confirmEnableOnDeviceAiConsent}',
      'onPress={modelManagement.cancelEnableOnDeviceAiConsent}',
    ]);
  });

  it('not-acquired 状態は呼び出し側の文言・disabled ガードを使う', async () => {
    const text = await source();

    expectInOrder(text, [
      "view.kind === 'not-acquired' ? (",
      '{notAcquiredCopy.description(source)}',
      'accessibilityHint={notAcquiredCopy.buttonHint}',
      'modelManagement.busy ||',
      'modelManagement.candidateSelectionBlocked',
      'label={notAcquiredCopy.buttonLabel}',
      'onPress={modelManagement.requestEnableOnDeviceAi}',
    ]);
  });

  it('未取得の文言は 1 セットの notAcquiredCopy object として受け取る（/simplify 指摘: 常に揃って渡される 3 値を独立 props にしない）', async () => {
    const text = await source();

    expect(text).toContain('export interface ModelAcquisitionNotAcquiredCopy');
    expect(text).toContain(
      'readonly notAcquiredCopy: ModelAcquisitionNotAcquiredCopy'
    );
  });

  it('acquired 状態は active / imported-not-active を出し分け、削除ボタンを持つ', async () => {
    const text = await source();

    expectInOrder(text, [
      "view.kind === 'acquired' ? (",
      'view.active',
      't.onDeviceAiActiveStatus',
      't.onDeviceAiImportedNotActiveStatus',
      'onPress={modelManagement.removeOnDeviceAiModel}',
    ]);
  });

  it('cautionAssessment カードは確認ボタンを持つ（会話エージェント画面発の DL が Resource Risk で止まっても無反応にしない）', async () => {
    const text = await source();

    expectInOrder(text, [
      'modelManagement.cautionAssessment ? (',
      'onPress={modelManagement.confirmCautionActivation}',
    ]);
  });

  it('pendingProviderOperation カードは確認・キャンセルの両ボタンを持つ（他 Provider 実行中の競合操作でも無反応にしない）', async () => {
    const text = await source();

    expectInOrder(text, [
      'modelManagement.pendingProviderOperation ? (',
      'onPress={modelManagement.confirmProviderOperation}',
      'onPress={modelManagement.cancelProviderOperation}',
    ]);
  });
});
