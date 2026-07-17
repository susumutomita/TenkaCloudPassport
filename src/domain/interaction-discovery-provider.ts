import { type OwnerQuestion, ownerQuestion } from './owner-question';
import type { ConfirmedClue, PublicPassport } from './passport';
import { findFirstSharedConfirmedClue } from './shared-clue-match';

/**
 * Pet Interaction の `discovering` フェーズが Provider へ渡す入力。今回の Public Passport
 * 以外は参照しない（Chain of Thought、Raw Prompt、自由形式チャットは対象外）。
 */
export interface InteractionDiscoveryInput {
  readonly ownerPassport: PublicPassport;
  readonly encounteredPassport: PublicPassport;
}

/**
 * `discovering` の結果は 2 種類だけである。共通する確認済み手掛かりが 1 件もなければ
 * `no-signal`（情報不足）で即座に確定する。1 件でも見つかれば、それは Owner が今回の
 * Lounge での利用をまだ明示していない「候補」に過ぎず、`candidate` として返し、
 * `clarifying` で Owner Question を経てからでないと Bridge Evidence へ昇格できない。
 */
export type InteractionDiscoveryResult =
  | { readonly kind: 'no-signal' }
  | {
      readonly kind: 'candidate';
      readonly candidateClue: ConfirmedClue;
      readonly question: OwnerQuestion;
    };

export interface InteractionDiscoveryProvider {
  readonly kind: 'rules' | 'local-agent';
  discover(
    input: InteractionDiscoveryInput
  ): InteractionDiscoveryResult | Promise<InteractionDiscoveryResult>;
}

/**
 * Rules Provider は同期的に確定する（Local Agent 版と違い、Provider Timeout も Cancel も
 * 起こらない）。呼び出し側が毎回 await する必要をなくすため、Port より狭い同期の型で
 * 公開する。`InteractionDiscoveryProvider` が要求する形は構造的に満たしたままなので、
 * Port を受け取る箇所へそのまま渡せる。
 */
export interface RulesInteractionDiscoveryProvider {
  readonly kind: 'rules';
  discover(input: InteractionDiscoveryInput): InteractionDiscoveryResult;
}

/**
 * Rules Provider と同じ「カタログ順で最初に一致する確認済み手掛かり」だけを根拠にする
 * 決定的な Discovery Provider。端末外へ通信せず、同じ入力には常に同じ結果を返す。
 */
export const RULES_INTERACTION_PROVIDER: RulesInteractionDiscoveryProvider = {
  kind: 'rules',
  discover(input) {
    const candidateClue = findFirstSharedConfirmedClue(input);
    if (!candidateClue) return { kind: 'no-signal' };
    return {
      kind: 'candidate',
      candidateClue,
      question: ownerQuestion('confirm-shared-clue', candidateClue),
    };
  },
};
