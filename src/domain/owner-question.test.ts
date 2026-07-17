import { describe, expect, it } from 'bun:test';
import { OWNER_QUESTION_CATALOG, ownerQuestion } from './owner-question';

describe('Owner Question の組み立て', () => {
  it('カタログ ID から表示文言込みの Owner Question を組み立てる', () => {
    const question = ownerQuestion('confirm-shared-clue');

    expect(question).toEqual({
      schemaVersion: 1,
      questionId: 'confirm-shared-clue',
      displayText: OWNER_QUESTION_CATALOG['confirm-shared-clue'],
    });
  });
});
