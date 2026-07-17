import type { Bridge } from './bridge';

export type AgentDecision =
  | {
      readonly schemaVersion: 1;
      readonly kind: 'bridge';
      readonly bridge: Bridge;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: 'no-signal';
      readonly reason: 'insufficient-evidence';
    };
