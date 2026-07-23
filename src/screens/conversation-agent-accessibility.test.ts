import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェント画面（`ConversationAgentScreen.tsx`）の
 * Accessibility 契約。この repo はレンダリング用テスト基盤を持たないため
 * （`accessibility-test-kit.ts` 冒頭コメント参照）、他の Screen と同じくソーステキスト
 * 検査で固定する。
 */
function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ConversationAgentScreen.tsx');
}

describe('端末内会話エージェント画面の Accessibility 契約', () => {
  it('AppScreen へ言語切替（locale / onChangeLocale）を渡す（Issue 118 と同じ流儀）', async () => {
    const text = await source();

    expect(text).toContain('locale={locale}');
    expect(text).toContain('onChangeLocale={onChangeLocale}');
  });

  it('自己紹介カード未作成時は alert role の Notice を表示する', async () => {
    const text = await source();

    expect(text).toContain('hasSelfIntroCard ? null : (');
    expect(text).toContain('accessibilityRole="alert"');
  });

  it('QR 再スキャン・貼り付け・サンプルの 3 つの取り込み経路をすべて持つ（設計文書の審査官向け実演戦略を含む）', async () => {
    const text = await source();

    expect(text).toContain('onPress={onScanPeer}');
    expect(text).toContain('onChangeText={onChangePasteInput}');
    expect(text).toContain('onPress={onSubmitPasteInput}');
    expect(text).toContain('onPress={onUseSampleCard}');
  });

  it('貼り付け入力欄は accessibilityLabel を持つ', async () => {
    const text = await source();

    expect(text).toContain('accessibilityLabel={t.pasteLabel}');
  });

  it('相手カードの削除ボタンは index 相当ではなく相手の名前を含む accessibilityLabel を持つ', async () => {
    const text = await source();

    expect(text).toContain(
      'accessibilityLabel={t.removePeerButtonLabel(peer.name)}'
    );
  });

  it('running 状態は accessibilityRole="summary" の Notice を表示する', async () => {
    const text = await source();

    expectInOrder(text, [
      "if (result.kind === 'running')",
      'accessibilityRole="summary" style={styles.notice}',
    ]);
  });

  it('error 状態は accessibilityRole="alert" の Notice を表示する（他の状態と区別する）', async () => {
    const text = await source();

    expectInOrder(text, [
      "if (result.kind === 'error')",
      'accessibilityRole="alert" style={styles.noticeError}',
    ]);
  });

  it('no-signal 状態は accessibilityRole="summary" の Notice を表示する', async () => {
    const text = await source();

    expectInOrder(text, ["if (result.kind === 'no-signal')", 'noSignalTitle']);
  });

  it('会話理由・最初の質問の結果パネルは accessibilityLiveRegion="polite" を持つ（動的に現れる内容を読み上げる）', async () => {
    const text = await source();

    expect(text).toContain('accessibilityLiveRegion="polite"');
  });

  it('控えめな Settings リンクを持ち、共有 Touch Target 定数を使う（他の画面と同じ流儀、Issue 130）', async () => {
    const text = await source();

    expect(text).toContain('onPress={onOpenSettings}');
    expect(text).toContain("from '../ui/touch-target'");
  });

  it('開始ボタンは running 中に disabled になる（二重起動防止）', async () => {
    const text = await source();

    expect(text).toContain("disabled={result.kind === 'running'}");
  });

  it('貼り付け送信ボタンは入力が空のとき disabled になる', async () => {
    const text = await source();

    expect(text).toContain('disabled={pasteInput.trim().length === 0}');
  });

  it('major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カード未作成時は scan/paste/sample の取り込み導線を隠し、戻る CTA だけを表示する', async () => {
    const text = await source();

    expectInOrder(text, [
      'hasSelfIntroCard ? (',
      'peer ? (',
      '<IntakeSection',
      'accessibilityHint={t.selfCardMissingCtaButtonHint}',
      'label={t.selfCardMissingCtaButton}',
      'onPress={onBack}',
    ]);
  });

  it('code-reviewer 指摘（minor、Issue 104 PR #132）: 汎用の戻るボタンは hasSelfIntroCard のときだけ表示し、CTA と同じ操作が重複表示されない', async () => {
    const text = await source();
    const ctaIndex = text.indexOf('label={t.selfCardMissingCtaButton}');
    const genericBackButtonGuardIndex = text.indexOf(
      'hasSelfIntroCard ? (\n        // code-reviewer 指摘（minor、Issue 104 PR #132）'
    );

    expect(ctaIndex).toBeGreaterThan(-1);
    expect(genericBackButtonGuardIndex).toBeGreaterThan(ctaIndex);
    expect(text).toContain('label={t.backButton}');
  });
});
