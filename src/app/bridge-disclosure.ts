export type BridgeDisclosureState = 'masked' | 'visible';

export type BridgeDisclosureAction =
  | { readonly type: 'reveal' }
  | { readonly type: 'mask' }
  | { readonly type: 'app-became-inactive' };

export const INITIAL_BRIDGE_DISCLOSURE_STATE: BridgeDisclosureState = 'masked';

export function reduceBridgeDisclosure(
  state: BridgeDisclosureState,
  action: BridgeDisclosureAction
): BridgeDisclosureState {
  switch (action.type) {
    case 'reveal':
      return state === 'visible' ? state : 'visible';
    case 'mask':
    case 'app-became-inactive':
      return state === 'masked' ? state : 'masked';
  }
}
