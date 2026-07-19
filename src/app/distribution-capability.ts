export type DistributionRuntime = 'web' | 'expo-go' | 'native-build';
export type DistributionTier = 'product-hypothesis' | 'undetermined-native';

export interface DistributionCapability {
  readonly runtime: DistributionRuntime;
  readonly tier: DistributionTier;
  readonly rulesProvider: 'available';
  readonly localModel: 'unavailable' | 'requires-setup';
  readonly nearbyTransport: 'unavailable';
}

/**
 * Issue 28: Provider の実行結果とは独立した、現在 Binary の配布能力を返す。
 * Development Build で Model 未設定の Rules fallback が起きても Runtime Tier を失わない。
 */
export function distributionCapabilityForRuntime(
  runtime: DistributionRuntime
): DistributionCapability {
  if (runtime === 'native-build') {
    return {
      runtime,
      tier: 'undetermined-native',
      rulesProvider: 'available',
      localModel: 'requires-setup',
      nearbyTransport: 'unavailable',
    };
  }
  return {
    runtime,
    tier: 'product-hypothesis',
    rulesProvider: 'available',
    localModel: 'unavailable',
    nearbyTransport: 'unavailable',
  };
}
