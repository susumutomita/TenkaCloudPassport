import type { AgentDecision } from '../domain/agent-decision';
import type {
  Backup,
  DeviceSettings,
  ModelVerification,
} from '../domain/backup';
import { type Bridge, createBridgeFromEvidence } from '../domain/bridge';
import {
  CATALOG_VERSION,
  type ClueId,
  clueById,
  isClueId,
  isLanguageCode,
  type LanguageCode,
} from '../domain/clue-catalog';
import type { Lounge } from '../domain/lounge-session';
import type {
  MatchEvidence,
  SharedOwnerAnswer,
} from '../domain/match-evidence';
import {
  OWNER_QUESTION_CATALOG,
  type OwnerQuestion,
} from '../domain/owner-question';
import {
  type ConfirmedClue,
  createLocalPrivateProfile,
  isPetEmoji,
  type LocalPrivateProfile,
  OWNER_ALIAS_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  type PetEmoji,
  PROFILE_MAX_CLUES,
  PROFILE_MAX_LANGUAGES,
  type ProfileClue,
  PUBLIC_PASSPORT_MAX_CLUES,
  PUBLIC_PASSPORT_MAX_LANGUAGES,
  type PublicPassport,
} from '../domain/passport';
import {
  isLoungeId,
  isParticipantId,
  type LoungeId,
  type ParticipantId,
} from '../domain/session-identifiers';
import {
  type MessageNonce,
  type PeerEnvelope,
  type PeerPayload,
  PROTOCOL_VERSION,
  type ProtocolVersion,
} from './peer-envelope';
import {
  arrayValue,
  assertLiteral,
  assertOneOf,
  assertUniqueStrings,
  booleanValue,
  integerValue,
  parseBoundedJson,
  SchemaValidationError,
  schemaError,
  strictRecord,
  stringValue,
} from './validation';

export { SchemaValidationError } from './validation';

export {
  OWNER_ALIAS_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PROFILE_MAX_CLUES,
  PROFILE_MAX_LANGUAGES,
  PUBLIC_PASSPORT_MAX_CLUES,
  PUBLIC_PASSPORT_MAX_LANGUAGES,
};
export const LOUNGE_MAX_PARTICIPANTS = 8;
export const MATCH_EVIDENCE_MAX_CLUES = 3;
export const PEER_ENVELOPE_MAX_BYTES = 4 * 1024;
export const BACKUP_MAX_BYTES = 64 * 1024;
export const LOCAL_PROFILE_MAX_BYTES = 8 * 1024;
export const EXTERNAL_JSON_MAX_DEPTH = 8;
export const MAX_SEQUENCE = 2_147_483_647;
export const MAX_MODEL_BYTES = 8 * 1024 * 1024 * 1024;

function schemaVersion(
  record: { readonly schemaVersion: unknown },
  path: string
): 1 {
  if (record.schemaVersion !== 1) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      `${path}.schemaVersion`,
      `${path} の Schema Version は対応していません。`
    );
  }
  return 1;
}

function passportSchemaVersion(
  record: { readonly schemaVersion: unknown },
  path: string
): 2 {
  if (record.schemaVersion !== 2) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      `${path}.schemaVersion`,
      `${path} の Schema Version は対応していません。`
    );
  }
  return 2;
}

function catalogVersion(value: unknown, path: string): typeof CATALOG_VERSION {
  return assertLiteral(value, CATALOG_VERSION, path);
}

function clueId(value: unknown, path: string): ClueId {
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

function profileClue(value: unknown, path: string): ProfileClue {
  const record = strictRecord(value, path, [
    'value',
    'category',
    'selectedForPassport',
  ]);
  const id = clueId(record.value, `${path}.value`);
  const expectedCategory = clueById(id).category;
  const category = assertLiteral(
    record.category,
    expectedCategory,
    `${path}.category`
  );
  return {
    value: id,
    category,
    selectedForPassport: booleanValue(
      record.selectedForPassport,
      `${path}.selectedForPassport`
    ),
  };
}

function confirmedClue(value: unknown, path: string): ConfirmedClue {
  const record = strictRecord(value, path, ['value', 'category', 'source']);
  const id = clueId(record.value, `${path}.value`);
  const expectedCategory = clueById(id).category;
  return {
    value: id,
    category: assertLiteral(
      record.category,
      expectedCategory,
      `${path}.category`
    ),
    source: assertLiteral(record.source, 'owner-selected', `${path}.source`),
  };
}

function displayLabel(
  value: unknown,
  path: string,
  maximumLength: number
): string {
  const candidate = stringValue(value, path, maximumLength);
  if (candidate.trim() !== candidate) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} の前後に空白は指定できません。`
    );
  }
  return candidate;
}

function petEmoji(value: unknown, path: string): PetEmoji {
  const candidate = stringValue(value, path, 2);
  if (!isPetEmoji(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は同梱された Pet Emoji ではありません。`
    );
  }
  return candidate;
}

