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
