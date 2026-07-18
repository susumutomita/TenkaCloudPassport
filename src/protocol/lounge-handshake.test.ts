import { describe, expect, it } from 'bun:test';
import type { LoungeInvite } from '../domain/lounge-invite';
import type { RandomBytes } from '../domain/session-identifiers';
import {
  createLoungeJoinRequest,
  encodeLoungeJoinRequest,
  issueLoungeHandshake,
  LoungeHandshakeError,
  type LoungeHandshakeErrorCode,
  parseLoungeJoinRequestJson,
} from './lounge-handshake';
import { SchemaValidationError } from './validation';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';
const PARTICIPANT_ID = 'ptc_00000000000000000000000000000002';
const ISSUED_AT = 1_700_000_000_000;
const STARTED_AT_MONOTONIC = 10_000;
const EXPIRES_AT = ISSUED_AT + 20 * 60 * 1_000;
const TRANSPORT_FINGERPRINT: `sha256_${string}` = `sha256_${'aa'.repeat(32)}`;

function sequentialRandomBytes(): RandomBytes {
  let value = 1;
  return (length) => {
    const bytes = new Uint8Array(length).fill(value);
    value += 1;
    return bytes;
  };
}

function issueInput(randomBytes = sequentialRandomBytes()) {
  return {
    loungeId: LOUNGE_ID,
    issuedAtEpochMs: ISSUED_AT,
    startedAtMonotonicMs: STARTED_AT_MONOTONIC,
    expiresAtEpochMs: EXPIRES_AT,
    capacity: 6,
    requiredCapabilities: ['rules-provider-v1'],
    hostDiscoveryHint: 'local-v1:host-a',
    transportFingerprint: TRANSPORT_FINGERPRINT,
    randomBytes,
  } as const;
}

async function expectHandshakeError(
  action: () => Promise<unknown>,
  code: LoungeHandshakeErrorCode
): Promise<LoungeHandshakeError> {
  try {
    await action();
    throw new Error('LoungeHandshakeError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LoungeHandshakeError);
    if (error instanceof LoungeHandshakeError) {
      expect(error.code).toBe(code);
      return error;
    }
    throw error;
  }
}

function authorizeInput(
  wallClockMs = ISSUED_AT,
  monotonicMs = STARTED_AT_MONOTONIC
) {
  return {
    clock: { wallClockMs, monotonicMs },
    transportFingerprint: TRANSPORT_FINGERPRINT,
  } as const;
}

describe('一時 Lounge Handshake の発行と strict wire schema', () => {
  it('256 bit Secret を持つ Invite と非公開 Host 認証状態を発行する', async () => {
    const issued = await issueLoungeHandshake(issueInput());

    expect(issued.invite.joinSecret).toBe(`jsc_${'01'.repeat(32)}`);
    expect(issued.invite.schemaVersion).toBe(2);
    expect(issued.host.status).toBe('available');
    expect(JSON.stringify(issued.host)).not.toContain(issued.invite.joinSecret);
  });

  it('乱数長が 256 bit でない場合と全 0 の場合は発行しない', async () => {
    await expectHandshakeError(
      () => issueLoungeHandshake(issueInput(() => new Uint8Array(31).fill(1))),
      'INVALID_RANDOM'
    );
    await expectHandshakeError(
      () => issueLoungeHandshake(issueInput(() => new Uint8Array(32))),
      'INVALID_RANDOM'
    );
    await expectHandshakeError(
      () =>
        issueLoungeHandshake(
          issueInput(() => {
            throw new Error('OS RNG failure');
          })
        ),
      'INVALID_RANDOM'
    );
  });

  it('Invite 設定が不正なら Secret を公開せず Domain Error を伝播する', async () => {
    await expect(
      issueLoungeHandshake({ ...issueInput(), capacity: 7 })
    ).rejects.toThrow('定員は 2 名以上 6 名以下');
  });

  it('Join Request を bounded JSON へ encode して strict に再構築する', async () => {
    const { invite } = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(invite, PARTICIPANT_ID);
    const raw = encodeLoungeJoinRequest(request);

    expect(parseLoungeJoinRequestJson(raw)).toEqual(request);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
      ['loungeId', 'participantId', 'proof', 'schemaVersion'].sort()
    );
  });

  it('Join Request の未知 Field、不正 Version、過大 JSON を拒否する', async () => {
    const { invite } = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(invite, PARTICIPANT_ID);

    expect(() =>
      parseLoungeJoinRequestJson(
        JSON.stringify({ ...request, passport: { petName: '秘密' } })
      )
    ).toThrow(SchemaValidationError);
    expect(() =>
      parseLoungeJoinRequestJson(
        JSON.stringify({ ...request, schemaVersion: 2 })
      )
    ).toThrow(SchemaValidationError);
    expect(() => parseLoungeJoinRequestJson('x'.repeat(2_000))).toThrow(
      SchemaValidationError
    );
    expect(() =>
      parseLoungeJoinRequestJson(
        JSON.stringify({ ...request, loungeId: 'invalid-lounge' })
      )
    ).toThrow(SchemaValidationError);
    expect(() =>
      parseLoungeJoinRequestJson(
        JSON.stringify({ ...request, participantId: 'stable-device-id' })
      )
    ).toThrow(SchemaValidationError);
    expect(() =>
      parseLoungeJoinRequestJson(
        JSON.stringify({ ...request, proof: 'hmp_short' })
      )
    ).toThrow(SchemaValidationError);
  });

  it('Native Runtime にない Web Crypto HMAC を参照しない', async () => {
    const source = await Bun.file(
      new URL('lounge-handshake.ts', import.meta.url)
    ).text();

    expect(source).toContain("from '@noble/hashes/hmac.js'");
    expect(source).toContain("from '@noble/hashes/sha2.js'");
    expect(source).not.toContain('crypto.subtle');
  });

  it('Join Request と Error は Passport、Secret、Fingerprint を含まない', async () => {
    const issued = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );
    const raw = encodeLoungeJoinRequest(request);

    expect(raw).not.toContain('passport');
    expect(raw).not.toContain(issued.invite.joinSecret);
    expect(raw).not.toContain(TRANSPORT_FINGERPRINT);

    const error = await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(raw, {
          ...authorizeInput(),
          transportFingerprint: `sha256_${'bb'.repeat(32)}`,
        }),
      'TRANSPORT_MISMATCH'
    );
    const serializedError = JSON.stringify(error);
    expect(serializedError).not.toContain(issued.invite.joinSecret);
    expect(serializedError).not.toContain(request.proof);
    expect(serializedError).not.toContain(TRANSPORT_FINGERPRINT);
  });
});

