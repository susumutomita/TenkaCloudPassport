import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function sectionSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'ConversationExampleSection.tsx');
}

function agentSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'ConversationAgentScreen.tsx');
}

describe('AI 会話例 Section の Accessibility 契約（Issue 155）', () => {
  it('hidden では Section 自体を描画しない', async () => {
    const text = await sectionSource();

    expect(
      text.match(/kind === 'hidden'\) return null/g)?.length
    ).toBeGreaterThan(1);
  });

  it('見出し・誤認防止 Disclosure・Privacy 文をすべての操作より先に置く', async () => {
    const text = await sectionSource();
    const section = text.slice(text.indexOf('export default function'));

    expectInOrder(section, [
      'accessibilityRole="header"',
      '{t.sectionTitle}',
      'accessibilityRole="summary" style={styles.disclosureBanner}',
      '{t.disclosureBanner}',
      '{t.privacyNotice}',
      '<ConversationExampleBody',
    ]);
  });

  it('生成中は progressbar・polite live region・Cancel を持つ', async () => {
    const text = await sectionSource();

    expectInOrder(text, [
      "state.kind === 'generating'",
      'accessibilityLiveRegion="polite"',
      'accessibilityRole="progressbar"',
      'accessibilityValue={{',
      'label={t.cancelButton}',
      'onPress={view.onCancel}',
    ]);
  });

  it('失敗は alert と再試行、成功は再生成を共有 ActionButton で提供する', async () => {
    const text = await sectionSource();

    // 'onPress={view.onGenerate}' は available 状態の生成ボタンにも現れ、
    // expectInOrder は各 label の最初の出現位置で比較するため、retry と
    // regenerate は label + onPress の 2 行をまとめて一意に照合する。
    expectInOrder(text, [
      "state.kind === 'failed'",
      'accessibilityRole="alert"',
      'label={t.retryButton}\n          onPress={view.onGenerate}',
      'const visibleTurns = state.example.turns.slice(',
      'label={t.regenerateButton}\n          onPress={view.onGenerate}',
    ]);
  });

  it('各吹き出しは順番・話者・本文の accessibilityLabel を持つ', async () => {
    const text = await sectionSource();

    expect(text).toContain(
      'accessibilityLabel={accessibilityLabel(index + 1, speaker, turn.text)}'
    );
    expect(text).toContain('accessible');
    expect(text).toContain("turn.speaker === 'owner'");
  });

  it('owner を右、peer を左へ配置し、Theme token だけを使う', async () => {
    const text = await sectionSource();

    expect(text).toContain(
      'owner ? styles.ownerBubbleRow : styles.peerBubbleRow'
    );
    expect(text).toContain('owner ? styles.ownerBubble : styles.peerBubble');
    expect(text).toContain("alignItems: 'flex-end'");
    expect(text).toContain("alignItems: 'flex-start'");
    expect(text).toContain('backgroundColor: colors.accent');
    expect(text).toContain('backgroundColor: colors.surface');
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('完全検証後の visibleTurnCount 件だけを順次描画する', async () => {
    const text = await sectionSource();

    expectInOrder(text, [
      'const visibleTurns = state.example.turns.slice(',
      'state.visibleTurnCount',
      'visibleTurns.map((turn, index) => (',
      '<ConversationBubble',
    ]);
  });

  it('配列 index 単独ではなく、先頭からの会話内容で安定 Key を作る', async () => {
    const text = await sectionSource();

    expect(text).toContain('function conversationTurnKey(');
    expect(text).toContain(
      'key={conversationTurnKey(state.example.turns, index)}'
    );
    expect(text).not.toContain('key={index}');
  });

  it('既存の共通点・最初の質問の後に会話例 Section を置く', async () => {
    const text = await agentSource();

    expectInOrder(text, [
      '{t.bridgeReasonTitle}',
      '{result.reason}',
      '{t.bridgeOpenerTitle}',
      '{result.opener}',
      '<ConversationExampleSection',
      'view={result.conversationExample}',
    ]);
  });
});
