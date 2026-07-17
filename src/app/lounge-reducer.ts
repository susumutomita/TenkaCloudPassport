import {
  advanceLounge,
  type ClockSnapshot,
  completeLounge,
  endHostedLounge,
  type LoungeState,
  leaveLounge,
} from '../domain/lounge';

/**
 * Issue 11 は「会話の糸を探す」操作を `pet-interaction-flow.ts`（bounded protocol 経由）
 * へ置き換えたため、この reducer は同期の Rules Provider 判定（`evaluateLounge` /
 * `RULES_PROVIDER`）を直接呼ぶ Action を持たない。`evaluateLounge` / `RULES_PROVIDER`
 * 自体は `src/domain/lounge.ts` / `src/domain/rules-provider.ts` の公開 API として、
 * 100% カバレッジ済みのまま残る（他の Domain / Privacy Regression テストが引き続き使う）。
 */
export type LoungeAction =
  | { readonly type: 'clock-tick'; readonly clock: ClockSnapshot }
  | { readonly type: 'app-resumed'; readonly clock: ClockSnapshot }
  | { readonly type: 'owner-exit' }
  | { readonly type: 'host-ended' }
  | { readonly type: 'complete' };

export function reduceLounge(
  state: LoungeState,
  action: LoungeAction
): LoungeState {
  switch (action.type) {
    case 'clock-tick':
    // app-resumed は Background から Foreground へ復帰した瞬間に発火する専用イベントだ。
    // 停止していた時間を「期限延長」に扱わないよう、clock-tick と同じ純粋な壁時計 /
    // 単調増加時計の再評価（advanceLounge）だけを行い、独自の延長ロジックを持たない。
    case 'app-resumed':
      return advanceLounge(state, action.clock);
    case 'owner-exit':
      return leaveLounge(state);
    case 'host-ended':
      return endHostedLounge(state);
    case 'complete':
      return state.status === 'active' ? state : completeLounge(state);
  }
}
