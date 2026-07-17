import { type Bridge, createBridge } from './bridge';
import type { PublicPassport } from './passport';
import { findFirstSharedConfirmedClue } from './shared-clue-match';

export type ParticipantOutcome =
  | { readonly kind: 'bridge'; readonly bridge: Bridge }
  | { readonly kind: 'no-signal' };

export interface EncounterInput {
  readonly ownerPassport: PublicPassport;
  readonly encounteredPassport: PublicPassport;
}

export interface EncounterDecisionProvider {
  readonly kind: 'rules' | 'local-agent';
  decide(input: EncounterInput): ParticipantOutcome;
}

export const RULES_PROVIDER: EncounterDecisionProvider = {
  kind: 'rules',
  decide(input) {
    const clue = findFirstSharedConfirmedClue(input);
    return clue
      ? { kind: 'bridge', bridge: createBridge(clue) }
      : { kind: 'no-signal' };
  },
};
