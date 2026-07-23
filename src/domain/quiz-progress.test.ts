import { describe, expect, it } from 'bun:test';
import { quizQuestionById } from './quiz-catalog';
import {
  EMPTY_QUIZ_PROGRESS,
  isQuizComplete,
  isQuizQuestionCleared,
  quizClearedCount,
  scoreQuizAnswer,
  withQuizQuestionCleared,
} from './quiz-progress';

describe('scoreQuizAnswer', () => {
  it('正解の選択肢を選ぶと correct: true を返す', () => {
    const question = quizQuestionById('iam-explicit-deny');

    const outcome = scoreQuizAnswer(question, question.correctIndex);

    expect(outcome).toEqual({
      questionId: 'iam-explicit-deny',
      selectedIndex: question.correctIndex,
      correct: true,
    });
  });

  it('不正解の選択肢を選ぶと correct: false を返す', () => {
    const question = quizQuestionById('iam-explicit-deny');
    const wrongIndex = ((question.correctIndex + 1) % 4) as 0 | 1 | 2 | 3;

    const outcome = scoreQuizAnswer(question, wrongIndex);

    expect(outcome.correct).toBe(false);
    expect(outcome.selectedIndex).toBe(wrongIndex);
  });
});

describe('withQuizQuestionCleared / isQuizQuestionCleared', () => {
  it('未クリアの id を追加すると、その id がクリア済みと判定される新しい集合を返す', () => {
    const next = withQuizQuestionCleared(EMPTY_QUIZ_PROGRESS, 'lambda-basics');

    expect(isQuizQuestionCleared(next, 'lambda-basics')).toBe(true);
    expect(isQuizQuestionCleared(EMPTY_QUIZ_PROGRESS, 'lambda-basics')).toBe(
      false
    );
  });

  it('既にクリア済みの id を追加しても同じ参照を返す（無駄な再 render を避ける）', () => {
    const once = withQuizQuestionCleared(EMPTY_QUIZ_PROGRESS, 'lambda-basics');

    const twice = withQuizQuestionCleared(once, 'lambda-basics');

    expect(twice).toBe(once);
  });

  it('元の集合を変更しない（不変更新）', () => {
    const before = new Set(EMPTY_QUIZ_PROGRESS);

    withQuizQuestionCleared(EMPTY_QUIZ_PROGRESS, 'lambda-basics');

    expect(EMPTY_QUIZ_PROGRESS).toEqual(before);
  });
});

describe('quizClearedCount / isQuizComplete', () => {
  it('空の進捗は 0 件・未完了である', () => {
    expect(quizClearedCount(EMPTY_QUIZ_PROGRESS)).toBe(0);
    expect(isQuizComplete(EMPTY_QUIZ_PROGRESS)).toBe(false);
  });

  it('1 件クリアすると件数が 1 増え、まだ未完了である', () => {
    const progress = withQuizQuestionCleared(
      EMPTY_QUIZ_PROGRESS,
      'lambda-basics'
    );

    expect(quizClearedCount(progress)).toBe(1);
    expect(isQuizComplete(progress)).toBe(false);
  });

  it('全 16 問をクリアすると isQuizComplete が true になる', () => {
    const allIds = [
      'iam-explicit-deny',
      'vpc-public-subnet',
      's3-consistency',
      'lambda-basics',
      'cloudwatch-role',
      'iam-role-purpose',
      'security-group-stateful',
      'ebs-basics',
      'auto-scaling-purpose',
      'cloudtrail-role',
      'root-user-best-practice',
      'vpc-basics',
      's3-glacier-retrieval',
      'fargate-basics',
      'cloudwatch-alarm',
      'xray-basics',
    ] as const;
    const progress = allIds.reduce(
      (acc, id) => withQuizQuestionCleared(acc, id),
      EMPTY_QUIZ_PROGRESS
    );

    expect(quizClearedCount(progress)).toBe(16);
    expect(isQuizComplete(progress)).toBe(true);
  });
});
