import { describe, expect, it } from 'bun:test';
import { CLUE_IDS } from './clue-catalog';
import {
  createLocalPrivateProfile as createDomainProfile,
  type LocalPrivateProfile,
  PassportValidationError,
  projectPublicPassport as projectDomainPassport,
} from './passport';

const EVENT_OPERATIONS = 'regional-event-operations';
const LOCAL_TOURNAMENT = 'local-tournament';
const OPEN_SOURCE = 'open-source';
const ACCESSIBILITY = 'accessibility';

interface ClueProfileInput {
  readonly candidateClueIds: readonly string[];
  readonly selectedForPassportClueIds: readonly string[];
  readonly excludedTopicIds?: readonly string[];
}

function createLocalPrivateProfile(
  input: ClueProfileInput
): LocalPrivateProfile {
  return createDomainProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    ...input,
    languageCodes: [],
  });
}

function projectPublicPassport(
  profile: LocalPrivateProfile,
  input: {
    readonly clueIds: readonly string[];
    readonly ownerConfirmed: boolean;
  }
) {
  return projectDomainPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    ...input,
    languageCodes: [],
  });
}

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

describe('Local Private Profile', () => {
  it('カタログ内の候補と公開選択を分離して保持する', () => {
    const profile = createLocalPrivateProfile({
      candidateClueIds: [
        EVENT_OPERATIONS,
        LOCAL_TOURNAMENT,
        OPEN_SOURCE,
        ACCESSIBILITY,
      ],
      selectedForPassportClueIds: [EVENT_OPERATIONS, OPEN_SOURCE],
    });

    expect(profile.candidateClues).toHaveLength(4);
    expect(
      profile.candidateClues
        .filter((clue) => clue.selectedForPassport)
        .map((clue) => clue.value)
    ).toEqual([EVENT_OPERATIONS, OPEN_SOURCE]);
  });

  it('カタログ外の候補を拒否する', () => {
    expectPassportError(
      () =>
        createLocalPrivateProfile({
          candidateClueIds: ['free-text-clue'],
          selectedForPassportClueIds: [],
        }),
      'UNKNOWN_CLUE'
    );
  });

  it('重複する候補を拒否する', () => {
    expectPassportError(
      () =>
        createLocalPrivateProfile({
          candidateClueIds: [EVENT_OPERATIONS, EVENT_OPERATIONS],
          selectedForPassportClueIds: [EVENT_OPERATIONS],
        }),
      'DUPLICATE_CLUE'
    );
  });

  it('候補にない公開選択を拒否する', () => {
    expectPassportError(
      () =>
        createLocalPrivateProfile({
          candidateClueIds: [EVENT_OPERATIONS],
          selectedForPassportClueIds: [OPEN_SOURCE],
        }),
      'CLUE_NOT_IN_PROFILE'
    );
  });

  it('候補が Local Profile 上限を超える場合は拒否する', () => {
    const allowedClues = CLUE_IDS.slice(0, 10);
    const firstClue = allowedClues[0];
    if (!firstClue)
      throw new Error('カタログに 1 件以上の手掛かりが必要です。');

    expect(
      createLocalPrivateProfile({
        candidateClueIds: allowedClues,
        selectedForPassportClueIds: [],
      }).candidateClues
    ).toHaveLength(10);

    expectPassportError(
      () =>
        createLocalPrivateProfile({
          candidateClueIds: [...allowedClues, firstClue],
          selectedForPassportClueIds: [],
        }),
      'PROFILE_CLUE_COUNT'
    );
  });
});

describe('Public Passport', () => {
  const profile = createLocalPrivateProfile({
    candidateClueIds: [
      EVENT_OPERATIONS,
      LOCAL_TOURNAMENT,
      OPEN_SOURCE,
      ACCESSIBILITY,
    ],
    selectedForPassportClueIds: [
      EVENT_OPERATIONS,
      LOCAL_TOURNAMENT,
      OPEN_SOURCE,
      ACCESSIBILITY,
    ],
  });

  it('Owner が確認した最大 3 件を owner-selected の手掛かりへ投影する', () => {
    const passport = projectPublicPassport(profile, {
      clueIds: [EVENT_OPERATIONS, LOCAL_TOURNAMENT, OPEN_SOURCE],
      ownerConfirmed: true,
    });

    expect(passport.clues).toHaveLength(3);
    expect(
      passport.clues.every((clue) => clue.source === 'owner-selected')
    ).toBe(true);
    expect(passport.clues.map((clue) => clue.value)).toEqual([
      EVENT_OPERATIONS,
      LOCAL_TOURNAMENT,
      OPEN_SOURCE,
    ]);
  });

  it('Owner の公開確認がない場合は投影を拒否する', () => {
    expectPassportError(
      () =>
        projectPublicPassport(profile, {
          clueIds: [EVENT_OPERATIONS],
          ownerConfirmed: false,
        }),
      'OWNER_CONFIRMATION_REQUIRED'
    );
  });

  it('公開項目が 0 件の場合は拒否する', () => {
    expectPassportError(
      () =>
        projectPublicPassport(profile, {
          clueIds: [],
          ownerConfirmed: true,
        }),
      'PASSPORT_CLUE_COUNT'
    );
  });

  it('公開項目が 4 件の場合は拒否する', () => {
    expectPassportError(
      () =>
        projectPublicPassport(profile, {
          clueIds: [
            EVENT_OPERATIONS,
            LOCAL_TOURNAMENT,
            OPEN_SOURCE,
            ACCESSIBILITY,
          ],
          ownerConfirmed: true,
        }),
      'PASSPORT_CLUE_COUNT'
    );
  });

  it('同じ公開項目を複数選んだ場合は拒否する', () => {
    expectPassportError(
      () =>
        projectPublicPassport(profile, {
          clueIds: [EVENT_OPERATIONS, EVENT_OPERATIONS],
          ownerConfirmed: true,
        }),
      'DUPLICATE_CLUE'
    );
  });

  it('Profile で公開対象にしていない項目を拒否する', () => {
    const privateProfile = createLocalPrivateProfile({
      candidateClueIds: [EVENT_OPERATIONS, OPEN_SOURCE],
      selectedForPassportClueIds: [EVENT_OPERATIONS],
    });

    expectPassportError(
      () =>
        projectPublicPassport(privateProfile, {
          clueIds: [OPEN_SOURCE],
          ownerConfirmed: true,
        }),
      'CLUE_NOT_SELECTED'
    );
  });

  it('Local 専用 field が増えても公開 allowlist だけを投影する', () => {
    const privateProfileWithLocalOnlyFields = {
      ...profile,
      localId: 'local-only-id',
      updatedAt: '2026-07-17T00:00:00.000Z',
      deviceInfo: 'local-device',
      contact: 'owner@example.invalid',
      storagePath: '/private/profile.json',
    };

    const passport = projectPublicPassport(privateProfileWithLocalOnlyFields, {
      clueIds: [EVENT_OPERATIONS],
      ownerConfirmed: true,
    });

    expect(Object.keys(passport).sort()).toEqual([
      'catalogVersion',
      'clues',
      'languages',
      'petEmoji',
      'petName',
      'schemaVersion',
    ]);
    expect(Object.keys(passport.clues[0] ?? {}).sort()).toEqual([
      'category',
      'source',
      'value',
    ]);
    expect(JSON.stringify(passport)).not.toContain('local-only-id');
    expect(JSON.stringify(passport)).not.toContain('owner@example.invalid');
    expect(JSON.stringify(passport)).not.toContain('/private/profile.json');
  });
});
