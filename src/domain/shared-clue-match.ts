import { CLUE_IDS } from './clue-catalog';
import type { ConfirmedClue, PublicPassport } from './passport';

export interface SharedClueMatchInput {
  readonly ownerPassport: PublicPassport;
  readonly encounteredPassport: PublicPassport;
}

/**
 * カタログ順で最初に一致する確認済み手掛かりを 1 件だけ返す。「各参加者へ提示できる
 * 主要 Bridge は最大 1 つ」というプロダクト契約を、Rules Provider（`rules-provider.ts`）と
 * Interaction Discovery Provider（`interaction-discovery-provider.ts`）の両方が同じ 1 つの
 * 判定ロジックから導くための唯一の実装とする。呼び出し側ごとに同じ走査を重複させない。
 */
export function findFirstSharedConfirmedClue(
  input: SharedClueMatchInput
): ConfirmedClue | undefined {
  for (const clueId of CLUE_IDS) {
    const ownerClue = input.ownerPassport.clues.find(
      (clue) => clue.value === clueId
    );
    const encounteredHasClue = input.encounteredPassport.clues.some(
      (clue) => clue.value === clueId
    );
    if (ownerClue && encounteredHasClue) return ownerClue;
  }
  return undefined;
}
