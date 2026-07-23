import { describe, expect, it } from 'bun:test';
import {
  allQuizQuestions,
  isQuizQuestionId,
  QUIZ_CATALOG,
  QUIZ_QUESTION_COUNT,
  QUIZ_QUESTION_IDS,
  type QuizQuestionId,
  quizQuestionById,
} from './quiz-catalog';

/**
 * Issue 130（Codex 指摘 major）: 既存の「0 起点で連続・重複なし」「宣言順 = bitIndex 昇順」
 * の 2 テストだけでは、bit 0 に新問を挿入して既存 16 問すべての bitIndex を 1 つずつ
 * ずらしても検出できない（連続性・宣言順の両方の性質を保ったまま全体がシフトするため）。
 * `quiz-progress-code.ts` のビットマスクは QR に相乗りする既存データのため、
 * 既存 id の bitIndex が変わると過去に共有済みの QR の意味がずれる
 * （`quiz-catalog.ts` 冒頭のコメント、ADR-0035 の「機械保証」）。
 *
 * `satisfies Record<QuizQuestionId, number>` により、将来 17 問目を追加すると
 * `QuizQuestionId` union にキーが増え、この対応表にそのキーを追加しない限り
 * 型エラーになる（新問を足す開発者に、この表へ明示的に 1 行追加させることを強制する）。
 * 既存 id の値を書き換えることは型では防げないため、以下の `it` で「宣言時点の値と
 * 一致する」ことを実行時にも固定する。新問の追加は「新規 index の追加」であり、
 * 既存の対応関係を 1 つも変更しない限りこの対応表もこのテストも変更不要である。
 */
const FIXED_BIT_INDEX_BY_QUESTION_ID = {
  'iam-explicit-deny': 0,
  'vpc-public-subnet': 1,
  's3-consistency': 2,
  'lambda-basics': 3,
  'cloudwatch-role': 4,
  'iam-role-purpose': 5,
  'security-group-stateful': 6,
  'ebs-basics': 7,
  'auto-scaling-purpose': 8,
  'cloudtrail-role': 9,
  'root-user-best-practice': 10,
  'vpc-basics': 11,
  's3-glacier-retrieval': 12,
  'fargate-basics': 13,
  'cloudwatch-alarm': 14,
  'xray-basics': 15,
} as const satisfies Record<QuizQuestionId, number>;

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

  it('16 問すべての id → bitIndex が固定の不変対応表と一致する（append-only、既存 id の再割当てを拒否する）', () => {
    for (const [id, expectedBitIndex] of Object.entries(
      FIXED_BIT_INDEX_BY_QUESTION_ID
    )) {
      const question = quizQuestionById(id as QuizQuestionId);
      expect(question.bitIndex).toBe(expectedBitIndex);
    }
  });

  it('固定対応表に含まれる id は現在のカタログの id 一覧と過不足なく一致する（表からの抜け漏れを検出する）', () => {
    const idsInTable = Object.keys(FIXED_BIT_INDEX_BY_QUESTION_ID).toSorted();
    const idsInCatalog = [...QUIZ_QUESTION_IDS].toSorted();

    expect(idsInTable).toEqual(idsInCatalog);
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

  it('S3 の強整合性設問は「all operations」に相当する過度な一般化をせず、PUT/DELETE と後続 GET/LIST・ACL/タグ/メタデータ操作という文書化された範囲に限定する（Issue 130 major: overclaim の是正）', () => {
    const question = quizQuestionById('s3-consistency');
    const correctChoice = question.choices[question.correctIndex];

    expect(correctChoice.en.toLowerCase()).not.toContain('all operations');
    expect(correctChoice.ja).not.toContain('すべての操作');
    expect(correctChoice.en).toContain('PUT/DELETE');
    expect(correctChoice.en.toLowerCase()).toContain('get/list');
    expect(question.explanation.en.toLowerCase()).not.toContain(
      'all operations'
    );
  });

  it('Glacier 取得時間の設問は S3 Intelligent-Tiering を distractor に含めず一意な正解を持つ（Issue 130 major: Archive Access 階層が同じ取得時間になり得るため除外）', () => {
    const question = quizQuestionById('s3-glacier-retrieval');
    const choiceTexts = question.choices.map((choice) => choice.en);

    expect(choiceTexts).not.toContain('S3 Intelligent-Tiering');
    expect(choiceTexts[question.correctIndex]).toBe(
      'S3 Glacier Flexible Retrieval'
    );
    expect(question.explanation.en).toContain('Expedited');
    expect(question.explanation.en).toContain('Bulk');
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