function languageCode(value: unknown, path: string): LanguageCode {
  const candidate = stringValue(value, path, 8);
  if (!isLanguageCode(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は版管理済み Language カタログにありません。`
    );
  }
  return candidate;
}

function languageCodes(
  value: unknown,
  path: string,
  maximumLength: number
): LanguageCode[] {
  const languages = arrayValue(value, path, 0, maximumLength).map(
    (item, index) => languageCode(item, `${path}[${index}]`)
  );
  assertUniqueStrings(languages, path);
  return languages;
}

export function parseLocalPrivateProfile(value: unknown): LocalPrivateProfile {
  const path = '$.localPrivateProfile';
  const record = strictRecord(
    value,
    path,
    [
      'schemaVersion',
      'catalogVersion',
      'petName',
      'petEmoji',
      'candidateClues',
      'excludedTopics',
      'languages',
    ],
    ['ownerAlias']
  );
  passportSchemaVersion(record, path);
  const petName = displayLabel(
    record.petName,
    `${path}.petName`,
    PET_NAME_MAX_LENGTH
  );
  const parsedPetEmoji = petEmoji(record.petEmoji, `${path}.petEmoji`);
  const ownerAlias = Object.hasOwn(record, 'ownerAlias')
    ? displayLabel(
        record.ownerAlias,
        `${path}.ownerAlias`,
        OWNER_ALIAS_MAX_LENGTH
      )
    : '';
  const candidates = arrayValue(
    record.candidateClues,
    `${path}.candidateClues`,
    1,
    PROFILE_MAX_CLUES
  ).map((item, index) => profileClue(item, `${path}.candidateClues[${index}]`));
  const excludedTopics = arrayValue(
    record.excludedTopics,
    `${path}.excludedTopics`,
    0,
    PROFILE_MAX_CLUES
  ).map((item, index) => clueId(item, `${path}.excludedTopics[${index}]`));
  assertUniqueStrings(
    candidates.map((candidate) => candidate.value),
    `${path}.candidateClues`
  );
  assertUniqueStrings(excludedTopics, `${path}.excludedTopics`);
  catalogVersion(record.catalogVersion, `${path}.catalogVersion`);
  try {
    return createLocalPrivateProfile({
      petName,
      petEmoji: parsedPetEmoji,
      ownerAlias,
      candidateClueIds: candidates.map((candidate) => candidate.value),
      selectedForPassportClueIds: candidates
        .filter((candidate) => candidate.selectedForPassport)
        .map((candidate) => candidate.value),
      excludedTopicIds: excludedTopics,
      languageCodes: languageCodes(
        record.languages,
        `${path}.languages`,
        PROFILE_MAX_LANGUAGES
      ),
    });
  } catch (error: unknown) {
    return schemaError('INVALID_VALUE', path, String(error));
  }
}

export function parsePublicPassport(value: unknown): PublicPassport {
  const path = '$.publicPassport';
  const record = strictRecord(
    value,
    path,
    ['schemaVersion', 'catalogVersion', 'petName', 'clues', 'languages'],
    ['petEmoji', 'ownerAlias']
  );
  const clues = arrayValue(
    record.clues,
    `${path}.clues`,
    1,
    PUBLIC_PASSPORT_MAX_CLUES
  ).map((item, index) => confirmedClue(item, `${path}.clues[${index}]`));
  assertUniqueStrings(
    clues.map((clue) => clue.value),
    `${path}.clues`
  );
  const parsedPetEmoji = Object.hasOwn(record, 'petEmoji')
    ? petEmoji(record.petEmoji, `${path}.petEmoji`)
    : undefined;
  const ownerAlias = Object.hasOwn(record, 'ownerAlias')
    ? displayLabel(
        record.ownerAlias,
        `${path}.ownerAlias`,
        OWNER_ALIAS_MAX_LENGTH
      )
    : undefined;
  return {
    schemaVersion: passportSchemaVersion(record, path),
    catalogVersion: catalogVersion(
      record.catalogVersion,
      `${path}.catalogVersion`
    ),
    petName: displayLabel(
      record.petName,
      `${path}.petName`,
      PET_NAME_MAX_LENGTH
    ),
    ...(parsedPetEmoji ? { petEmoji: parsedPetEmoji } : {}),
    ...(ownerAlias ? { ownerAlias } : {}),
    clues,
    languages: languageCodes(
      record.languages,
      `${path}.languages`,
      PUBLIC_PASSPORT_MAX_LANGUAGES
    ),
  };
}

export function loungeId(value: unknown, path: string): LoungeId {
  const candidate = stringValue(value, path, 36);
  if (!isLoungeId(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は有効な Lounge ID ではありません。`
    );
  }
  return candidate;
}

