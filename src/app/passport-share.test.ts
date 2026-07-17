import { describe, expect, it } from 'bun:test';
import { createLocalPrivateProfile } from '../domain/passport';
import {
  createDefaultPassportShareSelection,
  createPassportShare,
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
