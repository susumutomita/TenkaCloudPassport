import { LOUNGE_TTL_MS } from './lounge';
import type { LoungeId } from './session-identifiers';

export const LOUNGE_INVITE_SCHEMA_VERSION = 1;

export interface LoungeInvite {
  readonly schemaVersion: 1;
  readonly loungeId: LoungeId;
  readonly expiresAtEpochMs: number;
}

export type LoungeInviteErrorCode = 'INVALID_CLOCK';

export class LoungeInviteError extends Error {
  readonly code: LoungeInviteErrorCode;

  constructor(code: LoungeInviteErrorCode, message: string) {
    super(message);
    this.name = 'LoungeInviteError';
    this.code = code;
  }
}

export interface CreateLoungeInviteInput {
  readonly loungeId: LoungeId;
  readonly nowEpochMs: number;
}

export function createLoungeInvite(
  input: CreateLoungeInviteInput
): LoungeInvite {
  if (!Number.isFinite(input.nowEpochMs)) {
    throw new LoungeInviteError(
      'INVALID_CLOCK',
      'Invite を作る現在時刻は有限値である必要があります。'
    );
  }
  return {
    schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
    loungeId: input.loungeId,
    expiresAtEpochMs: input.nowEpochMs + LOUNGE_TTL_MS,
  };
}
