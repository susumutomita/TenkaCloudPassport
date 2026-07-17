import { describe, expect, it } from 'bun:test';
import {
  createLocalPrivateProfile,
  PassportValidationError,
  projectPublicPassport,
} from './passport';

const EVENT_OPERATIONS = 'regional-event-operations';
const LOCAL_TOURNAMENT = 'local-tournament';
const OPEN_SOURCE = 'open-source';
const ACCESSIBILITY = 'accessibility';

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
});
