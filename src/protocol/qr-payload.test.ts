import { describe, expect, it } from 'bun:test';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import {
  LOUNGE_INVITE_SCHEMA_VERSION,
  type LoungeInvite,
} from '../domain/lounge-invite';
import {
  createLocalPrivateProfile,
  type PublicPassport,
  projectPublicPassport,
} from '../domain/passport';
import {
  decodeQrPayload,
  encodeQrPayload,
  QR_FAMILY_PREFIX,
  QR_PAYLOAD_MAX_BYTES,
  QR_PROTOCOL_PREFIX,
  type QrPayload,
  QrPayloadError,
} from './qr-payload';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';
const EMPTY_SEEN: ReadonlySet<string> = new Set();

function passport(): PublicPassport {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: 'オーナー',
    candidateClueIds: ['open-source', 'accessibility'],
    selectedForPassportClueIds: ['open-source', 'accessibility'],
    languageCodes: ['ja'],
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: true,
    clueIds: ['open-source', 'accessibility'],
    languageCodes: ['ja'],
    ownerConfirmed: true,
  });
}

function invite(): LoungeInvite {
  return {
    schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
    loungeId: LOUNGE_ID,
    expiresAtEpochMs: 1_000_000,
  };
}

function expectQrError(action: () => void, code: QrPayloadError['code']): void {
  try {
    action();
    throw new Error('QrPayloadError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(QrPayloadError);
    if (error instanceof QrPayloadError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('QR Payload の encode / decode', () => {
  it('Public Passport を encode して同じ内容に decode する', () => {
    const payload: QrPayload = { kind: 'public-passport', value: passport() };
    const raw = encodeQrPayload(payload);

    expect(raw.startsWith(QR_PROTOCOL_PREFIX)).toBe(true);
    expect(decodeQrPayload(raw, EMPTY_SEEN)).toEqual(payload);
  });

  it('Lounge Invite を encode して同じ内容に decode する', () => {
    const payload: QrPayload = { kind: 'lounge-invite', value: invite() };
    const raw = encodeQrPayload(payload);

    expect(decodeQrPayload(raw, EMPTY_SEEN)).toEqual(payload);
  });

  it('同じ QR を連続して読み取ると重複読取として拒否する', () => {
    const raw = encodeQrPayload({ kind: 'lounge-invite', value: invite() });

    expectQrError(() => decodeQrPayload(raw, new Set([raw])), 'DUPLICATE_SCAN');
  });

  it('Passport の QR ではない内容を非 Passport QR として拒否する', () => {
    expectQrError(
      () => decodeQrPayload('https://example.com/invite', EMPTY_SEEN),
      'NOT_PASSPORT_QR'
    );
  });

  it('QR 家系だが不正な Prefix を拒否する', () => {
    expectQrError(
      () => decodeQrPayload(`${QR_FAMILY_PREFIX}9:{}`, EMPTY_SEEN),
      'INVALID_PREFIX'
    );
  });

  it('encode 時に上限を超える Payload を拒否する', () => {
    const oversized: PublicPassport = {
      schemaVersion: 2,
      catalogVersion: CATALOG_VERSION,
      petName: 'x'.repeat(5_000),
      clues: [
        {
          value: 'open-source',
          category: 'interest',
          source: 'owner-selected',
        },
      ],
      languages: [],
    };

    expectQrError(
      () => encodeQrPayload({ kind: 'public-passport', value: oversized }),
      'OVERSIZED_PAYLOAD'
    );
  });

  it('decode 時に上限を超える Payload を拒否する', () => {
    const raw = `${QR_PROTOCOL_PREFIX}${'x'.repeat(QR_PAYLOAD_MAX_BYTES)}`;

    expectQrError(() => decodeQrPayload(raw, EMPTY_SEEN), 'OVERSIZED_PAYLOAD');
  });

  it('Prefix の後ろが不正な JSON なら拒否する', () => {
    expectQrError(
      () => decodeQrPayload(`${QR_PROTOCOL_PREFIX}{not-json`, EMPTY_SEEN),
      'INVALID_JSON'
    );
  });

  it('未知の kind を持つ envelope を拒否する', () => {
    const raw = `${QR_PROTOCOL_PREFIX}${JSON.stringify({
      qrProtocolVersion: { major: 1, minor: 1 },
      kind: 'something-else',
      value: {},
    })}`;

    expectQrError(() => decodeQrPayload(raw, EMPTY_SEEN), 'INVALID_JSON');
  });

  it('envelope に未知の field があれば拒否する', () => {
    const raw = `${QR_PROTOCOL_PREFIX}${JSON.stringify({
      qrProtocolVersion: { major: 1, minor: 1 },
      kind: 'lounge-invite',
      value: invite(),
      extra: 'x',
    })}`;

    expectQrError(() => decodeQrPayload(raw, EMPTY_SEEN), 'INVALID_JSON');
  });

  it('未対応の qrProtocolVersion を未知 Version として拒否する', () => {
    const raw = `${QR_PROTOCOL_PREFIX}${JSON.stringify({
      qrProtocolVersion: { major: 2, minor: 0 },
      kind: 'lounge-invite',
      value: invite(),
    })}`;

    expectQrError(() => decodeQrPayload(raw, EMPTY_SEEN), 'UNKNOWN_VERSION');
  });

  it('内側の Schema Version が未対応でも未知 Version として拒否する', () => {
    const raw = `${QR_PROTOCOL_PREFIX}${JSON.stringify({
      qrProtocolVersion: { major: 1, minor: 1 },
      kind: 'lounge-invite',
      value: { ...invite(), schemaVersion: 99 },
    })}`;

    expectQrError(() => decodeQrPayload(raw, EMPTY_SEEN), 'UNKNOWN_VERSION');
  });

  it('内側の値が構造的に不正なら JSON エラーとして拒否する', () => {
    const raw = `${QR_PROTOCOL_PREFIX}${JSON.stringify({
      qrProtocolVersion: { major: 1, minor: 1 },
      kind: 'public-passport',
      value: { schemaVersion: 2 },
    })}`;

    expectQrError(() => decodeQrPayload(raw, EMPTY_SEEN), 'INVALID_JSON');
  });
});

describe('QR の Privacy 契約', () => {
  const forbiddenTokens = [
    'deviceId',
    'localProfileId',
    'latitude',
    'longitude',
    'phone',
    'email',
    'address',
    'contact',
  ];

  it('Public Passport の QR に安定 ID、Device ID、位置情報、連絡先を含まない', () => {
    const raw = encodeQrPayload({ kind: 'public-passport', value: passport() });

    for (const token of forbiddenTokens) {
      expect(raw.toLowerCase()).not.toContain(token.toLowerCase());
    }
    const decoded = JSON.parse(raw.slice(QR_PROTOCOL_PREFIX.length));
    expect(Object.keys(decoded.value).sort()).toEqual(
      [
        'catalogVersion',
        'clues',
        'languages',
        'ownerAlias',
        'petEmoji',
        'petName',
        'schemaVersion',
      ].sort()
    );
  });

  it('Lounge Invite の QR に安定 ID、Device ID、位置情報、連絡先を含まない', () => {
    const raw = encodeQrPayload({ kind: 'lounge-invite', value: invite() });

    for (const token of forbiddenTokens) {
      expect(raw.toLowerCase()).not.toContain(token.toLowerCase());
    }
    const decoded = JSON.parse(raw.slice(QR_PROTOCOL_PREFIX.length));
    expect(Object.keys(decoded.value).sort()).toEqual(
      ['expiresAtEpochMs', 'loungeId', 'schemaVersion'].sort()
    );
  });
});
