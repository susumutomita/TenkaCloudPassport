import { describe, expect, it } from 'bun:test';
import {
  type DistributionRuntime,
  distributionCapabilityForRuntime,
} from './distribution-capability';
import { distributionCapabilityNotice } from './distribution-capability-notice';

describe('Issue 28: 配布 Tier と実行環境の能力境界', () => {
  it.each([
    'web',
    'expo-go',
  ] as const)('%s は Tier A として Rules だけを利用可能にする', (runtime) => {
    const capability = distributionCapabilityForRuntime(runtime);

    expect(capability).toEqual({
      runtime,
      tier: 'product-hypothesis',
      rulesProvider: 'available',
      localModel: 'unavailable',
      nearbyTransport: 'unavailable',
    });
  });

  it('Native Build は配布経路が無い限り Tier B / C を未判定にする', () => {
    expect(distributionCapabilityForRuntime('native-build')).toEqual({
      runtime: 'native-build',
      tier: 'undetermined-native',
      rulesProvider: 'available',
      localModel: 'requires-setup',
      nearbyTransport: 'unavailable',
    });
  });

  it.each([
    ['web', 'Web', 'Tier A', '利用できません'],
    ['expo-go', 'Expo Go', 'Tier A', '利用できません'],
    ['native-build', 'Native Build', '未判定', '設定と実機検証'],
  ] as const)('%s の日本語表示は Runtime・Tier・Local Model の制約を同時に示す', (runtime, runtimeLabel, tierLabel, localModelConstraint) => {
    const notice = distributionCapabilityNotice(
      distributionCapabilityForRuntime(runtime),
      'ja'
    );

    expect(notice.runtime).toContain(runtimeLabel);
    expect(notice.tier).toContain(tierLabel);
    expect(notice.rulesProvider).toContain('Rules Provider');
    expect(notice.localModel).toContain(localModelConstraint);
    expect(notice.nearbyTransport).toContain('利用できません');
  });

  it('英語表示でも Expo Go に Local LLM / Nearby があると誤認させない', () => {
    const notice = distributionCapabilityNotice(
      distributionCapabilityForRuntime('expo-go'),
      'en'
    );

    expect(notice.runtime).toContain('Expo Go');
    expect(notice.tier).toContain('Tier A');
    expect(notice.rulesProvider).toContain('available');
    expect(notice.localModel).toContain('not available');
    expect(notice.nearbyTransport).toContain('not available');
  });

  it('閉じた Runtime 集合は Web・Expo Go・Native Build の 3 種類だけである', () => {
    const runtimes: readonly DistributionRuntime[] = [
      'web',
      'expo-go',
      'native-build',
    ];

    expect(runtimes.map(distributionCapabilityForRuntime)).toHaveLength(3);
  });
});
