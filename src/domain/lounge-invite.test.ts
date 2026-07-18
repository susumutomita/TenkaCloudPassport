import { describe, expect, it } from 'bun:test';
import { LOUNGE_TTL_MS } from './lounge';
import {
  createLoungeInvite,
  LOUNGE_INVITE_SCHEMA_VERSION,
  LoungeInviteError,
  type LoungeInviteErrorCode,
} from './lounge-invite';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';
const JOIN_SECRET: `jsc_${string}` = `jsc_${'11'.repeat(32)}`;
const TRANSPORT_FINGERPRINT: `sha256_${string}` = `sha256_${'aa'.repeat(32)}`;

function validInput() {
  return {
    loungeId: LOUNGE_ID,
    joinSecret: JOIN_SECRET,
    hostDiscoveryHint: 'local-v1:host-a',
    transportFingerprint: TRANSPORT_FINGERPRINT,
    issuedAtEpochMs: 1_000_000,
    expiresAtEpochMs: 1_000_000 + LOUNGE_TTL_MS,
    capacity: 6,
    requiredCapabilities: ['rules-provider-v1'],
  } as const;
}

function expectInviteError(
  action: () => void,
  code: LoungeInviteErrorCode
): void {
  try {
    action();
    throw new Error('LoungeInviteError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LoungeInviteError);
    if (error instanceof LoungeInviteError) expect(error.code).toBe(code);
  }
}

describe('Lounge Invite v2 の生成', () => {
  it('1 回限り Secret と Transport Binding を持つ bounded Invite を再構築する', () => {
    expect(createLoungeInvite(validInput())).toEqual({
      schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
      ...validInput(),
      requiredCapabilities: ['rules-provider-v1'],
    });
  });

  it('発行時刻が非負の safe integer でなければ拒否する', () => {
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          issuedAtEpochMs: Number.NaN,
        }),
      'INVALID_CLOCK'
    );
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          issuedAtEpochMs: -1,
        }),
      'INVALID_CLOCK'
    );
  });

  it('期限が発行時刻以下または 20 分超なら拒否する', () => {
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          expiresAtEpochMs: validInput().issuedAtEpochMs,
        }),
      'INVALID_EXPIRY'
    );
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          expiresAtEpochMs: validInput().issuedAtEpochMs + LOUNGE_TTL_MS + 1,
        }),
      'INVALID_EXPIRY'
    );
  });

  it('不正な Lounge ID と Join Secret を拒否する', () => {
    expectInviteError(
      () =>
        createLoungeInvite({ ...validInput(), loungeId: 'stable-device-id' }),
      'INVALID_LOUNGE_ID'
    );
    expectInviteError(
      () => createLoungeInvite({ ...validInput(), joinSecret: 'too-short' }),
      'INVALID_SECRET'
    );
  });

  it('過大または空白を含む Discovery Hint を拒否する', () => {
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          hostDiscoveryHint: 'host address',
        }),
      'INVALID_DISCOVERY_HINT'
    );
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          hostDiscoveryHint: 'x'.repeat(129),
        }),
      'INVALID_DISCOVERY_HINT'
    );
  });

  it('SHA-256 形式ではない Transport Fingerprint を拒否する', () => {
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          transportFingerprint: 'sha1_deadbeef',
        }),
      'INVALID_TRANSPORT_FINGERPRINT'
    );
  });

  it('定員が 2〜6 名の外なら拒否する', () => {
    expectInviteError(
      () => createLoungeInvite({ ...validInput(), capacity: 1 }),
      'INVALID_CAPACITY'
    );
    expectInviteError(
      () => createLoungeInvite({ ...validInput(), capacity: 7 }),
      'INVALID_CAPACITY'
    );
  });

  it('Required Capability が空、重複、過大、不正 Token なら拒否する', () => {
    expectInviteError(
      () => createLoungeInvite({ ...validInput(), requiredCapabilities: [] }),
      'INVALID_CAPABILITY'
    );
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          requiredCapabilities: ['rules-provider-v1', 'rules-provider-v1'],
        }),
      'INVALID_CAPABILITY'
    );
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          requiredCapabilities: [
            'rules-provider-v1',
            'one-v1',
            'two-v1',
            'three-v1',
            'four-v1',
          ],
        }),
      'INVALID_CAPABILITY'
    );
    expectInviteError(
      () =>
        createLoungeInvite({
          ...validInput(),
          requiredCapabilities: ['invalid capability'],
        }),
      'INVALID_CAPABILITY'
    );
  });
});
