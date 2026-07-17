import type { Backup } from '../domain/backup';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import { parseBackup, parseLocalPrivateProfile } from './schema';
import {
  assertLiteral,
  assertOneOf,
  schemaError,
  strictRecord,
} from './validation';

function migrateVersionZero(value: unknown): Backup {
  const path = '$.legacyBackup';
  const record = strictRecord(value, path, [
    'backupSchemaVersion',
    'exportedAt',
    'localPrivateProfile',
    'deviceSettings',
    'modelVerification',
  ]);
  assertLiteral(record.backupSchemaVersion, 0, `${path}.backupSchemaVersion`);

  const legacyProfilePath = `${path}.localPrivateProfile`;
  const legacyProfile = strictRecord(
    record.localPrivateProfile,
    legacyProfilePath,
    ['schemaVersion', 'catalogVersion', 'candidateClues']
  );
  assertLiteral(
    legacyProfile.schemaVersion,
    0,
    `${legacyProfilePath}.schemaVersion`
  );
  assertLiteral(
    legacyProfile.catalogVersion,
    CATALOG_VERSION,
    `${legacyProfilePath}.catalogVersion`
  );

  const legacySettingsPath = `${path}.deviceSettings`;
  const legacySettings = strictRecord(
    record.deviceSettings,
    legacySettingsPath,
    ['language', 'catalogVersion']
  );
  const language = assertOneOf(
    legacySettings.language,
    ['ja', 'en'],
    `${legacySettingsPath}.language`
  );
  assertLiteral(
    legacySettings.catalogVersion,
    CATALOG_VERSION,
    `${legacySettingsPath}.catalogVersion`
  );

  const localPrivateProfile = parseLocalPrivateProfile({
    schemaVersion: 1,
    catalogVersion: legacyProfile.catalogVersion,
    candidateClues: legacyProfile.candidateClues,
    excludedTopics: [],
  });

  return parseBackup({
    backupSchemaVersion: 1,
    exportedAt: record.exportedAt,
    localPrivateProfile,
    deviceSettings: {
      language,
      reduceMotion: false,
      selectedModelDigest: null,
      catalogVersion: legacySettings.catalogVersion,
    },
    modelVerification: record.modelVerification,
  });
}

export function migrateBackupToCurrent(value: unknown): Backup {
  const record = strictRecord(
    value,
    '$.backupMigration',
    ['backupSchemaVersion'],
    ['exportedAt', 'localPrivateProfile', 'deviceSettings', 'modelVerification']
  );
  if (record.backupSchemaVersion === 0) return migrateVersionZero(value);
  if (record.backupSchemaVersion === 1) return parseBackup(value);
  return schemaError(
    'UNSUPPORTED_VERSION',
    '$.backupMigration.backupSchemaVersion',
    'Migration 元の Backup Schema Version は対応していません。'
  );
}
