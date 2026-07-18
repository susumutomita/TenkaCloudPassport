import type { AgentDecision } from '../domain/agent-decision';
import type {
  Backup,
  DeviceSettings,
  ModelVerification,
} from '../domain/backup';
import {
  type Bridge,
  createBridgeFromEvidence,
  createComplementBridge,
} from '../domain/bridge';
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
  type CapabilityToken,
  type EvidenceId,
  isCapabilityToken,
  type MessageId,
  PEER_BRIDGE_MAX_EVIDENCE_IDS,
  PEER_CAPABILITY_MAX_REQUIRED,
  PEER_CAPABILITY_MAX_SUPPORTED,
  PEER_MAX_SEQUENCE,
  PEER_MEMBERSHIP_MAX_PARTICIPANTS,
  PEER_MESSAGE_MAX_TTL_MS,
  type PeerEnvelope,
  type PeerFieldReference,
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
export const MAX_SEQUENCE = PEER_MAX_SEQUENCE;
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
  const messageKey = assertOneOf(
    record.messageKey,
    ['shared-clue', 'offer-need-complement'],
    `${path}.messageKey`
  );
  const evidence = parseMatchEvidence(record.evidence);
  if (messageKey === 'offer-need-complement') {
    const [offerClue, seekClue] = evidence.clues;
    if (!offerClue || !seekClue || evidence.clues.length !== 2) {
      return schemaError(
        'INVALID_VALUE',
        `${path}.evidence.clues`,
        'offer-need-complement の Bridge には手掛かりが 2 件必要です。'
      );
    }
    // `messageKey` と手掛かりの件数だけを見ると、無関係な 2 件の手掛かり
    // （例: 両方とも topics）を「相互補完した」と偽って主張できてしまう。
    // `bridge-selection.ts` の `firstOfferNeedMatch` と同じ意味論
    // （1 件目は offers、2 件目は lookingFor、同じ category）を強制する。
    const offerDefinition = clueById(offerClue.value);
    const seekDefinition = clueById(seekClue.value);
    if (
      offerDefinition.passportField !== 'offers' ||
      seekDefinition.passportField !== 'lookingFor' ||
      offerDefinition.category !== seekDefinition.category
    ) {
      return schemaError(
        'INVALID_VALUE',
        `${path}.evidence.clues`,
        'offer-need-complement は 1 件目が offers、2 件目が lookingFor で同じ category の手掛かりである必要があります。'
      );
    }
    return createComplementBridge(offerClue, seekClue);
  }
  return createBridgeFromEvidence(evidence);
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
  return { major: 1, minor: 2 };
}

function prefixed128BitId<Prefix extends 'mid' | 'rnd' | 'evi'>(
  value: unknown,
  path: string,
  prefix: Prefix
): `${Prefix}_${string}` {
  const candidate = stringValue(value, path, 36);
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は有効な ${prefix} ID ではありません。`
    );
  }
  return candidate as `${Prefix}_${string}`;
}

function messageId(value: unknown, path: string): MessageId {
  return prefixed128BitId(value, path, 'mid');
}

function evidenceId(value: unknown, path: string): EvidenceId {
  return prefixed128BitId(value, path, 'evi');
}

function capabilityToken(value: unknown, path: string): CapabilityToken {
  const candidate = stringValue(value, path);
  if (!isCapabilityToken(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は有効な Capability token ではありません。`
    );
  }
  return candidate;
}

function capabilityTokens(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number
): CapabilityToken[] {
  const tokens = arrayValue(value, path, minimumLength, maximumLength).map(
    (item, index) => capabilityToken(item, `${path}[${index}]`)
  );
  assertUniqueStrings(tokens, path);
  return tokens;
}

function participantIds(
  value: unknown,
  path: string,
  minimumLength: number
): ParticipantId[] {
  const ids = arrayValue(
    value,
    path,
    minimumLength,
    PEER_MEMBERSHIP_MAX_PARTICIPANTS
  ).map((item, index) => participantId(item, `${path}[${index}]`));
  assertUniqueStrings(ids, path);
  return ids;
}

function peerFieldReference(value: unknown, path: string): PeerFieldReference {
  const discriminator = strictRecord(
    value,
    path,
    ['kind'],
    ['clueId', 'language']
  );
  const kind = stringValue(discriminator.kind, `${path}.kind`);
  if (kind === 'clue') {
    const record = strictRecord(value, path, ['kind', 'clueId']);
    return {
      kind,
      clueId: clueId(record.clueId, `${path}.clueId`),
    };
  }
  if (kind === 'language') {
    const record = strictRecord(value, path, ['kind', 'language']);
    return {
      kind,
      language: languageCode(record.language, `${path}.language`),
    };
  }
  return schemaError(
    'INVALID_VALUE',
    `${path}.kind`,
    'Peer field reference の kind は対応していません。'
  );
}

