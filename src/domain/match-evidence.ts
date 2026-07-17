import type { ConfirmedClue } from './passport';

export type OwnerAnswerValue = 'yes' | 'no' | 'decline';

export interface SharedOwnerAnswer {
  readonly questionId: 'confirm-shared-clue';
  readonly answer: Exclude<OwnerAnswerValue, 'decline'>;
  readonly sharingConsent: true;
}

export interface MatchEvidence {
  readonly schemaVersion: 1;
  readonly clues: readonly ConfirmedClue[];
  readonly ownerAnswer?: SharedOwnerAnswer;
}
