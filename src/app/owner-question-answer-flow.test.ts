import { describe, expect, it } from 'bun:test';
import {
  INITIAL_OWNER_QUESTION_ANSWER_STAGE,
  reduceOwnerQuestionAnswerStage,
} from './owner-question-answer-flow';

describe('Owner Question 回答画面の段階（最終 Consent 前の answering / confirming-share）', () => {
  it('開いた時点では answering から始まる', () => {
    expect(INITIAL_OWNER_QUESTION_ANSWER_STAGE).toBe('answering');
  });

  it('答えるを選ぶと最終確認（confirming-share）へ進む', () => {
    expect(
      reduceOwnerQuestionAnswerStage(INITIAL_OWNER_QUESTION_ANSWER_STAGE, {
        type: 'choose-share',
      })
    ).toBe('confirming-share');
  });

  it('最終確認からやめると answering へ戻れる', () => {
    const confirming = reduceOwnerQuestionAnswerStage(
      INITIAL_OWNER_QUESTION_ANSWER_STAGE,
      { type: 'choose-share' }
    );

    expect(
      reduceOwnerQuestionAnswerStage(confirming, { type: 'cancel-share' })
    ).toBe('answering');
  });
});
