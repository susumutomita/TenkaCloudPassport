import { describe, expect, it } from 'bun:test';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import { migrateBackupToCurrent } from './migration';
import { SchemaValidationError } from './schema';

const LEGACY_BACKUP = {
  backupSchemaVersion: 0,
  exportedAt: '2026-07-17T00:00:00.000Z',
  localPrivateProfile: {
    schemaVersion: 0,
    catalogVersion: CATALOG_VERSION,
    candidateClues: [
      {
        value: 'open-source',
        category: 'interest',
        selectedForPassport: true,
      },
    ],
  },
  deviceSettings: {
    language: 'ja',
    catalogVersion: CATALOG_VERSION,
  },
  modelVerification: null,
} as const;

describe('Backup Version Migration', () => {
  it('Version 0 を新しい object の Version 2 へ移行する', () => {
    const migrated = migrateBackupToCurrent(LEGACY_BACKUP);

    expect(migrated.backupSchemaVersion).toBe(2);
    expect(migrated.localPrivateProfile.schemaVersion).toBe(2);
    expect(migrated.localPrivateProfile.petName).toBe('マイペット');
    expect(migrated.localPrivateProfile.petEmoji).toBe('🐾');
    expect(migrated.localPrivateProfile.languages).toEqual([]);
    expect(migrated.localPrivateProfile.excludedTopics).toEqual([]);
    expect(migrated.deviceSettings.reduceMotion).toBe(false);
    expect(migrated.deviceSettings.selectedModelDigest).toBeNull();
    expect(migrated).not.toBe(LEGACY_BACKUP);
  });

  it('現行 Version 2 も検証して新しい object として返す', () => {
    const current = migrateBackupToCurrent(LEGACY_BACKUP);
    const reparsed = migrateBackupToCurrent(current);

    expect(reparsed).toEqual(current);
    expect(reparsed).not.toBe(current);
    expect(reparsed.localPrivateProfile).not.toBe(current.localPrivateProfile);
  });

  it('Migration 失敗時に入力と既存データを変更しない', () => {
    const input = structuredClone(LEGACY_BACKUP);
    const inputBefore = structuredClone(input);
    const existing = migrateBackupToCurrent(LEGACY_BACKUP);
    const existingBefore = structuredClone(existing);

    try {
      migrateBackupToCurrent({ ...input, unexpected: 'field' });
      throw new Error('SchemaValidationError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SchemaValidationError);
    }

    expect(input).toEqual(inputBefore);
    expect(existing).toEqual(existingBefore);
  });

  it('未知の Backup Version を拒否する', () => {
    try {
      migrateBackupToCurrent({ ...LEGACY_BACKUP, backupSchemaVersion: 3 });
      throw new Error('SchemaValidationError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      if (error instanceof SchemaValidationError) {
        expect(error.code).toBe('UNSUPPORTED_VERSION');
      }
    }
  });
});
