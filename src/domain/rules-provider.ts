import { type Bridge, createBridge } from './bridge';
import { CLUE_IDS } from './clue-catalog';
import type { PublicPassport } from './passport';

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
    for (const clueId of CLUE_IDS) {
      const ownerClue = input.ownerPassport.clues.find(
        (clue) => clue.value === clueId
      );
      const encounteredHasClue = input.encounteredPassport.clues.some(
        (clue) => clue.value === clueId
      );
      if (ownerClue && encounteredHasClue) {
        return { kind: 'bridge', bridge: createBridge(ownerClue) };
      }
    }
    return { kind: 'no-signal' };
  },
};
