import type {
  DistributionCapability,
  DistributionRuntime,
  DistributionTier,
} from './distribution-capability';
import type { Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';

export interface DistributionCapabilityNotice {
  readonly runtime: string;
  readonly tier: string;
  readonly rulesProvider: string;
  readonly localModel: string;
  readonly nearbyTransport: string;
}

/** 固定 Message Catalog だけから Runtime capability の表示文を組み立てる。 */
export function distributionCapabilityNotice(
  capability: DistributionCapability,
  locale: Locale
): DistributionCapabilityNotice {
  const messages = MESSAGES[locale].settings.distribution;
  const runtimeLabels: Record<DistributionRuntime, string> = {
    web: messages.runtime.web,
    'expo-go': messages.runtime.expoGo,
    'native-build': messages.runtime.nativeBuild,
  };
  const tierLabels: Record<DistributionTier, string> = {
    'product-hypothesis': messages.tier.productHypothesis,
    'undetermined-native': messages.tier.undeterminedNative,
  };

  return {
    runtime: messages.runtimeLabel(runtimeLabels[capability.runtime]),
    tier: messages.tierLabel(tierLabels[capability.tier]),
    rulesProvider: messages.rulesProviderAvailable,
    localModel:
      capability.localModel === 'requires-setup'
        ? messages.localModelRequiresSetup
        : messages.localModelUnavailable,
    nearbyTransport: messages.nearbyTransportUnavailable,
  };
}
