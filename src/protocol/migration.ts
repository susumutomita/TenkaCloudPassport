import type { Backup } from '../domain/backup';
import {
  CATALOG_VERSION,
  type ClueId,
  clueById,
  isClueId,
} from '../domain/clue-catalog';
import {
  createLocalPrivateProfile,
  PROFILE_MAX_CLUES,
} from '../domain/passport';
import { parseBackup } from './schema';
import {
  arrayValue,
  assertLiteral,
  assertUniqueStrings,
  booleanValue,
  schemaError,
  strictRecord,
  stringValue,
} from './validation';

interface LegacyProfileValues {
  readonly candidateClueIds: readonly ClueId[];
  readonly selectedClueIds: readonly ClueId[];
  readonly excludedTopicIds: readonly ClueId[];
}

function legacyClueId(value: unknown, path: string): ClueId {
  const candidate = stringValue(value, path);
  if (!isClueId(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は版管理済みカタログにありません。`
    );
  }
  return candidate;
}

function legacyCandidateClue(
  value: unknown,
  path: string
): { readonly id: ClueId; readonly selected: boolean } {
  const record = strictRecord(value, path, [
    'value',
    'category',
    'selectedForPassport',
  ]);
  const id = legacyClueId(record.value, `${path}.value`);
  assertLiteral(record.category, clueById(id).category, `${path}.category`);
  return {
    id,
    selected: booleanValue(
      record.selectedForPassport,
      `${path}.selectedForPassport`
    ),
  };
}

function legacyProfile(
  value: unknown,
  schema: 0 | 1,
  path: string
): LegacyProfileValues {
  const requiredKeys =
    schema === 0
      ? (['schemaVersion', 'catalogVersion', 'candidateClues'] as const)
      : ([
          'schemaVersion',
          'catalogVersion',
          'candidateClues',
          'excludedTopics',
        ] as const);
  const record = strictRecord(value, path, requiredKeys);
  assertLiteral(record.schemaVersion, schema, `${path}.schemaVersion`);
  assertLiteral(
    record.catalogVersion,
    CATALOG_VERSION,
    `${path}.catalogVersion`
  );
  const candidates = arrayValue(
    record.candidateClues,
    `${path}.candidateClues`,
    0,
    PROFILE_MAX_CLUES
  ).map((item, index) =>
    legacyCandidateClue(item, `${path}.candidateClues[${index}]`)
  );
  const candidateClueIds = candidates.map((candidate) => candidate.id);
  assertUniqueStrings(candidateClueIds, `${path}.candidateClues`);
  const excludedTopicIds =
    schema === 1
      ? arrayValue(
          record.excludedTopics,
          `${path}.excludedTopics`,
          0,
          PROFILE_MAX_CLUES
        ).map((item, index) =>
          legacyClueId(item, `${path}.excludedTopics[${index}]`)
        )
      : [];
  assertUniqueStrings(excludedTopicIds, `${path}.excludedTopics`);
  return {
    candidateClueIds,
    selectedClueIds: candidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => candidate.id),
    excludedTopicIds,
  };
}

function migratedProfile(values: LegacyProfileValues) {
  try {
    return createLocalPrivateProfile({
      petName: 'マイペット',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: values.candidateClueIds,
      selectedForPassportClueIds: values.selectedClueIds,
      excludedTopicIds: values.excludedTopicIds,
      languageCodes: [],
    });
  } catch (error: unknown) {
    return schemaError(
      'INVALID_VALUE',
      '$.legacyBackup.localPrivateProfile',
      String(error)
    );
  }
}

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
  const profile = migratedProfile(
    legacyProfile(record.localPrivateProfile, 0, `${path}.localPrivateProfile`)
  );

  const settingsPath = `${path}.deviceSettings`;
  const settings = strictRecord(record.deviceSettings, settingsPath, [
    'language',
    'catalogVersion',
  ]);
  assertLiteral(
    settings.catalogVersion,
    CATALOG_VERSION,
    `${settingsPath}.catalogVersion`
  );

  return parseBackup({
    backupSchemaVersion: 2,
    exportedAt: record.exportedAt,
    localPrivateProfile: profile,
    deviceSettings: {
      language: settings.language,
      reduceMotion: false,
      selectedModelDigest: null,
      catalogVersion: settings.catalogVersion,
    },
    modelVerification: record.modelVerification,
  });
}

function migrateVersionOne(value: unknown): Backup {
  const path = '$.legacyBackup';
  const record = strictRecord(value, path, [
    'backupSchemaVersion',
    'exportedAt',
    'localPrivateProfile',
    'deviceSettings',
    'modelVerification',
  ]);
  assertLiteral(record.backupSchemaVersion, 1, `${path}.backupSchemaVersion`);
  const profile = migratedProfile(
    legacyProfile(record.localPrivateProfile, 1, `${path}.localPrivateProfile`)
  );

  return parseBackup({
    backupSchemaVersion: 2,
    exportedAt: record.exportedAt,
    localPrivateProfile: profile,
    deviceSettings: record.deviceSettings,
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
  if (record.backupSchemaVersion === 1) return migrateVersionOne(value);
  if (record.backupSchemaVersion === 2) return parseBackup(value);
  return schemaError(
    'UNSUPPORTED_VERSION',
    '$.backupMigration.backupSchemaVersion',
    'Migration 元の Backup Schema Version は対応していません。'
  );
}
