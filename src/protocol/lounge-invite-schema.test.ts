import { describe, expect, it } from 'bun:test';
import {
  LOUNGE_INVITE_SCHEMA_VERSION,
  type LoungeInvite,
} from '../domain/lounge-invite';
import { parseLoungeInvite } from './lounge-invite-schema';
import { SchemaValidationError } from './validation';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';

function validInvite(): LoungeInvite {
  return {
    schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
    loungeId: LOUNGE_ID,
    joinSecret: `jsc_${'11'.repeat(32)}`,
    hostDiscoveryHint: 'local-v1:host-a',
    transportFingerprint: `sha256_${'aa'.repeat(32)}`,
    issuedAtEpochMs: 1_000_000,
    expiresAtEpochMs: 2_200_000,
    capacity: 6,
    requiredCapabilities: ['rules-provider-v1'],
  };
}

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

describe('Lounge Invite の strict validator', () => {
  it('正しい Lounge Invite を検証済み object として再構築する', () => {
    expect(parseLoungeInvite(validInvite())).toEqual(validInvite());
  });

  it('未知の field を拒否する', () => {
    expectSchemaError(
      () => parseLoungeInvite({ ...validInvite(), extra: 'x' }),
      'UNKNOWN_FIELD'
    );
  });

  it('必須 field の欠落を拒否する', () => {
    const { loungeId: _omit, ...rest } = validInvite();
    expectSchemaError(() => parseLoungeInvite(rest), 'MISSING_FIELD');
  });

  it('未対応の Schema Version を拒否する', () => {
    expectSchemaError(
      () => parseLoungeInvite({ ...validInvite(), schemaVersion: 3 }),
      'UNSUPPORTED_VERSION'
    );
  });

  it('不正な形式の Lounge ID を拒否する', () => {
    expectSchemaError(
      () =>
        parseLoungeInvite({ ...validInvite(), loungeId: 'not-a-lounge-id' }),
      'INVALID_VALUE'
    );
  });

  it('範囲外の期限を拒否する', () => {
    expectSchemaError(
      () => parseLoungeInvite({ ...validInvite(), expiresAtEpochMs: -1 }),
      'LIMIT_EXCEEDED'
    );
  });

  it('object 以外の入力を拒否する', () => {
    expectSchemaError(() => parseLoungeInvite('invite'), 'INVALID_TYPE');
  });
});