function peerPayload(value: unknown): PeerPayload {
  const path = '$.peerEnvelope.payload';
  const discriminatorRecord = strictRecord(
    value,
    path,
    ['kind'],
    [
      'role',
      'supported',
      'required',
      'roundId',
      'publicPassport',
      'evidenceId',
      'fieldReference',
      'signalType',
      'participantIds',
      'evidenceIds',
      'revision',
      'reason',
      'code',
      'phase',
    ]
  );
  const kind = stringValue(discriminatorRecord.kind, `${path}.kind`);
  if (kind === 'hello') {
    const record = strictRecord(value, path, ['kind', 'role']);
    return {
      kind,
      role: assertOneOf(record.role, ['host', 'guest'], `${path}.role`),
    };
  }
  if (kind === 'capability') {
    const record = strictRecord(value, path, ['kind', 'supported', 'required']);
    const supported = capabilityTokens(
      record.supported,
      `${path}.supported`,
      1,
      PEER_CAPABILITY_MAX_SUPPORTED
    );
    const required = capabilityTokens(
      record.required,
      `${path}.required`,
      1,
      PEER_CAPABILITY_MAX_REQUIRED
    );
    if (required.some((token) => !supported.includes(token))) {
      return schemaError(
        'INVALID_VALUE',
        `${path}.required`,
        'Required Capability は Supported の部分集合である必要があります。'
      );
    }
    return { kind, supported, required };
  }
  if (kind === 'ready') {
    const record = strictRecord(value, path, ['kind', 'roundId']);
    return {
      kind,
      roundId: prefixed128BitId(record.roundId, `${path}.roundId`, 'rnd'),
    };
  }
  if (kind === 'public-passport') {
    const record = strictRecord(value, path, ['kind', 'publicPassport']);
    return {
      kind,
      publicPassport: parsePublicPassport(record.publicPassport),
    };
  }
  if (kind === 'pet-signal') {
    const record = strictRecord(value, path, [
      'kind',
      'evidenceId',
      'fieldReference',
      'signalType',
    ]);
    const fieldReference = peerFieldReference(
      record.fieldReference,
      `${path}.fieldReference`
    );
    const signalType = assertOneOf(
      record.signalType,
      [
        'shared-topic',
        'offer-need-complement',
        'shared-language',
        'owner-confirmed',
      ],
      `${path}.signalType`
    );
    if (
      (fieldReference.kind === 'language') !==
      (signalType === 'shared-language')
    ) {
      return schemaError(
        'INVALID_VALUE',
        `${path}.signalType`,
        'Language 参照は shared-language、Clue 参照はそれ以外の Signal Type が必要です。'
      );
    }
    return {
      kind,
      evidenceId: evidenceId(record.evidenceId, `${path}.evidenceId`),
      fieldReference,
      signalType,
    };
  }
  if (kind === 'bridge-proposal') {
    const record = strictRecord(value, path, [
      'kind',
      'participantIds',
      'evidenceIds',
    ]);
    const evidenceIds = arrayValue(
      record.evidenceIds,
      `${path}.evidenceIds`,
      1,
      PEER_BRIDGE_MAX_EVIDENCE_IDS
    ).map((item, index) => evidenceId(item, `${path}.evidenceIds[${index}]`));
    assertUniqueStrings(evidenceIds, `${path}.evidenceIds`);
    return {
      kind,
      participantIds: participantIds(
        record.participantIds,
        `${path}.participantIds`,
        2
      ),
      evidenceIds,
    };
  }
  if (kind === 'membership') {
    const record = strictRecord(value, path, [
      'kind',
      'revision',
      'participantIds',
    ]);
    return {
      kind,
      revision: integerValue(
        record.revision,
        `${path}.revision`,
        0,
        MAX_SEQUENCE
      ),
      participantIds: participantIds(
        record.participantIds,
        `${path}.participantIds`,
        2
      ),
    };
  }
  if (kind === 'leave') {
    const record = strictRecord(value, path, ['kind', 'reason']);
    return {
      kind,
      reason: assertOneOf(
        record.reason,
        ['owner-left', 'network-lost', 'host-ended'],
        `${path}.reason`
      ),
    };
  }
  if (kind === 'expire') {
    const record = strictRecord(value, path, ['kind', 'reason']);
    return {
      kind,
      reason: assertLiteral(record.reason, 'lounge-expired', `${path}.reason`),
    };
  }
  if (kind === 'error') {
    const record = strictRecord(value, path, ['kind', 'code', 'phase']);
    return {
      kind,
      code: assertOneOf(
        record.code,
        [
          'invalid-message',
          'unsupported-capability',
          'rate-limited',
          'resync-required',
        ],
        `${path}.code`
      ),
      phase: assertOneOf(
        record.phase,
        ['handshake', 'protocol', 'lounge'],
        `${path}.phase`
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
    'messageId',
    'sequence',
    'sentAtEpochMs',
    'expiresAtEpochMs',
    'payload',
  ]);
  const sentAtEpochMs = integerValue(
    record.sentAtEpochMs,
    `${path}.sentAtEpochMs`,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const expiresAtEpochMs = integerValue(
    record.expiresAtEpochMs,
    `${path}.expiresAtEpochMs`,
    0,
    Number.MAX_SAFE_INTEGER
  );
  if (expiresAtEpochMs <= sentAtEpochMs) {
    return schemaError(
      'INVALID_VALUE',
      `${path}.expiresAtEpochMs`,
      'Peer Message の期限は送信時刻より後である必要があります。'
    );
  }
  if (expiresAtEpochMs - sentAtEpochMs > PEER_MESSAGE_MAX_TTL_MS) {
    return schemaError(
      'LIMIT_EXCEEDED',
      `${path}.expiresAtEpochMs`,
      `Peer Message の TTL は ${PEER_MESSAGE_MAX_TTL_MS} ms 以下にしてください。`
    );
  }
  return {
    protocolVersion: protocolVersion(record.protocolVersion),
    loungeId: loungeId(record.loungeId, `${path}.loungeId`),
    senderParticipantId: participantId(
      record.senderParticipantId,
      `${path}.senderParticipantId`
    ),
    messageId: messageId(record.messageId, `${path}.messageId`),
    sequence: integerValue(
      record.sequence,
      `${path}.sequence`,
      0,
      MAX_SEQUENCE
    ),
    sentAtEpochMs,
    expiresAtEpochMs,
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
