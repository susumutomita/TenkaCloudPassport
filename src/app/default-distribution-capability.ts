import { distributionCapabilityForRuntime } from './distribution-capability';

/** Bun Test / Expo Go の既定値である。Native / Web は Platform file へ差し替わる。 */
export const DEFAULT_DISTRIBUTION_CAPABILITY =
  distributionCapabilityForRuntime('expo-go');
