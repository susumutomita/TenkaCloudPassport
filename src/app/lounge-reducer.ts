import {
  advanceLounge,
  type ClockSnapshot,
  completeLounge,
  endHostedLounge,
  evaluateLounge,
  type LoungeState,
  leaveLounge,
} from '../domain/lounge';
import { RULES_PROVIDER } from '../domain/rules-provider';

export type LoungeAction =
  | { readonly type: 'clock-tick'; readonly clock: ClockSnapshot }
  | { readonly type: 'app-resumed'; readonly clock: ClockSnapshot }
  | { readonly type: 'evaluate'; readonly clock: ClockSnapshot }
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
    case 'evaluate':
      return state.status === 'active'
        ? evaluateLounge(state, RULES_PROVIDER, action.clock)
        : state;
    case 'owner-exit':
      return leaveLounge(state);
    case 'host-ended':
      return endHostedLounge(state);
    case 'complete':
      return state.status === 'active' ? state : completeLounge(state);
  }
}
