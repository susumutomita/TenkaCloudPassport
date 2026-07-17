import { describe, expect, it } from 'bun:test';
import { createLocalPrivateProfile } from '../domain/passport';
import {
  createDefaultPassportShareSelection,
  createPassportShare,
  reducePassportShareSelection,
  toggleClueId,
  toggleLanguageCode,
} from './passport-share';

function profile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🦊',
    ownerAlias: 'オーナー A',
    candidateClueIds: [
      'open-source',
      'local-tournament',
      'community-operations',
      'information-security',
    ],
    selectedForPassportClueIds: [
      'open-source',
      'local-tournament',
      'community-operations',
      'information-security',
    ],
    languageCodes: ['ja', 'en'],
  });
}

describe('Public Passport の共有 Preview', () => {
  it('Preview、QR Projection、Peer Payload を同じ Snapshot に固定する', () => {
    const localProfile = profile();
    const selection = {
      ...createDefaultPassportShareSelection(localProfile),
      includePetEmoji: false,
      includeOwnerAlias: true,
      clueIds: ['local-tournament', 'community-operations'],
      languageCodes: ['en'],
    } as const;

    const share = createPassportShare(localProfile, selection);

    expect(share.preview.publicPassport).toBe(share.qrProjection);
    expect(share.peerPayload.publicPassport).toBe(share.qrProjection);
    expect(share).toMatchSnapshot();
  });

  it('初期選択は Pet 表示情報、Alias、先頭 3 手掛かり、Languages を ON にする', () => {
    expect(createDefaultPassportShareSelection(profile())).toEqual({
      includePetName: true,
      includePetEmoji: true,
      includeOwnerAlias: true,
      clueIds: ['open-source', 'local-tournament', 'community-operations'],
      languageCodes: ['ja', 'en'],
    });
  });

  it('空の Owner Alias は初期選択へ含めない', () => {
    const localProfile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: ['open-source'],
      selectedForPassportClueIds: ['open-source'],
      languageCodes: [],
    });

    expect(
      createDefaultPassportShareSelection(localProfile).includeOwnerAlias
    ).toBe(false);
  });

  it('Pet Name を OFF にした無効な Preview を生成しない', () => {
    const localProfile = profile();

    expect(() =>
      createPassportShare(localProfile, {
        ...createDefaultPassportShareSelection(localProfile),
        includePetName: false,
      })
    ).toThrow('Pet Name');
  });
});

describe('Clue / Language 選択の toggle', () => {
  it('未選択の Clue ID は上限未満なら追加する', () => {
    expect(toggleClueId(['open-source'], 'accessibility', 3)).toEqual([
      'open-source',
      'accessibility',
    ]);
  });

  it('選択済みの Clue ID は除去する', () => {
    expect(
      toggleClueId(['open-source', 'accessibility'], 'open-source', 3)
    ).toEqual(['accessibility']);
  });

  it('上限に達した未選択の Clue ID は追加しない', () => {
    const selected = [
      'open-source',
      'accessibility',
      'local-tournament',
    ] as const;

    expect(toggleClueId(selected, 'information-security', 3)).toEqual([
      ...selected,
    ]);
  });

  it('未選択の Language は上限未満なら追加する', () => {
    expect(toggleLanguageCode(['ja'], 'en', 3)).toEqual(['ja', 'en']);
  });

  it('選択済みの Language は除去する', () => {
    expect(toggleLanguageCode(['ja', 'en'], 'ja', 3)).toEqual(['en']);
  });

  it('上限に達した未選択の Language は追加しない', () => {
    expect(toggleLanguageCode(['ja'], 'en', 1)).toEqual(['ja']);
  });
});

describe('共有 Selection の reducer', () => {
  function selection() {
    return createDefaultPassportShareSelection(profile());
  }

  it('Pet Name を toggle する', () => {
    const next = reducePassportShareSelection(selection(), {
      type: 'toggle-pet-name',
    });

    expect(next.includePetName).toBe(false);
  });

  it('Pet Emoji を toggle する', () => {
    const next = reducePassportShareSelection(selection(), {
      type: 'toggle-pet-emoji',
    });

    expect(next.includePetEmoji).toBe(false);
  });

  it('Owner Alias を toggle する', () => {
    const next = reducePassportShareSelection(selection(), {
      type: 'toggle-owner-alias',
    });

    expect(next.includeOwnerAlias).toBe(false);
  });

  it('Clue を toggle する', () => {
    const next = reducePassportShareSelection(selection(), {
      type: 'toggle-clue',
      id: 'open-source',
    });

    expect(next.clueIds).not.toContain('open-source');
  });

  it('Language を toggle する', () => {
    const next = reducePassportShareSelection(selection(), {
      type: 'toggle-language',
      code: 'en',
    });

    expect(next.languageCodes).not.toContain('en');
  });
});
