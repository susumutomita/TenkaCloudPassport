import { describe, expect, it } from 'bun:test';
import {
  createLocalPrivateProfile,
  OWNER_ALIAS_MAX_LENGTH,
  PASSPORT_FIELD_LIMITS,
  PassportValidationError,
  PET_NAME_MAX_LENGTH,
  projectPublicPassport,
} from './passport';

function expectPassportError(
  action: () => void,
  code: PassportValidationError['code']
): void {
  try {
    action();
    throw new Error('PassportValidationError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(PassportValidationError);
    if (error instanceof PassportValidationError) {
      expect(error.code).toBe(code);
    }
  }
}

function minimalProfile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
    languageCodes: ['ja'],
  });
}

describe('Passport 初回設定の Domain validation', () => {
  it('Pet Name と会話材料 1 件だけで有効な Local Profile を作る', () => {
    const profile = minimalProfile();

    expect(profile).toEqual({
      schemaVersion: 2,
      catalogVersion: '2026-07-17',
      petName: 'こむぎ',
      petEmoji: '🐾',
      candidateClues: [
        {
          value: 'open-source',
          category: 'interest',
          selectedForPassport: true,
        },
      ],
      excludedTopics: [],
      languages: ['ja'],
    });
    expect(Object.hasOwn(profile, 'ownerAlias')).toBe(false);
  });

  it('Pet Name は trim し、上限と同じ長さを受理する', () => {
    const profile = createLocalPrivateProfile({
      petName: ` ${'a'.repeat(PET_NAME_MAX_LENGTH)} `,
      petEmoji: '🦊',
      ownerAlias: '',
      candidateClueIds: ['open-source'],
      selectedForPassportClueIds: [],
      languageCodes: [],
    });

    expect(profile.petName).toBe('a'.repeat(PET_NAME_MAX_LENGTH));
  });

  it('空白だけまたは上限を超える Pet Name を拒否する', () => {
    for (const petName of ['', '   ', 'a'.repeat(PET_NAME_MAX_LENGTH + 1)]) {
      expectPassportError(
        () =>
          createLocalPrivateProfile({
            petName,
            petEmoji: '🐾',
            ownerAlias: '',
            candidateClueIds: ['open-source'],
            selectedForPassportClueIds: [],
            languageCodes: [],
          }),
        'PET_NAME_INVALID'
      );
    }
  });

  it('同梱カタログ外の Pet Emoji を拒否する', () => {
    expectPassportError(
      () =>
        createLocalPrivateProfile({
          petName: 'こむぎ',
          petEmoji: '👤',
          ownerAlias: '',
          candidateClueIds: ['open-source'],
          selectedForPassportClueIds: [],
          languageCodes: [],
        }),
      'PET_EMOJI_INVALID'
    );
  });

  it('Owner Alias は空を許可し、上限と同じ長さを trim して保持する', () => {
    const profile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: ` ${'b'.repeat(OWNER_ALIAS_MAX_LENGTH)} `,
      candidateClueIds: ['open-source'],
      selectedForPassportClueIds: [],
      languageCodes: [],
    });

    expect(profile.ownerAlias).toBe('b'.repeat(OWNER_ALIAS_MAX_LENGTH));
  });

  it('上限を超える Owner Alias を拒否する', () => {
    expectPassportError(
      () =>
        createLocalPrivateProfile({
          petName: 'こむぎ',
          petEmoji: '🐾',
          ownerAlias: 'b'.repeat(OWNER_ALIAS_MAX_LENGTH + 1),
          candidateClueIds: ['open-source'],
          selectedForPassportClueIds: [],
          languageCodes: [],
        }),
      'OWNER_ALIAS_INVALID'
    );
  });

  it('会話材料が空の場合は Local Profile を作らない', () => {
    expectPassportError(
      () =>
        createLocalPrivateProfile({
          petName: 'こむぎ',
          petEmoji: '🐾',
          ownerAlias: '',
          candidateClueIds: [],
          selectedForPassportClueIds: [],
          languageCodes: [],
        }),
      'PROFILE_CLUE_COUNT'
    );
  });

  it('Topics の分類別上限を超える候補を拒否する', () => {
    expect(PASSPORT_FIELD_LIMITS.topics).toBe(3);
    expect(PASSPORT_FIELD_LIMITS.offers).toBe(3);

    expectPassportError(
      () =>
        createLocalPrivateProfile({
          petName: 'こむぎ',
          petEmoji: '🐾',
          ownerAlias: '',
          candidateClueIds: [
            'open-source',
            'accessibility',
            'event-lessons',
            'responsible-ai',
          ],
          selectedForPassportClueIds: [],
          languageCodes: [],
        }),
      'PROFILE_FIELD_COUNT'
    );
  });

  it('Language の重複、カタログ外、上限超過を拒否する', () => {
    for (const languageCodes of [
      ['ja', 'ja'],
      ['fr'],
      ['ja', 'en', 'fr', 'de'],
    ]) {
      expectPassportError(
        () =>
          createLocalPrivateProfile({
            petName: 'こむぎ',
            petEmoji: '🐾',
            ownerAlias: '',
            candidateClueIds: ['open-source'],
            selectedForPassportClueIds: [],
            languageCodes,
          }),
        'LANGUAGE_INVALID'
      );
    }
  });
});

describe('初回設定から Public Passport への Projection', () => {
  it('今回 ON にした表示情報、手掛かり、Language だけを投影する', () => {
    const profile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🦊',
      ownerAlias: 'オーナー A',
      candidateClueIds: ['open-source', 'local-tournament'],
      selectedForPassportClueIds: ['open-source', 'local-tournament'],
      languageCodes: ['ja', 'en'],
    });

    const passport = projectPublicPassport(profile, {
      includePetName: true,
      includePetEmoji: false,
      includeOwnerAlias: false,
      clueIds: ['local-tournament'],
      languageCodes: ['en'],
      ownerConfirmed: true,
    });

    expect(passport).toEqual({
      schemaVersion: 2,
      catalogVersion: '2026-07-17',
      petName: 'こむぎ',
      clues: [
        {
          value: 'local-tournament',
          category: 'activity',
          source: 'owner-selected',
        },
      ],
      languages: ['en'],
    });
  });

  it('Pet Name を今回 OFF にした場合は投影しない', () => {
    expectPassportError(
      () =>
        projectPublicPassport(minimalProfile(), {
          includePetName: false,
          includePetEmoji: true,
          includeOwnerAlias: false,
          clueIds: ['open-source'],
          languageCodes: ['ja'],
          ownerConfirmed: true,
        }),
      'PET_NAME_REQUIRED'
    );
  });

  it('Local Profile にない Language と空の Alias の共有を拒否する', () => {
    for (const input of [
      {
        includePetName: true,
        includePetEmoji: true,
        includeOwnerAlias: false,
        clueIds: ['open-source'],
        languageCodes: ['en'],
        ownerConfirmed: true,
      },
      {
        includePetName: true,
        includePetEmoji: true,
        includeOwnerAlias: true,
        clueIds: ['open-source'],
        languageCodes: ['ja'],
        ownerConfirmed: true,
      },
    ] as const) {
      expectPassportError(
        () => projectPublicPassport(minimalProfile(), input),
        input.includeOwnerAlias
          ? 'OWNER_ALIAS_NOT_IN_PROFILE'
          : 'LANGUAGE_NOT_IN_PROFILE'
      );
    }
  });
});
