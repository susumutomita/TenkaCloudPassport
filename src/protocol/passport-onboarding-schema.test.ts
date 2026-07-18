import { describe, expect, it } from 'bun:test';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import {
  LOCAL_PROFILE_MAX_BYTES,
  parseLocalPrivateProfile,
  parseLocalPrivateProfileJson,
  parsePeerEnvelope,
  parsePublicPassport,
  SchemaValidationError,
} from './schema';

const PROFILE = {
  schemaVersion: 2,
  catalogVersion: CATALOG_VERSION,
  petName: 'こむぎ',
  petEmoji: '🐾',
  ownerAlias: 'オーナー A',
  candidateClues: [
    {
      value: 'open-source',
      category: 'interest',
      selectedForPassport: true,
    },
  ],
  excludedTopics: [],
  languages: ['ja'],
} as const;

const PASSPORT = {
  schemaVersion: 2,
  catalogVersion: CATALOG_VERSION,
  petName: 'こむぎ',
  petEmoji: '🐾',
  ownerAlias: 'オーナー A',
  clues: [
    {
      value: 'open-source',
      category: 'interest',
      source: 'owner-selected',
    },
  ],
  languages: ['ja'],
} as const;

function expectSchemaError(
  action: () => void,
  code: SchemaValidationError['code']
): void {
  try {
    action();
    throw new Error('SchemaValidationError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(SchemaValidationError);
    if (error instanceof SchemaValidationError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('Passport Onboarding Schema Version 2', () => {
  it('Local Profile と Public Passport の許可 field を再構築する', () => {
    expect(parseLocalPrivateProfile(PROFILE)).toEqual(PROFILE);
    expect(parsePublicPassport(PASSPORT)).toEqual(PASSPORT);
  });

  it('Version 1 を現行 Profile として受理しない', () => {
    expectSchemaError(
      () => parseLocalPrivateProfile({ ...PROFILE, schemaVersion: 1 }),
      'UNSUPPORTED_VERSION'
    );
    expectSchemaError(
      () => parsePublicPassport({ ...PASSPORT, schemaVersion: 1 }),
      'UNSUPPORTED_VERSION'
    );
  });

  it('表示名の前後空白、空文字、上限超過を拒否する', () => {
    for (const petName of ['', ' こむぎ ', 'a'.repeat(25)]) {
      expectSchemaError(
        () => parseLocalPrivateProfile({ ...PROFILE, petName }),
        petName.length === 0 || petName.length > 24
          ? 'LIMIT_EXCEEDED'
          : 'INVALID_VALUE'
      );
    }
  });

  it('未許可 Emoji、Language、分類別上限超過を拒否する', () => {
    expectSchemaError(
      () => parseLocalPrivateProfile({ ...PROFILE, petEmoji: '👤' }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () => parseLocalPrivateProfile({ ...PROFILE, languages: ['fr'] }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () =>
        parseLocalPrivateProfile({
          ...PROFILE,
          candidateClues: [
            PROFILE.candidateClues[0],
            {
              value: 'accessibility',
              category: 'interest',
              selectedForPassport: true,
            },
            {
              value: 'event-lessons',
              category: 'conversation-topic',
              selectedForPassport: true,
            },
            {
              value: 'responsible-ai',
              category: 'conversation-topic',
              selectedForPassport: true,
            },
          ],
        }),
      'INVALID_VALUE'
    );
  });

  it('Local Profile JSON の byte 上限を Schema 前に検査する', () => {
    expect(parseLocalPrivateProfileJson(JSON.stringify(PROFILE))).toEqual(
      PROFILE
    );
    const oversized = JSON.stringify({
      ...PROFILE,
      unknown: 'x'.repeat(LOCAL_PROFILE_MAX_BYTES),
    });
    expectSchemaError(
      () => parseLocalPrivateProfileJson(oversized),
      'LIMIT_EXCEEDED'
    );
  });

  it('Peer Protocol Version 1.2 の Public Passport Payload を受理する', () => {
    const envelope = {
      protocolVersion: { major: 1, minor: 2 },
      loungeId: `lng_${'11'.repeat(16)}`,
      senderParticipantId: `ptc_${'22'.repeat(16)}`,
      messageId: `mid_${'33'.repeat(16)}`,
      sequence: 0,
      sentAtEpochMs: 1_784_332_800_000,
      expiresAtEpochMs: 1_784_332_860_000,
      payload: { kind: 'public-passport', publicPassport: PASSPORT },
    } as const;

    expect(parsePeerEnvelope(envelope)).toEqual(envelope);
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...envelope,
          protocolVersion: { major: 1, minor: 1 },
        }),
      'UNSUPPORTED_VERSION'
    );
  });
});