function participantId(value: unknown, path: string): ParticipantId {
  const candidate = stringValue(value, path, 36);
  if (!isParticipantId(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は有効な Participant ID ではありません。`
    );
  }
  return candidate;
}

export function parseLounge(value: unknown): Lounge {
  const path = '$.lounge';
  const record = strictRecord(value, path, [
    'schemaVersion',
    'loungeId',
    'participantIds',
    'expiresAtEpochMs',
    'status',
  ]);
  const participantIds = arrayValue(
    record.participantIds,
    `${path}.participantIds`,
    1,
    LOUNGE_MAX_PARTICIPANTS
  ).map((item, index) =>
    participantId(item, `${path}.participantIds[${index}]`)
  );
  assertUniqueStrings(participantIds, `${path}.participantIds`);
  return {
    schemaVersion: schemaVersion(record, path),
    loungeId: loungeId(record.loungeId, `${path}.loungeId`),
    participantIds,
    expiresAtEpochMs: integerValue(
      record.expiresAtEpochMs,
      `${path}.expiresAtEpochMs`,
      0,
      Number.MAX_SAFE_INTEGER
    ),
    status: assertOneOf(record.status, ['active', 'retired'], `${path}.status`),
  };
}

export function parseOwnerQuestion(value: unknown): OwnerQuestion {
  const path = '$.ownerQuestion';
  const record = strictRecord(value, path, [
    'schemaVersion',
    'questionId',
    'displayText',
    'purpose',
  ]);
  const questionId = assertLiteral(
    record.questionId,
    'confirm-shared-clue',
    `${path}.questionId`
  );
  return {
    schemaVersion: schemaVersion(record, path),
    questionId,
    displayText: assertLiteral(
      record.displayText,
      OWNER_QUESTION_CATALOG[questionId],
      `${path}.displayText`
    ),
    purpose: assertOneOf(
      record.purpose,
      ['canOffer', 'lookingFor', 'currentGoal'],
      `${path}.purpose`
    ),
  };
}

function sharedOwnerAnswer(value: unknown, path: string): SharedOwnerAnswer {
  const record = strictRecord(value, path, [
    'questionId',
    'answer',
    'sharingConsent',
  ]);
  return {
    questionId: assertLiteral(
      record.questionId,
      'confirm-shared-clue',
      `${path}.questionId`
    ),
    answer: assertOneOf(record.answer, ['yes', 'no'], `${path}.answer`),
    sharingConsent: assertLiteral(
      record.sharingConsent,
      true,
      `${path}.sharingConsent`
    ),
  };
}

export function parseMatchEvidence(value: unknown): MatchEvidence {
  const path = '$.matchEvidence';
  const record = strictRecord(
    value,
    path,
    ['schemaVersion', 'clues'],
    ['ownerAnswer']
  );
  const clues = arrayValue(
    record.clues,
    `${path}.clues`,
    1,
    MATCH_EVIDENCE_MAX_CLUES
  ).map((item, index) => confirmedClue(item, `${path}.clues[${index}]`));
  assertUniqueStrings(
    clues.map((clue) => clue.value),
    `${path}.clues`
  );
  const ownerAnswer = Object.hasOwn(record, 'ownerAnswer')
    ? sharedOwnerAnswer(record.ownerAnswer, `${path}.ownerAnswer`)
    : undefined;
  return {
    schemaVersion: schemaVersion(record, path),
    clues,
    ...(ownerAnswer ? { ownerAnswer } : {}),
  };
}

export function parseBridge(value: unknown): Bridge {
  const path = '$.bridge';
  const record = strictRecord(value, path, [
    'schemaVersion',
    'messageKey',
    'evidence',
  ]);
  schemaVersion(record, path);
  assertLiteral(record.messageKey, 'shared-clue', `${path}.messageKey`);
  return createBridgeFromEvidence(parseMatchEvidence(record.evidence));
}

export function parseAgentDecision(value: unknown): AgentDecision {
  const path = '$.agentDecision';
  const discriminatorRecord = strictRecord(
    value,
    path,
    ['schemaVersion', 'kind'],
    ['bridge', 'reason']
  );
  schemaVersion(discriminatorRecord, path);
  const kind = assertOneOf(
    discriminatorRecord.kind,
    ['bridge', 'no-signal'],
    `${path}.kind`
  );
  if (kind === 'bridge') {
    const record = strictRecord(value, path, [
      'schemaVersion',
      'kind',
      'bridge',
    ]);
    return {
      schemaVersion: 1,
      kind,
      bridge: parseBridge(record.bridge),
    };
  }
  const record = strictRecord(value, path, ['schemaVersion', 'kind', 'reason']);
  return {
    schemaVersion: 1,
    kind,
    reason: assertLiteral(
      record.reason,
      'insufficient-evidence',
      `${path}.reason`
    ),
  };
}

function protocolVersion(value: unknown): ProtocolVersion {
  const path = '$.peerEnvelope.protocolVersion';
  const record = strictRecord(value, path, ['major', 'minor']);
  if (
    record.major !== PROTOCOL_VERSION.major ||
    record.minor !== PROTOCOL_VERSION.minor
  ) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      path,
      'Peer Protocol Version は対応していません。'
    );
  }
  return { major: 1, minor: 1 };
}

function messageNonce(value: unknown, path: string): MessageNonce {
  const candidate = stringValue(value, path, 36);
  if (!/^msg_[0-9a-f]{32}$/.test(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は有効な message nonce ではありません。`
    );
  }
  return candidate as MessageNonce;
}