describe('一時 Lounge Handshake の認証と Replay 防止', () => {
  it('不正な Participant ID、Request、Host Clock を型付き Error にする', async () => {
    const issued = await issueLoungeHandshake(issueInput());
    await expectHandshakeError(
      () => createLoungeJoinRequest(issued.invite, 'ptc_invalid'),
      'INVALID_PARTICIPANT'
    );
    await expectHandshakeError(
      () => issued.host.authorizeJoin('{invalid', authorizeInput()),
      'INVALID_REQUEST'
    );
    const request = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );
    await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(encodeLoungeJoinRequest(request), {
          ...authorizeInput(),
          clock: { wallClockMs: Number.NaN, monotonicMs: 0 },
        }),
      'INVALID_CLOCK'
    );
  });

  it('正しい Proof と実測 Fingerprint のときだけ認証済み Identity を返す', async () => {
    const issued = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );

    await expect(
      issued.host.authorizeJoin(
        encodeLoungeJoinRequest(request),
        authorizeInput()
      )
    ).resolves.toEqual({
      kind: 'authenticated',
      loungeId: LOUNGE_ID,
      participantId: PARTICIPANT_ID,
    });
    expect(issued.host.status).toBe('used');
  });

  it('HMAC-SHA-256 の固定 Transcript が Known-answer と一致する', async () => {
    const secretInvite: LoungeInvite = {
      schemaVersion: 2,
      loungeId: LOUNGE_ID,
      joinSecret: `jsc_${'0b'.repeat(32)}`,
      hostDiscoveryHint: 'local-v1:host-a',
      transportFingerprint: TRANSPORT_FINGERPRINT,
      issuedAtEpochMs: ISSUED_AT,
      expiresAtEpochMs: EXPIRES_AT,
      capacity: 6,
      requiredCapabilities: ['rules-provider-v1'],
    };

    const request = await createLoungeJoinRequest(secretInvite, PARTICIPANT_ID);

    expect(request.proof).toBe(
      'hmp_7be7130094ba7a4760718ef4fb1cd24b2e0c46ec7c92396d8dbddeeaad529fa0'
    );
  });

  it('QR、Participant、Lounge、Proof の改ざんを拒否し正規要求は再試行できる', async () => {
    const issued = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );
    const tamperedRaw = encodeLoungeJoinRequest(request).replace(
      request.proof,
      `${request.proof.slice(0, -1)}0`
    );

    await expectHandshakeError(
      () => issued.host.authorizeJoin(tamperedRaw, authorizeInput()),
      'INVALID_PROOF'
    );
    const tamperedInviteRequest = await createLoungeJoinRequest(
      { ...issued.invite, capacity: 5 },
      PARTICIPANT_ID
    );
    await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(
          encodeLoungeJoinRequest(tamperedInviteRequest),
          authorizeInput()
        ),
      'INVALID_PROOF'
    );
    const tamperedParticipantRaw = encodeLoungeJoinRequest(request).replace(
      PARTICIPANT_ID,
      'ptc_ffffffffffffffffffffffffffffffff'
    );
    await expectHandshakeError(
      () => issued.host.authorizeJoin(tamperedParticipantRaw, authorizeInput()),
      'INVALID_PROOF'
    );
    await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(
          encodeLoungeJoinRequest({
            ...request,
            loungeId: 'lng_ffffffffffffffffffffffffffffffff',
          }),
          authorizeInput()
        ),
      'LOUNGE_MISMATCH'
    );

    await expect(
      issued.host.authorizeJoin(
        encodeLoungeJoinRequest(request),
        authorizeInput()
      )
    ).resolves.toMatchObject({ kind: 'authenticated' });
  });

  it('Fingerprint 不一致では Proof を採用せず利用可能状態を保つ', async () => {
    const issued = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );
    const raw = encodeLoungeJoinRequest(request);

    await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(raw, {
          ...authorizeInput(),
          transportFingerprint: `sha256_${'bb'.repeat(32)}`,
        }),
      'TRANSPORT_MISMATCH'
    );
    expect(issued.host.status).toBe('available');
    await expect(
      issued.host.authorizeJoin(raw, authorizeInput())
    ).resolves.toMatchObject({ kind: 'authenticated' });
  });

  it('Host の期限と同じ時点を拒否し Guest の Clock を最終判定に使わない', async () => {
    const expired = await issueLoungeHandshake(issueInput());
    const expiredRequest = await createLoungeJoinRequest(
      expired.invite,
      PARTICIPANT_ID
    );

    await expectHandshakeError(
      () =>
        expired.host.authorizeJoin(
          encodeLoungeJoinRequest(expiredRequest),
          authorizeInput(EXPIRES_AT)
        ),
      'INVITE_EXPIRED'
    );

    const valid = await issueLoungeHandshake(issueInput());
    const validRequest = await createLoungeJoinRequest(
      valid.invite,
      PARTICIPANT_ID
    );
    await expect(
      valid.host.authorizeJoin(
        encodeLoungeJoinRequest(validRequest),
        authorizeInput(EXPIRES_AT - 1)
      )
    ).resolves.toMatchObject({ kind: 'authenticated' });
  });

  it('Host 壁時計が巻き戻っても単調増加時計の 20 分上限で拒否する', async () => {
    const issued = await issueLoungeHandshake(issueInput());
    const request = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );

    await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(
          encodeLoungeJoinRequest(request),
          authorizeInput(
            ISSUED_AT - 60_000,
            STARTED_AT_MONOTONIC + 20 * 60 * 1_000
          )
        ),
      'INVITE_EXPIRED'
    );
  });

  it('同じ QR の逐次 Replay と同時二重 Join を一方だけ許可する', async () => {
    const replayed = await issueLoungeHandshake(issueInput());
    const replayedRequest = await createLoungeJoinRequest(
      replayed.invite,
      PARTICIPANT_ID
    );
    const replayedRaw = encodeLoungeJoinRequest(replayedRequest);
    await replayed.host.authorizeJoin(replayedRaw, authorizeInput());
    await expectHandshakeError(
      () => replayed.host.authorizeJoin(replayedRaw, authorizeInput()),
      'REPLAYED_INVITE'
    );

    const concurrent = await issueLoungeHandshake(issueInput());
    const concurrentRequest = await createLoungeJoinRequest(
      concurrent.invite,
      PARTICIPANT_ID
    );
    const concurrentRaw = encodeLoungeJoinRequest(concurrentRequest);
    const first = concurrent.host.authorizeJoin(
      concurrentRaw,
      authorizeInput()
    );
    const second = expectHandshakeError(
      () => concurrent.host.authorizeJoin(concurrentRaw, authorizeInput()),
      'REPLAYED_INVITE'
    );

    await expect(first).resolves.toMatchObject({ kind: 'authenticated' });
    await second;
  });

  it('Rotation 後は旧 Proof を拒否し新しい Secret の Proof だけを許可する', async () => {
    const randomBytes = sequentialRandomBytes();
    const issued = await issueLoungeHandshake(issueInput(randomBytes));
    const oldRequest = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );
    const rotated = await issued.host.rotate(randomBytes);
    const newRequest = await createLoungeJoinRequest(
      rotated.invite,
      PARTICIPANT_ID
    );

    expect(rotated.invite.joinSecret).not.toBe(issued.invite.joinSecret);
    await expectHandshakeError(
      () =>
        rotated.host.authorizeJoin(
          encodeLoungeJoinRequest(oldRequest),
          authorizeInput()
        ),
      'INVALID_PROOF'
    );
    await expect(
      rotated.host.authorizeJoin(
        encodeLoungeJoinRequest(newRequest),
        authorizeInput()
      )
    ).resolves.toMatchObject({ kind: 'authenticated' });
  });

  it('Lounge 終了で Key を破棄し再起動後の別状態へ旧 Proof を復元しない', async () => {
    const randomBytes = sequentialRandomBytes();
    const issued = await issueLoungeHandshake(issueInput(randomBytes));
    const oldRequest = await createLoungeJoinRequest(
      issued.invite,
      PARTICIPANT_ID
    );
    issued.host.dispose();

    await expectHandshakeError(
      () =>
        issued.host.authorizeJoin(
          encodeLoungeJoinRequest(oldRequest),
          authorizeInput()
        ),
      'SESSION_DISPOSED'
    );

    const restarted = await issueLoungeHandshake(issueInput(randomBytes));
    await expectHandshakeError(
      () =>
        restarted.host.authorizeJoin(
          encodeLoungeJoinRequest(oldRequest),
          authorizeInput()
        ),
      'INVALID_PROOF'
    );
  });
});
