export const SESSION_RANDOM_BYTES = 16;

export type LoungeId = `lng_${string}`;
export type ParticipantId = `ptc_${string}`;

export type RandomBytes = (length: number) => Uint8Array;

export type SessionIdentifierErrorCode =
  | 'INVALID_RANDOM_LENGTH'
  | 'INVALID_RANDOM_VALUE'
  | 'RANDOM_COLLISION';

export class SessionIdentifierError extends Error {
  readonly code: SessionIdentifierErrorCode;

  constructor(code: SessionIdentifierErrorCode, message: string) {
    super(message);
    this.name = 'SessionIdentifierError';
    this.code = code;
  }
}

function validatedRandomBytes(randomBytes: RandomBytes): Uint8Array {
  const bytes = randomBytes(SESSION_RANDOM_BYTES);
  if (bytes.length !== SESSION_RANDOM_BYTES) {
    throw new SessionIdentifierError(
      'INVALID_RANDOM_LENGTH',
      'Session ID の乱数は 128 bit である必要があります。'
    );
  }
  if (bytes.every((byte) => byte === 0)) {
    throw new SessionIdentifierError(
      'INVALID_RANDOM_VALUE',
      'Session ID にすべて 0 の乱数は使用できません。'
    );
  }
  return bytes.slice();
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.every((byte, index) => byte === right[index]);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

export function createLoungeId(randomBytes: RandomBytes): LoungeId {
  return `lng_${bytesToHex(validatedRandomBytes(randomBytes))}`;
}

export function createParticipantId(randomBytes: RandomBytes): ParticipantId {
  return `ptc_${bytesToHex(validatedRandomBytes(randomBytes))}`;
}

export function createSessionIdentifiers(randomBytes: RandomBytes): {
  readonly loungeId: LoungeId;
  readonly participantId: ParticipantId;
} {
  const loungeBytes = validatedRandomBytes(randomBytes);
  const participantBytes = validatedRandomBytes(randomBytes);
  if (bytesEqual(loungeBytes, participantBytes)) {
    throw new SessionIdentifierError(
      'RANDOM_COLLISION',
      '同じ Session 内で乱数が衝突したため ID を発行できません。'
    );
  }
  return {
    loungeId: `lng_${bytesToHex(loungeBytes)}`,
    participantId: `ptc_${bytesToHex(participantBytes)}`,
  };
}

export function isLoungeId(value: string): value is LoungeId {
  return /^lng_[0-9a-f]{32}$/.test(value);
}

export function isParticipantId(value: string): value is ParticipantId {
  return /^ptc_[0-9a-f]{32}$/.test(value);
}
