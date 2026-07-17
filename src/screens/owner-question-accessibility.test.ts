import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'OwnerQuestionScreen.tsx');
}

/**
 * Issue 11 の受け入れ条件を Screen のソーステキストで固定する。この repo はレンダリング用の
 * 統合テスト基盤（React Testing Library 相当）を持たないため（新規依存を増やさない方針）、
 * 他の Screen の Accessibility 契約と同じくソーステキスト検査で担保する
 * （`docs/design/owner-question-consent-flow.md` を正本とする）。
 */
describe('Owner Question 画面の段階的開示・Consent 契約', () => {
  it('質問より先に共有範囲・削除時期・Passport 非保存の開示を表示する', async () => {
    const text = await source();

    expect(text).toContain("from '../app/owner-question-disclosure'");
    expectInOrder(text, [
      'ownerQuestionDisclosure()',
      'sharedWithMessage',
      'deletedWhenMessage',
      'notSavedToPassportMessage',
      'question.displayText',
    ]);
  });

  it('答える・分からない・パスの 3 択を常に用意する', async () => {
    const text = await source();

    for (const label of ['答える', '分からない', 'パス']) {
      expect(text).toContain(`label="${label}"`);
    }
  });

  it('分からない・パスは Owner Question への回答を直接確定し Agent を止めない', async () => {
    const text = await source();

    expect(text).toContain("onPress={() => answerOnce('no')}");
    expect(text).toContain("onPress={() => answerOnce('decline')}");
  });

  it('答えるは直接 yes を送らず、最終確認（confirming-share）を経てから onAnswer(yes) を呼ぶ', async () => {
    const text = await source();

    expectInOrder(text, [
      "dispatchStage({ type: 'choose-share' })",
      "onPress={() => answerOnce('yes')}",
    ]);
    expect(text).toContain("dispatchStage({ type: 'cancel-share' })");
    expect(text).toContain('function answerOnce');
    expect(text).toContain('onAnswer(value)');
  });

  it('答える・分からない・パス・確定して共有するは二重送信防止のため submitted 後に disabled になる', async () => {
    const text = await source();

    expect(text).toContain(
      'const [submitted, setSubmitted] = useState(false);'
    );
    const submittedDisabledCount = (text.match(/disabled=\{submitted\}/g) ?? [])
      .length;
    expect(submittedDisabledCount).toBe(5);
  });

  it('自由記述のメモは 140 文字以内で、選択肢だけでも回答が完結する', async () => {
    const text = await source();

    expect(text).toContain('OWNER_ANSWER_NOTE_MAX_LENGTH');
    expect(text).toContain('maxLength={OWNER_ANSWER_NOTE_MAX_LENGTH}');
    expect(text).toContain('validateOwnerAnswerNote');
  });

  it('メモの入力中は前後の空白を保持し、単語間の空白を消さない（trim は表示・検証専用）', async () => {
    const text = await source();

    // changeNote は validateOwnerAnswerNote の戻り値（trim 済み）を note へ
    // 書き戻さず、生の入力値をそのまま setNote する。これにより単語の間に
    // 打った空白が、次の文字入力で消えてしまう回帰を防ぐ。
    expect(text).not.toContain('setNote(validateOwnerAnswerNote(value))');
    expect(text).toContain('setNote(value)');
    expect(text).toContain('validateOwnerAnswerNote(value)');
    // 表示・最終確認用の値は、検証済みの note から改めて trim した別変数を使う。
    expect(text).toContain('const trimmedNote = validateOwnerAnswerNote(note)');
  });

  it('退出して破棄・Host として終了の Terminal Event を常に提供し、それぞれ内容を持つ accessibilityHint を持つ', async () => {
    const text = await source();

    expect(text).toContain('label="退出して破棄"');
    expect(text).toContain('label="Host として終了"');
    expectInOrder(text, [
      'accessibilityHint="この Lounge から退出し、この端末のデータを破棄します。"',
      'label="退出して破棄"',
    ]);
    expectInOrder(text, [
      'accessibilityHint="Host としてこの Lounge を終了し、全参加者のデータを破棄します。"',
      'label="Host として終了"',
    ]);
  });

  it('全操作に accessibilityLabel / accessibilityRole を持つ', async () => {
    const text = await source();

    expect(text).toContain('accessibilityLabel=');
    expect(text).toContain('accessibilityRole="alert"');
  });

  it('内部推論・Prompt・Evidence の中身を直接埋め込まない', async () => {
    const text = await source();

    for (const forbidden of [
      'Chain of Thought',
      'Prompt',
      'candidateClue.value',
      'MatchEvidence',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
