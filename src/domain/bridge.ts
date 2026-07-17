import { clueById } from './clue-catalog';
import type { MatchEvidence } from './match-evidence';
import type { ConfirmedClue } from './passport';

export interface Bridge {
  readonly schemaVersion: 1;
  readonly messageKey: 'shared-clue';
  readonly message: string;
  readonly evidence: MatchEvidence;
}

export function createBridge(sharedClue: ConfirmedClue): Bridge {
  const clue = clueById(sharedClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'shared-clue',
    message: `お互いが公開した「${clue.label}」をきっかけに、話してみませんか。`,
    evidence: {
      schemaVersion: 1,
      clues: [sharedClue],
    },
  };
}

export function createBridgeFromEvidence(evidence: MatchEvidence): Bridge {
  const firstClue = evidence.clues[0];
  if (!firstClue) {
    throw new Error('Bridge には 1 件以上の Match Evidence が必要です。');
  }
  const clue = clueById(firstClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'shared-clue',
    message: `お互いが公開した「${clue.label}」をきっかけに、話してみませんか。`,
    evidence,
  };
}
