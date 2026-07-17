import { type ClueId, clueById } from './clue-catalog';
import type { ConfirmedClue } from './passport';

export interface Bridge {
  readonly message: string;
  readonly evidence: readonly [ClueId];
}

export function createBridge(sharedClue: ConfirmedClue): Bridge {
  const clue = clueById(sharedClue.value);
  return {
    message: `お互いが公開した「${clue.label}」をきっかけに、話してみませんか。`,
    evidence: [sharedClue.value],
  };
}
