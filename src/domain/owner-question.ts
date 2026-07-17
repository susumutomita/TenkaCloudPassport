export const OWNER_QUESTION_CATALOG = {
  'confirm-shared-clue': 'この手掛かりを今回の Lounge で利用してよいですか。',
} as const;

export type OwnerQuestionId = keyof typeof OWNER_QUESTION_CATALOG;

export interface OwnerQuestion {
  readonly schemaVersion: 1;
  readonly questionId: OwnerQuestionId;
  readonly displayText: (typeof OWNER_QUESTION_CATALOG)[OwnerQuestionId];
}
