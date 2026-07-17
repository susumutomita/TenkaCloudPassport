import { type Bridge, createBridge, createComplementBridge } from './bridge';
import { firstOfferNeedComplementMatch } from './bridge-selection';
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

/**
 * Issue 12: Topic 共通の確認済み手掛かりを最優先（既存の Issue 4 以来の判定と後方互換を
 * 保つ）にしつつ、それが無い場合だけ Offer/Need 相互補完（`bridge-selection.ts`）へ
 * 一般化する。共通 Language だけの Evidence は、2 者間 Live 経路の `MatchEvidence` が
 * `ConfirmedClue` の配列である都合上ここでは Bridge の根拠にしない
 * （`docs/design/bridge-selection.md` の「2 者間 Live 経路と Wire 型の境界」参照）。
 */
export const RULES_PROVIDER: EncounterDecisionProvider = {
  kind: 'rules',
  decide(input) {
    const topicClue = findFirstSharedConfirmedClue(input);
    if (topicClue) {
      return { kind: 'bridge', bridge: createBridge(topicClue) };
    }
    const complement = firstOfferNeedComplementMatch(
      input.ownerPassport,
      input.encounteredPassport
    );
    if (complement) {
      return {
        kind: 'bridge',
        bridge: createComplementBridge(
          complement.offerClue,
          complement.seekClue
        ),
      };
    }
    return { kind: 'no-signal' };
  },
};
