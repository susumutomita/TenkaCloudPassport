import {
  CAPABILITY_MAX_REQUIRED,
  type CapabilityToken,
  isCapabilityToken,
} from './capability';
import { LOUNGE_TTL_MS } from './lounge';
import { isLoungeId, type LoungeId } from './session-identifiers';

export const LOUNGE_INVITE_SCHEMA_VERSION = 2;
export const LOUNGE_INVITE_MIN_CAPACITY = 2;
export const LOUNGE_INVITE_MAX_CAPACITY = 6;
export const LOUNGE_DISCOVERY_HINT_MAX_LENGTH = 128;

export type JoinSecret = `jsc_${string}`;
export type TransportFingerprint = `sha256_${string}`;

export interface LoungeInvite {
  readonly schemaVersion: 2;
  readonly loungeId: LoungeId;
  readonly joinSecret: JoinSecret;
  readonly hostDiscoveryHint: string;
  readonly transportFingerprint: TransportFingerprint;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly capacity: number;
  readonly requiredCapabilities: readonly CapabilityToken[];
}

export type LoungeInviteErrorCode =
  | 'INVALID_CLOCK'
  | 'INVALID_EXPIRY'
  | 'INVALID_LOUNGE_ID'
  | 'INVALID_SECRET'
  | 'INVALID_DISCOVERY_HINT'
  | 'INVALID_TRANSPORT_FINGERPRINT'
  | 'INVALID_CAPACITY'
  | 'INVALID_CAPABILITY';

export class LoungeInviteError extends Error {
  readonly code: LoungeInviteErrorCode;

  constructor(code: LoungeInviteErrorCode, message: string) {
    super(message);
    this.name = 'LoungeInviteError';
    this.code = code;
  }
}

export interface CreateLoungeInviteInput {
  readonly loungeId: string;
  readonly joinSecret: string;
  readonly hostDiscoveryHint: string;
  readonly transportFingerprint: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly capacity: number;
  readonly requiredCapabilities: readonly string[];
}

export function isJoinSecret(value: string): value is JoinSecret {
  return /^jsc_[0-9a-f]{64}$/.test(value);
}

export function isTransportFingerprint(
  value: string
): value is TransportFingerprint {
  return /^sha256_[0-9a-f]{64}$/.test(value);
}

export function isHostDiscoveryHint(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= LOUNGE_DISCOVERY_HINT_MAX_LENGTH &&
    /^[A-Za-z0-9._~:/-]+$/.test(value)
  );
}

function validatedCapabilities(
  capabilities: readonly string[]
): readonly CapabilityToken[] {
  if (
    capabilities.length < 1 ||
    capabilities.length > CAPABILITY_MAX_REQUIRED ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new LoungeInviteError(
      'INVALID_CAPABILITY',
      'Invite の Required Capability が不正です。'
    );
  }
  const validated: CapabilityToken[] = [];
  for (const capability of capabilities) {
    if (!isCapabilityToken(capability)) {
      throw new LoungeInviteError(
        'INVALID_CAPABILITY',
        'Invite の Required Capability が不正です。'
      );
    }
    validated.push(capability);
  }
  return validated;
}

export function createLoungeInvite(
  input: CreateLoungeInviteInput
): LoungeInvite {
  if (
    !Number.isSafeInteger(input.issuedAtEpochMs) ||
    input.issuedAtEpochMs < 0
  ) {
    throw new LoungeInviteError(
      'INVALID_CLOCK',
      'Invite の発行時刻は safe integer である必要があります。'
    );
  }
  if (
    !Number.isSafeInteger(input.expiresAtEpochMs) ||
    input.expiresAtEpochMs <= input.issuedAtEpochMs ||
    input.expiresAtEpochMs - input.issuedAtEpochMs > LOUNGE_TTL_MS
  ) {
    throw new LoungeInviteError(
      'INVALID_EXPIRY',
      'Invite の期限は発行後 20 分以内である必要があります。'
    );
  }
  if (!isLoungeId(input.loungeId)) {
    throw new LoungeInviteError(
      'INVALID_LOUNGE_ID',
      'Invite の Lounge ID が不正です。'
    );
  }
  if (!isJoinSecret(input.joinSecret)) {
    throw new LoungeInviteError(
      'INVALID_SECRET',
      'Invite の Join Secret が不正です。'
    );
  }
  if (!isHostDiscoveryHint(input.hostDiscoveryHint)) {
    throw new LoungeInviteError(
      'INVALID_DISCOVERY_HINT',
      'Invite の Discovery Hint が不正です。'
    );
  }
  if (!isTransportFingerprint(input.transportFingerprint)) {
    throw new LoungeInviteError(
      'INVALID_TRANSPORT_FINGERPRINT',
      'Invite の Transport Fingerprint が不正です。'
    );
  }
  if (
    !Number.isSafeInteger(input.capacity) ||
    input.capacity < LOUNGE_INVITE_MIN_CAPACITY ||
    input.capacity > LOUNGE_INVITE_MAX_CAPACITY
  ) {
    throw new LoungeInviteError(
      'INVALID_CAPACITY',
      'Invite の定員は 2 名以上 6 名以下である必要があります。'
    );
  }
  const requiredCapabilities = validatedCapabilities(
    input.requiredCapabilities
  );
  return {
    schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
    loungeId: input.loungeId,
    joinSecret: input.joinSecret,
    hostDiscoveryHint: input.hostDiscoveryHint,
    transportFingerprint: input.transportFingerprint,
    issuedAtEpochMs: input.issuedAtEpochMs,
    expiresAtEpochMs: input.expiresAtEpochMs,
    capacity: input.capacity,
    requiredCapabilities: [...requiredCapabilities],
  };
}
