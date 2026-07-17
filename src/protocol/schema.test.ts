import { describe, expect, it } from 'bun:test';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import {
  BACKUP_MAX_BYTES,
  EXTERNAL_JSON_MAX_DEPTH,
  isSchemaValidationError,
  PEER_ENVELOPE_MAX_BYTES,
  parseAgentDecision,
  parseBackup,
  parseBackupJson,
  parseBridge,
  parseLocalPrivateProfile,
  parseLounge,
  parseMatchEvidence,
  parseOwnerQuestion,
  parsePeerEnvelope,
  parsePeerEnvelopeJson,
  parsePublicPassport,
  SchemaValidationError,
} from './schema';

const CLUE = {
  value: 'open-source',
  category: 'interest',
  source: 'owner-selected',
} as const;

const PROFILE_CLUE = {
  value: 'open-source',
  category: 'interest',
  selectedForPassport: true,
} as const;

const PROFILE = {
  schemaVersion: 2,
  catalogVersion: CATALOG_VERSION,
  petName: 'こむぎ',
  petEmoji: '🐾',
  candidateClues: [PROFILE_CLUE],
  excludedTopics: [],
  languages: ['ja'],
} as const;

const PASSPORT = {
  schemaVersion: 2,
  catalogVersion: CATALOG_VERSION,
  petName: 'こむぎ',
  petEmoji: '🐾',
  clues: [CLUE],
  languages: ['ja'],
} as const;

const LOUNGE_ID: `lng_${string}` = `lng_${'11'.repeat(16)}`;
const PARTICIPANT_ID: `ptc_${string}` = `ptc_${'22'.repeat(16)}`;
const MESSAGE_NONCE: `msg_${string}` = `msg_${'33'.repeat(16)}`;

const QUESTION = {
  schemaVersion: 1,
  questionId: 'confirm-shared-clue',
  displayText: 'この手掛かりを今回の Lounge で利用してよいですか。',
} as const;

const EVIDENCE = {
  schemaVersion: 1,
  clues: [CLUE],
} as const;

const BRIDGE = {
  schemaVersion: 1,
  messageKey: 'shared-clue',
  evidence: EVIDENCE,
} as const;

const DECISION = {
  schemaVersion: 1,
  kind: 'bridge',
  bridge: BRIDGE,
} as const;

const PEER_ENVELOPE = {
  protocolVersion: { major: 1, minor: 1 },
  loungeId: LOUNGE_ID,
  senderParticipantId: PARTICIPANT_ID,
  sequence: 0,
  messageNonce: MESSAGE_NONCE,
  payload: { kind: 'public-passport', publicPassport: PASSPORT },
} as const;

