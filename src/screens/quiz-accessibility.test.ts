import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

describe('クラウド基礎クイズ（Issue 110）の Accessibility 契約', () => {
  it('一覧・出題どちらも AppScreen へ言語切替（locale / onChangeLocale）を渡す', async () => {
    const text = await source('QuizScreen.tsx');

    expect(
      text.match(/onChangeLocale={onChangeLocale}/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
  });

  it('一覧の各行は accessibilityRole="button" と、設問文・クリア状況を含む accessibilityLabel を持つ', async () => {
    const text = await source('QuizScreen.tsx');
    const start = text.indexOf('function QuestionList({');
    const end = text.indexOf('\n}\n', start);
    const body = text.slice(start, end);

    expect(body).toContain('accessibilityRole="button"');
    expect(body).toContain(
      't.questionAccessibilityLabel(\n                question.prompt[locale],\n                cleared\n              )'
    );
  });

  it('一覧はクリア状況を色だけでなく枠（listItemCleared）とテキスト（clearedStatusLabel / notClearedStatusLabel）の両方で示す', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text).toContain('styles.listItemCleared');
    expect(text).toContain(
      'cleared ? t.clearedStatusLabel : t.notClearedStatusLabel'
    );
  });

  it('一覧は "N / 16 クリア" の件数表示を持つ（QUIZ_QUESTION_COUNT を直書きせず、quizClearedCount で件数を求める）', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text).toContain("from '../domain/quiz-catalog'");
    expect(text).toContain('QUIZ_QUESTION_COUNT');
    expect(text).toContain(
      't.clearedCount(quizClearedCount(clearedIds), QUIZ_QUESTION_COUNT)'
    );
  });

  it('全問クリア（isQuizComplete）のときだけ allClearedNotice を表示する', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text).toContain("from '../domain/quiz-progress'");
    expect(text).toContain('isQuizComplete(clearedIds)');
    expect(text).toContain('{t.allClearedNotice}');
  });

  it('出題画面の 4 択は accessibilityRole="button" と accessibilityState（disabled・selected）を持ち、色だけでなく枠（choiceSelected）でも選択状態を示す', async () => {
    const text = await source('QuizScreen.tsx');
    const start = text.indexOf('function QuestionDetail({');
    const end = text.indexOf('\n}\n', start);
    const body = text.slice(start, end);

    expect(body).toContain('accessibilityRole="button"');
    expect(body).toContain(
      'accessibilityState={{ disabled: answered, selected }}'
    );
    expect(body).toContain('styles.choiceSelected');
  });

  it('回答後は accessibilityRole="summary" で正誤と解説をまとめて表示する', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text).toContain('accessibilityRole="summary"');
    expectInOrder(text, [
      'accessibilityRole="summary"',
      't.correctTitle',
      't.explanationLabel',
      'question.explanation[locale]',
    ]);
  });

  it('回答結果 View は accessibilityLiveRegion="polite" を持ち、画面遷移を伴わない結果表示をスクリーンリーダーへ明示的にアナウンスする（Issue 130 minor）', async () => {
    const text = await source('QuizScreen.tsx');
    const start = text.indexOf('{outcome ? (');
    const end = text.indexOf(') : (', start);
    const body = text.slice(start, end);

    expect(body).toContain('accessibilityLiveRegion="polite"');
    expect(body).toContain('accessibilityRole="summary"');
  });

  it('回答するボタンは選択肢未選択のあいだ disabled になる', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text).toContain('disabled={selectedChoiceIndex === null}');
    expect(text).toContain('label={t.submitButton}');
  });

  it('handleSubmit は正解のときだけ onAnswerCorrect を呼ぶ（不正解・解答履歴は永続化しない）', async () => {
    const text = await source('QuizScreen.tsx');
    const start = text.indexOf('function handleSubmit(): void {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      'if (selectedChoiceIndex === null) return;',
      'const outcome = scoreQuizAnswer(question, selectedChoiceIndex);',
      'setAnswered(true);',
      'if (outcome.correct) onAnswerCorrect(question.id);',
    ]);
  });

  it('一覧・出題は共通の一覧表示スタイル（styles.list）を再利用する（重複実装しない）', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text.match(/style={styles\.list}/g)?.length ?? 0).toBe(2);
  });

  it('進捗の永続化は onAnswerCorrect 経由でのみ行い、画面内で Storage へ直接アクセスしない', async () => {
    const text = await source('QuizScreen.tsx');

    expect(text).not.toContain('Storage');
    expect(text).not.toContain('localStorage');
  });
});
