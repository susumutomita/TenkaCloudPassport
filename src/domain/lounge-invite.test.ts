import { describe, expect, it } from 'bun:test';
import { LOUNGE_TTL_MS } from './lounge';
import {
  createLoungeInvite,
  LOUNGE_INVITE_SCHEMA_VERSION,
  LoungeInviteError,
} from './lounge-invite';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';

describe('Lounge Invite の生成', () => {
  it('現在時刻から 20 分後の期限を持つ Invite を生成する', () => {
    const invite = createLoungeInvite({
      loungeId: LOUNGE_ID,
      nowEpochMs: 1_000_000,
    });

    expect(invite).toEqual({
      schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
      loungeId: LOUNGE_ID,
      expiresAtEpochMs: 1_000_000 + LOUNGE_TTL_MS,
    });
  });

  it('無効な現在時刻では Invite を生成しない', () => {
    expect(() =>
      createLoungeInvite({ loungeId: LOUNGE_ID, nowEpochMs: Number.NaN })
    ).toThrow(LoungeInviteError);
    try {
      createLoungeInvite({ loungeId: LOUNGE_ID, nowEpochMs: Number.NaN });
      throw new Error('LoungeInviteError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LoungeInviteError);
      if (error instanceof LoungeInviteError) {
        expect(error.code).toBe('INVALID_CLOCK');
      }
    }
  });
});
