export const OWNER_QUESTION_CATALOG = {
  'confirm-shared-clue': 'この手掛かりを今回の Lounge で利用してよいですか。',
} as const;

export type OwnerQuestionId = keyof typeof OWNER_QUESTION_CATALOG;

export interface OwnerQuestion {
  readonly schemaVersion: 1;
  readonly questionId: OwnerQuestionId;
  readonly displayText: (typeof OWNER_QUESTION_CATALOG)[OwnerQuestionId];
}

/**
 * カタログ ID から表示文言込みの Owner Question を組み立てる。1 回の Lounge 参加につき
 * 最大 1 問という上限は呼び出し側（Pet Interaction の bounded protocol）が数える。
 */
export function ownerQuestion(questionId: OwnerQuestionId): OwnerQuestion {
  return {
    schemaVersion: 1,
    questionId,
    displayText: OWNER_QUESTION_CATALOG[questionId],
  };
}
