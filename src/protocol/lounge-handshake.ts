import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  type ClockSnapshot,
  hasElapsedTtl,
  isValidClock,
} from '../domain/clock-guard';
import { LOUNGE_TTL_MS } from '../domain/lounge';
import {
  createLoungeInvite,
  isTransportFingerprint,
  type LoungeInvite,
} from '../domain/lounge-invite';
import {
  isLoungeId,
  isParticipantId,
  type LoungeId,
  type ParticipantId,
  type RandomBytes,
} from '../domain/session-identifiers';
import type { AuthenticatedTransportIdentity } from './peer-envelope';
import {
  parseBoundedJson,
  SchemaValidationError,
  schemaError,
  strictRecord,
  stringValue,
} from './validation';

const JOIN_SECRET_BYTES = 32;
const LOUNGE_JOIN_REQUEST_SCHEMA_VERSION = 1;
const LOUNGE_JOIN_REQUEST_MAX_BYTES = 1024;
const LOUNGE_JOIN_REQUEST_MAX_DEPTH = 2;
const HANDSHAKE_TRANSCRIPT_LABEL = 'tenkacloud-passport/lounge-join/v1';

export type LoungeJoinProof = `hmp_${string}`;

export interface LoungeJoinRequest {
  readonly schemaVersion: 1;
  readonly loungeId: LoungeId;
  readonly participantId: ParticipantId;
  readonly proof: LoungeJoinProof;
}

export type LoungeHandshakeErrorCode =
  | 'INVALID_RANDOM'
  | 'INVALID_PARTICIPANT'
  | 'INVALID_REQUEST'
  | 'INVALID_CLOCK'
  | 'TRANSPORT_MISMATCH'
  | 'LOUNGE_MISMATCH'
  | 'INVITE_EXPIRED'
  | 'INVALID_PROOF'
  | 'REPLAYED_INVITE'
  | 'SESSION_DISPOSED';

export class LoungeHandshakeError extends Error {
  readonly code: LoungeHandshakeErrorCode;

  constructor(code: LoungeHandshakeErrorCode, message: string) {
    super(message);
    this.name = 'LoungeHandshakeError';
    this.code = code;
  }
}

export interface IssueLoungeHandshakeInput {
  readonly loungeId: LoungeId;
  readonly hostDiscoveryHint: string;
  readonly transportFingerprint: string;
  readonly issuedAtEpochMs: number;
  readonly startedAtMonotonicMs: number;
  readonly expiresAtEpochMs: number;
  readonly capacity: number;
  readonly requiredCapabilities: readonly string[];
  readonly randomBytes: RandomBytes;
}

export interface AuthorizeLoungeJoinInput {
  readonly clock: ClockSnapshot;
  readonly transportFingerprint: string;
}

export type LoungeHandshakeStatus =
  | 'available'
  | 'verifying'
  | 'used'
  | 'disposed';

export interface LoungeHandshakeHost {
  readonly status: LoungeHandshakeStatus;
  authorizeJoin(
    rawRequest: string,
    input: AuthorizeLoungeJoinInput
  ): Promise<AuthenticatedTransportIdentity>;
  rotate(randomBytes: RandomBytes): Promise<IssuedLoungeHandshake>;
  dispose(): void;
}

type LoungeHandshakeAuthorizationState =
  | {
      readonly status: 'available' | 'verifying';
      readonly secretBytes: Uint8Array<ArrayBuffer>;
    }
  | { readonly status: 'used' | 'disposed' };

function proofValue(bytes: Uint8Array): LoungeJoinProof {
  return `hmp_${bytesToHex(bytes)}`;
}

function isLoungeJoinProof(value: string): value is LoungeJoinProof {
  return /^hmp_[0-9a-f]{64}$/.test(value);
}

function encodedField(value: string): string {
  return `${new TextEncoder().encode(value).byteLength}:${value}`;
}

function handshakeTranscript(
  invite: Omit<LoungeInvite, 'joinSecret'>,
  participantId: ParticipantId
): Uint8Array<ArrayBuffer> {
  const fields = [
    HANDSHAKE_TRANSCRIPT_LABEL,
    invite.loungeId,
    participantId,
    String(invite.issuedAtEpochMs),
    String(invite.expiresAtEpochMs),
    String(invite.capacity),
    invite.hostDiscoveryHint,
    invite.transportFingerprint,
    ...invite.requiredCapabilities,
  ];
  return new TextEncoder().encode(fields.map(encodedField).join('|'));
}

