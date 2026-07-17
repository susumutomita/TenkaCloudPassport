import { describe, expect, it } from 'bun:test';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import { migrateBackupToCurrent } from './migration';

describe('Passport Onboarding Backup Migration', () => {
  it('Version 1 の保存済み Profile を Version 2 へ純粋に移行する', () => {
    const legacy = {
      backupSchemaVersion: 1,
      exportedAt: '2026-07-17T00:00:00.000Z',
      localPrivateProfile: {
        schemaVersion: 1,
        catalogVersion: CATALOG_VERSION,
        candidateClues: [
          {
            value: 'open-source',
            category: 'interest',
            selectedForPassport: true,
          },
        ],
        excludedTopics: ['accessibility'],
      },
      deviceSettings: {
        language: 'ja',
        reduceMotion: false,
        selectedModelDigest: null,
        catalogVersion: CATALOG_VERSION,
      },
      modelVerification: null,
    } as const;
    const before = structuredClone(legacy);

    const migrated = migrateBackupToCurrent(legacy);

    expect(migrated.backupSchemaVersion).toBe(2);
    expect(migrated.localPrivateProfile).toMatchObject({
      schemaVersion: 2,
      petName: 'マイペット',
      petEmoji: '🐾',
      languages: [],
      excludedTopics: ['accessibility'],
    });
    expect(legacy).toEqual(before);
  });

  it('手掛かりが空の旧 Profile は値を補わず Migration を拒否する', () => {
    expect(() =>
      migrateBackupToCurrent({
        backupSchemaVersion: 1,
        exportedAt: '2026-07-17T00:00:00.000Z',
        localPrivateProfile: {
          schemaVersion: 1,
          catalogVersion: CATALOG_VERSION,
          candidateClues: [],
          excludedTopics: [],
        },
        deviceSettings: {
          language: 'ja',
          reduceMotion: false,
          selectedModelDigest: null,
          catalogVersion: CATALOG_VERSION,
        },
        modelVerification: null,
      })
    ).toThrow();
  });

  it('カタログ外の旧手掛かりを Migration 前に拒否する', () => {
    expect(() =>
      migrateBackupToCurrent({
        backupSchemaVersion: 1,
        exportedAt: '2026-07-17T00:00:00.000Z',
        localPrivateProfile: {
          schemaVersion: 1,
          catalogVersion: CATALOG_VERSION,
          candidateClues: [
            {
              value: 'free-text-clue',
              category: 'interest',
              selectedForPassport: true,
            },
          ],
          excludedTopics: [],
        },
        deviceSettings: {
          language: 'ja',
          reduceMotion: false,
          selectedModelDigest: null,
          catalogVersion: CATALOG_VERSION,
        },
        modelVerification: null,
      })
    ).toThrow();
  });
});