const BACKUP = {
  backupSchemaVersion: 2,
  exportedAt: '2026-07-17T00:00:00.000Z',
  localPrivateProfile: PROFILE,
  deviceSettings: {
    language: 'ja',
    reduceMotion: false,
    selectedModelDigest: null,
    catalogVersion: CATALOG_VERSION,
  },
  modelVerification: null,
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

describe('Versioned Domain Schema', () => {
  it('9 種類の Schema が正常な境界値を別型として検証する', () => {
    const lounge = {
      schemaVersion: 1,
      loungeId: LOUNGE_ID,
      participantIds: [PARTICIPANT_ID],
      expiresAtEpochMs: 1_752_710_400_000,
      status: 'active',
    } as const;

    expect(parseLocalPrivateProfile(PROFILE)).toEqual(PROFILE);
    expect(parsePublicPassport(PASSPORT)).toEqual(PASSPORT);
    expect(parseLounge(lounge)).toEqual(lounge);
    expect(parseOwnerQuestion(QUESTION)).toEqual(QUESTION);
    expect(parseMatchEvidence(EVIDENCE)).toEqual(EVIDENCE);
    expect(parseBridge(BRIDGE).message).toContain('オープンソース');
    expect(parseAgentDecision(DECISION).kind).toBe('bridge');
    expect(parsePeerEnvelope(PEER_ENVELOPE)).toEqual(PEER_ENVELOPE);
    expect(parseBackup(BACKUP)).toEqual(BACKUP);
  });

  it('Local Private Profile の除外トピックをカタログ値として再構築する', () => {
    const parsed = parseLocalPrivateProfile({
      ...PROFILE,
      excludedTopics: ['accessibility'],
    });

    expect(parsed.excludedTopics).toEqual(['accessibility']);
  });

  it('各 Schema は allowlist にない field を拒否する', () => {
    const values: readonly [() => void, string][] = [
      [
        () => parseLocalPrivateProfile({ ...PROFILE, localId: 'stable' }),
        'profile',
      ],
      [
        () => parsePublicPassport({ ...PASSPORT, updatedAt: 'stable' }),
        'passport',
      ],
      [
        () =>
          parseLounge({
            schemaVersion: 1,
            loungeId: LOUNGE_ID,
            participantIds: [PARTICIPANT_ID],
            expiresAtEpochMs: 1,
            status: 'active',
            deviceId: 'stable',
          }),
        'lounge',
      ],
      [
        () => parseOwnerQuestion({ ...QUESTION, contact: 'hidden' }),
        'question',
      ],
      [() => parseMatchEvidence({ ...EVIDENCE, score: 100 }), 'evidence'],
      [() => parseBridge({ ...BRIDGE, ranking: 1 }), 'bridge'],
      [
        () => parseAgentDecision({ ...DECISION, chainOfThought: 'hidden' }),
        'decision',
      ],
      [
        () => parsePeerEnvelope({ ...PEER_ENVELOPE, rawPrompt: 'hidden' }),
        'peer',
      ],
      [
        () => parseBackup({ ...BACKUP, storagePath: '/private/data' }),
        'backup',
      ],
    ];

    for (const [parse, name] of values) {
      expect(name.length).toBeGreaterThan(0);
      expectSchemaError(parse, 'UNKNOWN_FIELD');
    }
  });

  it('JSON object ではない class instance を拒否する', () => {
    class ProfileInput {
      readonly schemaVersion = 2;
      readonly catalogVersion = CATALOG_VERSION;
      readonly petName = 'こむぎ';
      readonly petEmoji = '🐾';
      readonly candidateClues = [PROFILE_CLUE];
      readonly excludedTopics: readonly string[] = [];
      readonly languages: readonly string[] = ['ja'];
    }

    expectSchemaError(
      () => parseLocalPrivateProfile(new ProfileInput()),
      'INVALID_TYPE'
    );
  });

  it('各 Schema は必須 field の欠落を拒否する', () => {
    const values: readonly (() => void)[] = [
      () =>
        parseLocalPrivateProfile({
          schemaVersion: 2,
          catalogVersion: CATALOG_VERSION,
          candidateClues: [PROFILE_CLUE],
        }),
      () =>
        parsePublicPassport({
          schemaVersion: 2,
          catalogVersion: CATALOG_VERSION,
        }),
      () =>
        parseLounge({
          schemaVersion: 1,
          loungeId: LOUNGE_ID,
          participantIds: [PARTICIPANT_ID],
          status: 'active',
        }),
      () =>
        parseOwnerQuestion({
          schemaVersion: 1,
          questionId: 'confirm-shared-clue',
        }),
      () => parseMatchEvidence({ schemaVersion: 1 }),
      () =>
        parseBridge({
          schemaVersion: 1,
          messageKey: 'shared-clue',
        }),
      () => parseAgentDecision({ schemaVersion: 1, kind: 'bridge' }),
      () =>
        parsePeerEnvelope({
          protocolVersion: { major: 1, minor: 1 },
          loungeId: LOUNGE_ID,
          senderParticipantId: PARTICIPANT_ID,
          sequence: 0,
          messageNonce: MESSAGE_NONCE,
        }),
      () =>
        parseBackup({
          backupSchemaVersion: 2,
          exportedAt: '2026-07-17T00:00:00.000Z',
        }),
    ];

    for (const parse of values) {
      expectSchemaError(parse, 'MISSING_FIELD');
    }
  });

  it('Public Passport を 2 回受信しても横断追跡 ID を生成しない', () => {
    const first = parsePublicPassport(PASSPORT);
    const second = parsePublicPassport(PASSPORT);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.keys(first).sort()).toEqual([
      'catalogVersion',
      'clues',
      'languages',
      'petEmoji',
      'petName',
      'schemaVersion',
    ]);
    expect(JSON.stringify(first)).not.toMatch(
      /(?:^|\W)(?:id|identifier)(?:\W|$)/i
    );
  });

  it('手掛かりの重複と category の不一致を拒否する', () => {
    expectSchemaError(
      () => parsePublicPassport({ ...PASSPORT, clues: [CLUE, CLUE] }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () =>
        parsePublicPassport({
          ...PASSPORT,
          clues: [{ ...CLUE, category: 'skill' }],
        }),
      'INVALID_VALUE'
    );
  });

  it('未知の Schema Version とカタログ外の手掛かりを拒否する', () => {
    expectSchemaError(
      () => parsePublicPassport({ ...PASSPORT, schemaVersion: 3 }),
      'UNSUPPORTED_VERSION'
    );
    expectSchemaError(
      () =>
        parsePublicPassport({
          ...PASSPORT,
          clues: [{ ...CLUE, value: 'free-text-clue' }],
        }),
      'INVALID_VALUE'
    );
  });

  it('同意されていない Owner Answer と decline を Match Evidence に含めない', () => {
    expectSchemaError(
      () =>
        parseMatchEvidence({
          ...EVIDENCE,
          ownerAnswer: {
            questionId: 'confirm-shared-clue',
            answer: 'decline',
            sharingConsent: false,
          },
        }),
      'INVALID_VALUE'
    );
  });

  it('Match Evidence は 3 件まで受理し 4 件目を拒否する', () => {
    const clues = [
      CLUE,
      {
        value: 'accessibility',
        category: 'interest',
        source: 'owner-selected',
      },
      {
        value: 'information-security',
        category: 'skill',
        source: 'owner-selected',
      },
    ] as const;
    const fourthClue = {
      value: 'cloud-infrastructure',
      category: 'skill',
      source: 'owner-selected',
    } as const;

    expect(parseMatchEvidence({ ...EVIDENCE, clues }).clues).toHaveLength(3);
    expectSchemaError(
      () => parseMatchEvidence({ ...EVIDENCE, clues: [...clues, fourthClue] }),
      'LIMIT_EXCEEDED'
    );
  });

  it('Lounge は 8 人まで受理し、重複と 9 人目を拒否する', () => {
    const participantIds = Array.from(
      { length: 8 },
      (_, index) => `ptc_${index.toString(16).padStart(32, '0')}`
    );
    const input = {
      schemaVersion: 1,
      loungeId: LOUNGE_ID,
      participantIds,
      expiresAtEpochMs: 1_752_710_400_000,
      status: 'active',
    };

    expect(parseLounge(input).participantIds).toHaveLength(8);
    expectSchemaError(
      () =>
        parseLounge({
          ...input,
          participantIds: [...participantIds, PARTICIPANT_ID],
        }),
      'LIMIT_EXCEEDED'
    );
    expectSchemaError(
      () =>
        parseLounge({
          ...input,
          participantIds: [PARTICIPANT_ID, PARTICIPANT_ID],
        }),
      'INVALID_VALUE'
    );
  });

  it('Lounge ID と Participant ID の形式不正を拒否する', () => {
    const input = {
      schemaVersion: 1,
      loungeId: LOUNGE_ID,
      participantIds: [PARTICIPANT_ID],
      expiresAtEpochMs: 1_752_710_400_000,
      status: 'active',
    } as const;

    expectSchemaError(
      () => parseLounge({ ...input, loungeId: 'lng_invalid' }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () => parseLounge({ ...input, participantIds: ['ptc_invalid'] }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () => parseLounge({ ...input, schemaVersion: 2 }),
      'UNSUPPORTED_VERSION'
    );
  });

  it('Agent Decision の no-signal と理由を厳格に検証する', () => {
    expect(
      parseAgentDecision({
        schemaVersion: 1,
        kind: 'no-signal',
        reason: 'insufficient-evidence',
      })
    ).toEqual({
      schemaVersion: 1,
      kind: 'no-signal',
      reason: 'insufficient-evidence',
    });
    expectSchemaError(
      () =>
        parseAgentDecision({
          schemaVersion: 1,
          kind: 'no-signal',
          reason: 'model-said-so',
        }),
      'INVALID_VALUE'
    );
  });

  it('Backup は端末設定とモデル検証の文字列境界を検証する', () => {
    expectSchemaError(
      () =>
        parseBackup({
          ...BACKUP,
          deviceSettings: { ...BACKUP.deviceSettings, language: 'fr' },
        }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () =>
        parseBackup({
          ...BACKUP,
          modelVerification: {
            digest: 'not-a-digest',
            sizeBytes: 1,
            result: 'verified',
            appVersion: '1.0.0',
          },
        }),
      'INVALID_VALUE'
    );
  });

  it('Backup は allowlist 内のモデル検証記録を再構築する', () => {
    const digest = 'a'.repeat(64);
    const parsed = parseBackup({
      ...BACKUP,
      deviceSettings: {
        ...BACKUP.deviceSettings,
        selectedModelDigest: digest,
      },
      modelVerification: {
        digest,
        sizeBytes: 1,
        result: 'verified',
        appVersion: '1.0.0',
      },
    });

    expect(parsed.deviceSettings.selectedModelDigest).toBe(digest);
    expect(parsed.modelVerification?.digest).toBe(digest);
  });

  it('Backup の app Version は 32 文字まで受理し 33 文字目を拒否する', () => {
    const verification = {
      digest: 'a'.repeat(64),
      sizeBytes: 1,
      result: 'verified',
      appVersion: 'a'.repeat(32),
    };

    expect(
      parseBackup({ ...BACKUP, modelVerification: verification })
        .modelVerification?.appVersion
    ).toHaveLength(32);
    expectSchemaError(
      () =>
        parseBackup({
          ...BACKUP,
          modelVerification: { ...verification, appVersion: 'a'.repeat(33) },
        }),
      'LIMIT_EXCEEDED'
    );
  });

  it('Backup は不正な app Version、日時、Schema Version を拒否する', () => {
    const verification = {
      digest: 'a'.repeat(64),
      sizeBytes: 1,
      result: 'verified',
      appVersion: 'version 1',
    };
    expectSchemaError(
      () => parseBackup({ ...BACKUP, modelVerification: verification }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () => parseBackup({ ...BACKUP, exportedAt: '2026-07-17' }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () => parseBackup({ ...BACKUP, backupSchemaVersion: 3 }),
      'UNSUPPORTED_VERSION'
    );
  });

  it('Schema Validation Error の型 guard は Error だけを識別する', () => {
    const error = new SchemaValidationError(
      'INVALID_VALUE',
      '$.field',
      '不正な値です。'
    );

    expect(isSchemaValidationError(error)).toBe(true);
    expect(isSchemaValidationError(new Error('別の Error です。'))).toBe(false);
  });
});

describe('Peer Protocol Version と入力上限', () => {
  it('Version 1.1 を受理し、未知 Major と未対応 Minor を拒否する', () => {
    expect(parsePeerEnvelope(PEER_ENVELOPE).protocolVersion).toEqual({
      major: 1,
      minor: 1,
    });
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...PEER_ENVELOPE,
          protocolVersion: { major: 2, minor: 1 },
        }),
      'UNSUPPORTED_VERSION'
    );
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...PEER_ENVELOPE,
          protocolVersion: { major: 1, minor: 0 },
        }),
      'UNSUPPORTED_VERSION'
    );
  });

  it('Protocol Version の欠落と未知 field を拒否する', () => {
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...PEER_ENVELOPE,
          protocolVersion: { major: 1 },
        }),
      'MISSING_FIELD'
    );
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...PEER_ENVELOPE,
          protocolVersion: { major: 1, minor: 1, patch: 0 },
        }),
      'UNKNOWN_FIELD'
    );
  });

  it('message nonce の形式不正を拒否する', () => {
    expectSchemaError(
      () =>
        parsePeerEnvelope({ ...PEER_ENVELOPE, messageNonce: 'msg_invalid' }),
      'INVALID_VALUE'
    );
  });

  it('sequence は 0 から最大値まで受理し範囲外を拒否する', () => {
    expect(parsePeerEnvelope(PEER_ENVELOPE).sequence).toBe(0);
    expect(
      parsePeerEnvelope({ ...PEER_ENVELOPE, sequence: 2_147_483_647 }).sequence
    ).toBe(2_147_483_647);
    expectSchemaError(
      () => parsePeerEnvelope({ ...PEER_ENVELOPE, sequence: -1 }),
      'LIMIT_EXCEEDED'
    );
    expectSchemaError(
      () => parsePeerEnvelope({ ...PEER_ENVELOPE, sequence: 2_147_483_648 }),
      'LIMIT_EXCEEDED'
    );
  });

  it('Public Passport、Owner Answer、retired 以外の payload を拒否する', () => {
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...PEER_ENVELOPE,
          payload: { kind: 'raw-llm-prompt' },
        }),
      'INVALID_VALUE'
    );
    expectSchemaError(
      () =>
        parsePeerEnvelope({
          ...PEER_ENVELOPE,
          payload: {
            kind: 'owner-answer',
            questionId: 'confirm-shared-clue',
            answer: 'decline',
          },
        }),
      'INVALID_VALUE'
    );
    expect(
      parsePeerEnvelope({
        ...PEER_ENVELOPE,
        payload: {
          kind: 'owner-answer',
          questionId: 'confirm-shared-clue',
          answer: 'yes',
        },
      }).payload.kind
    ).toBe('owner-answer');
    expect(
      parsePeerEnvelope({
        ...PEER_ENVELOPE,
        payload: { kind: 'retired', outcome: 'no-signal' },
      }).payload.kind
    ).toBe('retired');
  });

  it('Message の UTF-8 byte 数が 4 KiB を超える場合は Schema 前に拒否する', () => {
    const raw = JSON.stringify({
      ...PEER_ENVELOPE,
      oversized: 'あ'.repeat(PEER_ENVELOPE_MAX_BYTES),
    });

    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(
      PEER_ENVELOPE_MAX_BYTES
    );
    expectSchemaError(() => parsePeerEnvelopeJson(raw), 'LIMIT_EXCEEDED');
  });

  it('有効な Message の byte 数が上限以下なら受理する', () => {
    const raw = JSON.stringify(PEER_ENVELOPE);

    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(
      PEER_ENVELOPE_MAX_BYTES
    );
    expect(parsePeerEnvelopeJson(raw)).toEqual(PEER_ENVELOPE);
  });

  it('外部 JSON の深度が 8 を超える場合は Schema 前に拒否する', () => {
    let nested: unknown = 'leaf';
    for (let depth = 0; depth <= EXTERNAL_JSON_MAX_DEPTH; depth += 1) {
      nested = { nested };
    }
    const raw = JSON.stringify({ ...PEER_ENVELOPE, nested });

    expectSchemaError(() => parsePeerEnvelopeJson(raw), 'LIMIT_EXCEEDED');
  });

  it('不正 JSON を拒否する', () => {
    expectSchemaError(() => parsePeerEnvelopeJson('{'), 'INVALID_JSON');
  });

  it('Backup の UTF-8 byte 数が 64 KiB を超える場合は拒否する', () => {
    const raw = JSON.stringify({
      ...BACKUP,
      oversized: 'x'.repeat(BACKUP_MAX_BYTES),
    });

    expectSchemaError(() => parseBackupJson(raw), 'LIMIT_EXCEEDED');
  });

  it('有効な Backup JSON が 64 KiB 以下なら受理する', () => {
    const raw = JSON.stringify(BACKUP);

    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(
      BACKUP_MAX_BYTES
    );
    expect(parseBackupJson(raw)).toEqual(BACKUP);
  });
});