function verifyHmac(expected: Uint8Array, received: Uint8Array): boolean {
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (expected[index] ?? 0) ^ (received[index] ?? 0);
  }
  return difference === 0;
}

function generateSecret(randomBytes: RandomBytes): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array;
  try {
    bytes = randomBytes(JOIN_SECRET_BYTES);
  } catch {
    throw new LoungeHandshakeError(
      'INVALID_RANDOM',
      'Join Secret の乱数を生成できませんでした。'
    );
  }
  if (bytes.length !== JOIN_SECRET_BYTES || bytes.every((byte) => byte === 0)) {
    throw new LoungeHandshakeError(
      'INVALID_RANDOM',
      'Join Secret には 256 bit の非 0 乱数が必要です。'
    );
  }
  return Uint8Array.from(bytes);
}

function descriptor(invite: LoungeInvite): Omit<LoungeInvite, 'joinSecret'> {
  const {
    joinSecret: _joinSecret,
    requiredCapabilities,
    ...remainingFields
  } = invite;
  return {
    ...remainingFields,
    requiredCapabilities: [...requiredCapabilities],
  };
}

export function parseLoungeJoinRequestJson(raw: string): LoungeJoinRequest {
  const path = '$.loungeJoinRequest';
  const parsed = parseBoundedJson(
    raw,
    LOUNGE_JOIN_REQUEST_MAX_BYTES,
    LOUNGE_JOIN_REQUEST_MAX_DEPTH
  );
  const record = strictRecord(parsed, path, [
    'schemaVersion',
    'loungeId',
    'participantId',
    'proof',
  ]);
  if (record.schemaVersion !== LOUNGE_JOIN_REQUEST_SCHEMA_VERSION) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      `${path}.schemaVersion`,
      'Join Request の Schema Version は対応していません。'
    );
  }
  const loungeId = stringValue(record.loungeId, `${path}.loungeId`, 36);
  if (!isLoungeId(loungeId)) {
    return schemaError(
      'INVALID_VALUE',
      `${path}.loungeId`,
      'Join Request の Lounge ID が不正です。'
    );
  }
  const participantId = stringValue(
    record.participantId,
    `${path}.participantId`,
    36
  );
  if (!isParticipantId(participantId)) {
    return schemaError(
      'INVALID_VALUE',
      `${path}.participantId`,
      'Join Request の Participant ID が不正です。'
    );
  }
  const proof = stringValue(record.proof, `${path}.proof`, 68);
  if (!isLoungeJoinProof(proof)) {
    return schemaError(
      'INVALID_VALUE',
      `${path}.proof`,
      'Join Request の Proof が不正です。'
    );
  }
  return {
    schemaVersion: LOUNGE_JOIN_REQUEST_SCHEMA_VERSION,
    loungeId,
    participantId,
    proof,
  };
}

export function encodeLoungeJoinRequest(request: LoungeJoinRequest): string {
  const raw = JSON.stringify(request);
  return JSON.stringify(parseLoungeJoinRequestJson(raw));
}

export async function createLoungeJoinRequest(
  invite: LoungeInvite,
  participantId: string
): Promise<LoungeJoinRequest> {
  if (!isParticipantId(participantId)) {
    throw new LoungeHandshakeError(
      'INVALID_PARTICIPANT',
      'Join Request の Participant ID が不正です。'
    );
  }
  const secretBytes = hexToBytes(invite.joinSecret.slice(4));
  let signature: Uint8Array;
  try {
    signature = hmac(
      sha256,
      secretBytes,
      handshakeTranscript(invite, participantId)
    );
  } finally {
    secretBytes.fill(0);
  }
  const proof = proofValue(signature);
  signature.fill(0);
  return {
    schemaVersion: LOUNGE_JOIN_REQUEST_SCHEMA_VERSION,
    loungeId: invite.loungeId,
    participantId,
    proof,
  };
}

class EphemeralLoungeHandshakeHost implements LoungeHandshakeHost {
  readonly #configuration: Omit<IssueLoungeHandshakeInput, 'randomBytes'>;
  readonly #inviteDescriptor: Omit<LoungeInvite, 'joinSecret'>;
  #authorizationState: LoungeHandshakeAuthorizationState;

