import { describe, expect, it } from 'bun:test';
import { completeLounge, evaluateLounge, startLounge } from './lounge';
import { createLocalPrivateProfile, projectPublicPassport } from './passport';
import { RULES_PROVIDER } from './rules-provider';

describe('Passport 作成から単一端末 Lounge 終了まで', () => {
  it('公開確認、Rules 判定、retired、完全破棄を一気通貫で完了する', () => {
    const ownerProfile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: ['open-source', 'accessibility'],
      selectedForPassportClueIds: ['open-source'],
      languageCodes: [],
    });
    const encounteredProfile = createLocalPrivateProfile({
      petName: 'あずき',
      petEmoji: '🐶',
      ownerAlias: '',
      candidateClueIds: ['open-source', 'local-tournament'],
      selectedForPassportClueIds: ['open-source'],
      languageCodes: [],
    });
    const ownerPassport = projectPublicPassport(ownerProfile, {
      includePetName: true,
      includePetEmoji: true,
      includeOwnerAlias: false,
      clueIds: ['open-source'],
      languageCodes: [],
      ownerConfirmed: true,
    });
    const encounteredPassport = projectPublicPassport(encounteredProfile, {
      includePetName: true,
      includePetEmoji: true,
      includeOwnerAlias: false,
      clueIds: ['open-source'],
      languageCodes: [],
      ownerConfirmed: true,
    });
    const active = startLounge({
      ownerPassport,
      encounteredPassport,
      clock: { wallClockMs: 10_000, monotonicMs: 20_000 },
    });

    const retired = evaluateLounge(active, RULES_PROVIDER, {
      wallClockMs: 10_100,
      monotonicMs: 20_100,
    });
    expect(retired.status).toBe('retired');
    if (retired.status === 'retired') {
      expect(retired.outcome.kind).toBe('bridge');
    }
    expect(completeLounge(retired)).toEqual({
      status: 'destroyed',
      reason: 'completed',
    });
  });
});
