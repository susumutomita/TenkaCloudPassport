import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function sectionSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'ConversationExampleSection.tsx');
}

function agentSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'ConversationAgentScreen.tsx');
}

describe('AI 会話例 Section の Accessibility 契約（Issue 155 / 169）', () => {
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

  it('生成中は progressbar・polite live region・Cancel を持ち、確定ターンと typing indicator を表示する', async () => {
    const text = await sectionSource();

    expectInOrder(text, [
      "state.kind === 'generating'",
      'accessibilityLiveRegion="polite"',
      'accessibilityRole="progressbar"',
      'accessibilityValue={{',
      '<ConversationTurnList',
      'turns={state.turns}',
      '<TypingIndicatorBubble',
      'speaker={state.nextSpeaker}',
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
      "state.kind === 'ended-early'",
      'turns={state.example.turns}',
      'label={t.regenerateButton}\n        onPress={view.onGenerate}',
    ]);
  });

  it('ended-early は確定ターンと終了 notice を、生成完了後の regenerate と区別して提供する', async () => {
    const text = await sectionSource();
    const start = text.indexOf("state.kind === 'ended-early'");
    // 'turns={state.example.turns}' は生成完了後（shown）の Block だけが使う一意な
    // 目印のため、ended-early の Block 終端として使う。
    const end = text.indexOf('turns={state.example.turns}', start);
    const endedEarlySection = text.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expectInOrder(endedEarlySection, [
      "state.kind === 'ended-early'",
      'turns={state.turns}',
      '{t.endedEarlyNotice}',
      'label={t.regenerateButton}\n          onPress={view.onGenerate}',
    ]);
    expect(endedEarlySection).not.toContain('accessibilityRole="alert"');
  });

  it('各吹き出しは順番・話者・本文の accessibilityLabel を持つ', async () => {
    const text = await sectionSource();

    expect(text).toContain(
      'accessibilityLabel={accessibilityLabel(index + 1, speaker, turn.text)}'
    );
    expect(text).toContain('accessible');
    expect(text).toContain("turn.speaker === 'owner'");
  });

  it('typing indicator は誰が入力中かを Accessibility Label で明示し、Theme token だけを使う', async () => {
    const text = await sectionSource();

    expect(text).toContain('function TypingIndicatorBubble(');
    expect(text).toContain(
      'accessibilityLabel={accessibilityLabel(speakerName)}'
    );
    expect(text).toContain('styles.typingBubble');
    expect(text).toContain('opacity: 0.6');
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('最終ターン確定後（nextSpeaker が null）は typing indicator を描画しない', async () => {
    // レビュー指摘（ghost typing indicator）の回帰テスト。次の話者がいない間、
    // Session Close（Native Context 解放）待ちの見た目上の「入力中」表示を出さない。
    const text = await sectionSource();

    expect(text).toContain('{state.nextSpeaker !== null && (');
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

  it('確定済みターンは reveal Timer を経ずに即時描画する（Issue 169）', async () => {
    const text = await sectionSource();

    // ターン毎生成では completion の待ち時間自体が進行感を作るため、旧来の
    // 300ms 順次表示（`visibleTurnCount`）は不要になった。
    expect(text).not.toContain('visibleTurnCount');
    expect(text).not.toContain('CONVERSATION_EXAMPLE_REVEAL_INTERVAL_MS');
    expect(text).toContain('function ConversationTurnList(');
  });

  it('配列 index 単独ではなく、先頭からの会話内容で安定 Key を作る', async () => {
    const text = await sectionSource();

    expect(text).toContain('function conversationTurnKey(');
    expect(text).toContain('key={conversationTurnKey(turns, index)}');
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