  constructor(
    configuration: Omit<IssueLoungeHandshakeInput, 'randomBytes'>,
    invite: LoungeInvite,
    secretBytes: Uint8Array<ArrayBuffer>
  ) {
    this.#configuration = {
      ...configuration,
      requiredCapabilities: [...configuration.requiredCapabilities],
    };
    this.#inviteDescriptor = descriptor(invite);
    this.#authorizationState = { status: 'available', secretBytes };
  }

  get status(): LoungeHandshakeStatus {
    return this.#authorizationState.status;
  }

  async authorizeJoin(
    rawRequest: string,
    input: AuthorizeLoungeJoinInput
  ): Promise<AuthenticatedTransportIdentity> {
    if (this.#authorizationState.status === 'disposed') {
      throw new LoungeHandshakeError(
        'SESSION_DISPOSED',
        '破棄済み Handshake は再利用できません。'
      );
    }
    if (this.#authorizationState.status !== 'available') {
      throw new LoungeHandshakeError(
        'REPLAYED_INVITE',
        'Join Secret は検証中または使用済みです。'
      );
    }
    let request: LoungeJoinRequest;
    try {
      request = parseLoungeJoinRequestJson(rawRequest);
    } catch (error: unknown) {
      if (error instanceof SchemaValidationError) {
        throw new LoungeHandshakeError(
          'INVALID_REQUEST',
          'Join Request が Protocol 契約に一致しません。'
        );
      }
      throw error;
    }
    if (request.loungeId !== this.#inviteDescriptor.loungeId) {
      throw new LoungeHandshakeError(
        'LOUNGE_MISMATCH',
        'Join Request の Lounge が一致しません。'
      );
    }
    if (!isValidClock(input.clock)) {
      throw new LoungeHandshakeError(
        'INVALID_CLOCK',
        'Host の現在時刻が不正です。'
      );
    }
    if (
      hasElapsedTtl(
        this.#configuration.startedAtMonotonicMs,
        this.#inviteDescriptor.expiresAtEpochMs,
        input.clock,
        LOUNGE_TTL_MS
      )
    ) {
      throw new LoungeHandshakeError(
        'INVITE_EXPIRED',
        'Join Request の期限が切れています。'
      );
    }
    if (
      !isTransportFingerprint(input.transportFingerprint) ||
      input.transportFingerprint !== this.#inviteDescriptor.transportFingerprint
    ) {
      throw new LoungeHandshakeError(
        'TRANSPORT_MISMATCH',
        'Transport の認証結果が Invite と一致しません。'
      );
    }
    const { secretBytes } = this.#authorizationState;
    this.#authorizationState = { status: 'verifying', secretBytes };
    const proofBytes = hexToBytes(request.proof.slice(4));
    let verified = false;
    let expectedProof: Uint8Array | null = null;
    try {
      expectedProof = hmac(
        sha256,
        secretBytes,
        handshakeTranscript(this.#inviteDescriptor, request.participantId)
      );
      verified = verifyHmac(expectedProof, proofBytes);
    } finally {
      expectedProof?.fill(0);
      proofBytes.fill(0);
      this.#authorizationState = { status: 'available', secretBytes };
    }
    if (!verified) {
      throw new LoungeHandshakeError(
        'INVALID_PROOF',
        'Join Proof を検証できませんでした。'
      );
    }
    secretBytes.fill(0);
    this.#authorizationState = { status: 'used' };
    return {
      kind: 'authenticated',
      loungeId: this.#inviteDescriptor.loungeId,
      participantId: request.participantId,
    };
  }

  async rotate(randomBytes: RandomBytes): Promise<IssuedLoungeHandshake> {
    this.dispose();
    return issueLoungeHandshake({
      ...this.#configuration,
      randomBytes,
    });
  }

  dispose(): void {
    if (
      this.#authorizationState.status === 'available' ||
      this.#authorizationState.status === 'verifying'
    ) {
      this.#authorizationState.secretBytes.fill(0);
    }
    this.#authorizationState = { status: 'disposed' };
  }
}

export interface IssuedLoungeHandshake {
  readonly invite: LoungeInvite;
  readonly host: LoungeHandshakeHost;
}

export async function issueLoungeHandshake(
  input: IssueLoungeHandshakeInput
): Promise<IssuedLoungeHandshake> {
  const secretBytes = generateSecret(input.randomBytes);
  const joinSecret = `jsc_${bytesToHex(secretBytes)}`;
  const { randomBytes: _randomBytes, ...configuration } = input;
  let invite: LoungeInvite;
  try {
    invite = createLoungeInvite({
      ...configuration,
      joinSecret,
    });
  } catch (error: unknown) {
    secretBytes.fill(0);
    throw error;
  }
  return {
    invite,
    host: new EphemeralLoungeHandshakeHost(configuration, invite, secretBytes),
  };
}