function peerPayload(value: unknown): PeerPayload {
  const path = '$.peerEnvelope.payload';
  const discriminatorRecord = strictRecord(
    value,
    path,
    ['kind'],
    ['publicPassport', 'questionId', 'answer', 'outcome']
  );
  const kind = stringValue(discriminatorRecord.kind, `${path}.kind`);
  if (kind === 'public-passport') {
    const record = strictRecord(value, path, ['kind', 'publicPassport']);
    return {
      kind,
      publicPassport: parsePublicPassport(record.publicPassport),
    };
  }
  if (kind === 'owner-answer') {
    const record = strictRecord(value, path, ['kind', 'questionId', 'answer']);
    return {
      kind,
      questionId: assertLiteral(
        record.questionId,
        'confirm-shared-clue',
        `${path}.questionId`
      ),
      answer: assertOneOf(record.answer, ['yes', 'no'], `${path}.answer`),
    };
  }
  if (kind === 'retired') {
    const record = strictRecord(value, path, ['kind', 'outcome']);
    return {
      kind,
      outcome: assertOneOf(
        record.outcome,
        ['bridge', 'no-signal'],
        `${path}.outcome`
      ),
    };
  }
  return schemaError(
    'INVALID_VALUE',
    `${path}.kind`,
    'Peer payload の kind は対応していません。'
  );
}

