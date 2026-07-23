import { describe, expect, it } from 'bun:test';
import {
  allQuizQuestions,
  isQuizQuestionId,
  QUIZ_CATALOG,
  QUIZ_QUESTION_COUNT,
  QUIZ_QUESTION_IDS,
  quizQuestionById,
} from './quiz-catalog';

describe('QUIZ_CATALOG の整合性', () => {
  it('ちょうど 16 問である', () => {
    expect(QUIZ_QUESTION_IDS.length).toBe(16);
    expect(QUIZ_QUESTION_COUNT).toBe(16);
  });

  it('id が一意である', () => {
    const unique = new Set(QUIZ_QUESTION_IDS);
    expect(unique.size).toBe(QUIZ_QUESTION_IDS.length);
  });

  it('bitIndex が 0 起点で連続し、重複がない（append-only 不変条件）', () => {
    const bitIndexes = allQuizQuestions()
      .map((question) => question.bitIndex)
      .toSorted((a, b) => a - b);

    expect(bitIndexes).toEqual(
      Array.from({ length: QUIZ_QUESTION_COUNT }, (_unused, index) => index)
    );
  });

  it('カタログ登録順（Object.keys の順）が bitIndex 昇順と一致する', () => {
    const bitIndexesInDeclarationOrder = allQuizQuestions().map(
      (question) => question.bitIndex
    );

    expect(bitIndexesInDeclarationOrder).toEqual(
      [...bitIndexesInDeclarationOrder].sort((a, b) => a - b)
    );
  });

  it('各設問が choices をちょうど 4 件持つ', () => {
    for (const question of allQuizQuestions()) {
      expect(question.choices.length).toBe(4);
    }
  });

  it('correctIndex が choices の範囲内（0..3）である', () => {
    for (const question of allQuizQuestions()) {
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThanOrEqual(3);
    }
  });

  it('全設問が ja/en の prompt・choices・explanation を空でなく持つ', () => {
    for (const question of allQuizQuestions()) {
      expect(question.prompt.ja.length).toBeGreaterThan(0);
      expect(question.prompt.en.length).toBeGreaterThan(0);
      expect(question.explanation.ja.length).toBeGreaterThan(0);
      expect(question.explanation.en.length).toBeGreaterThan(0);
      for (const choice of question.choices) {
        expect(choice.ja.length).toBeGreaterThan(0);
        expect(choice.en.length).toBeGreaterThan(0);
      }
    }
  });

  it('各設問の choices 4 件が（同一言語内で）重複しない', () => {
    for (const question of allQuizQuestions()) {
      const jaChoices = question.choices.map((choice) => choice.ja);
      const enChoices = question.choices.map((choice) => choice.en);
      expect(new Set(jaChoices).size).toBe(4);
      expect(new Set(enChoices).size).toBe(4);
    }
  });

  it('5 つの許可されたカテゴリ（iam/network/storage/compute/observability）だけを使う', () => {
    const allowedCategories = new Set([
      'iam',
      'network',
      'storage',
      'compute',
      'observability',
    ]);
    for (const question of allQuizQuestions()) {
      expect(allowedCategories.has(question.category)).toBe(true);
    }
  });

  it('各カテゴリに少なくとも 1 問は存在する', () => {
    const categories = new Set(
      allQuizQuestions().map((question) => question.category)
    );
    expect(categories.size).toBe(5);
  });
});

describe('isQuizQuestionId', () => {
  it('カタログに存在する id には true を返す', () => {
    expect(isQuizQuestionId('iam-explicit-deny')).toBe(true);
    expect(isQuizQuestionId('xray-basics')).toBe(true);
  });

  it('カタログに存在しない id には false を返す', () => {
    expect(isQuizQuestionId('not-a-real-question')).toBe(false);
    expect(isQuizQuestionId('')).toBe(false);
  });
});

describe('quizQuestionById', () => {
  it('id を含む QuizQuestion（カタログ定義 + id）を返す', () => {
    const question = quizQuestionById('lambda-basics');

    expect(question.id).toBe('lambda-basics');
    expect(question.category).toBe('compute');
    expect(question.bitIndex).toBe(QUIZ_CATALOG['lambda-basics'].bitIndex);
  });
});

describe('allQuizQuestions', () => {
  it('QUIZ_QUESTION_IDS と同じ件数・同じ順序で QuizQuestion を返す', () => {
    const questions = allQuizQuestions();

    expect(questions.map((question) => question.id)).toEqual(QUIZ_QUESTION_IDS);
  });
});