export function parsePeerEnvelope(value: unknown): PeerEnvelope {
  const path = '$.peerEnvelope';
  const record = strictRecord(value, path, [
    'protocolVersion',
    'loungeId',
    'senderParticipantId',
    'sequence',
    'messageNonce',
    'payload',
  ]);
  return {
    protocolVersion: protocolVersion(record.protocolVersion),
    loungeId: loungeId(record.loungeId, `${path}.loungeId`),
    senderParticipantId: participantId(
      record.senderParticipantId,
      `${path}.senderParticipantId`
    ),
    sequence: integerValue(
      record.sequence,
      `${path}.sequence`,
      0,
      MAX_SEQUENCE
    ),
    messageNonce: messageNonce(record.messageNonce, `${path}.messageNonce`),
    payload: peerPayload(record.payload),
  };
}

function digest(value: unknown, path: string): string {
  const candidate = stringValue(value, path, 64);
  if (!/^[0-9a-f]{64}$/.test(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は小文字 16 進 256 bit digest ではありません。`
    );
  }
  return candidate;
}

function deviceSettings(value: unknown): DeviceSettings {
  const path = '$.backup.deviceSettings';
  const record = strictRecord(value, path, [
    'language',
    'reduceMotion',
    'selectedModelDigest',
    'catalogVersion',
  ]);
  const selectedModelDigest =
    record.selectedModelDigest === null
      ? null
      : digest(record.selectedModelDigest, `${path}.selectedModelDigest`);
  return {
    language: assertOneOf(record.language, ['ja', 'en'], `${path}.language`),
    reduceMotion: booleanValue(record.reduceMotion, `${path}.reduceMotion`),
    selectedModelDigest,
    catalogVersion: catalogVersion(
      record.catalogVersion,
      `${path}.catalogVersion`
    ),
  };
}

function modelVerification(value: unknown): ModelVerification | null {
  if (value === null) return null;
  const path = '$.backup.modelVerification';
  const record = strictRecord(value, path, [
    'digest',
    'sizeBytes',
    'result',
    'appVersion',
  ]);
  const appVersion = stringValue(record.appVersion, `${path}.appVersion`, 32);
  if (!/^[0-9A-Za-z.+-]+$/.test(appVersion)) {
    return schemaError(
      'INVALID_VALUE',
      `${path}.appVersion`,
      'appVersion の形式が不正です。'
    );
  }
  return {
    digest: digest(record.digest, `${path}.digest`),
    sizeBytes: integerValue(
      record.sizeBytes,
      `${path}.sizeBytes`,
      1,
      MAX_MODEL_BYTES
    ),
    result: assertOneOf(
      record.result,
      ['verified', 'rejected'],
      `${path}.result`
    ),
    appVersion,
  };
}

function exportedAt(value: unknown, path: string): string {
  const candidate = stringValue(value, path, 32);
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== candidate) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は UTC ISO 8601 形式ではありません。`
    );
  }
  return candidate;
}

export function parseBackup(value: unknown): Backup {
  const path = '$.backup';
  const record = strictRecord(value, path, [
    'backupSchemaVersion',
    'exportedAt',
    'localPrivateProfile',
    'deviceSettings',
    'modelVerification',
  ]);
  if (record.backupSchemaVersion !== 2) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      `${path}.backupSchemaVersion`,
      'Backup Schema Version は対応していません。'
    );
  }
  return {
    backupSchemaVersion: 2,
    exportedAt: exportedAt(record.exportedAt, `${path}.exportedAt`),
    localPrivateProfile: parseLocalPrivateProfile(record.localPrivateProfile),
    deviceSettings: deviceSettings(record.deviceSettings),
    modelVerification: modelVerification(record.modelVerification),
  };
}

export function parsePeerEnvelopeJson(raw: string): PeerEnvelope {
  return parsePeerEnvelope(
    parseBoundedJson(raw, PEER_ENVELOPE_MAX_BYTES, EXTERNAL_JSON_MAX_DEPTH)
  );
}

export function parseBackupJson(raw: string): Backup {
  return parseBackup(
    parseBoundedJson(raw, BACKUP_MAX_BYTES, EXTERNAL_JSON_MAX_DEPTH)
  );
}

export function parseLocalPrivateProfileJson(raw: string): LocalPrivateProfile {
  return parseLocalPrivateProfile(
    parseBoundedJson(raw, LOCAL_PROFILE_MAX_BYTES, EXTERNAL_JSON_MAX_DEPTH)
  );
}

export function isSchemaValidationError(
  error: unknown
): error is SchemaValidationError {
  return error instanceof SchemaValidationError;
}
