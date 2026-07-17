import type { LoungeInvite } from '../domain/lounge-invite';
import type { PublicPassport } from '../domain/passport';
import { parseLoungeInvite } from './lounge-invite-schema';
import { parsePublicPassport } from './schema';
import {
  integerValue,
  parseBoundedJson,
  SchemaValidationError,
  strictRecord,
} from './validation';

/**
 * QR は Versioned Public Passport または Versioned Lounge Invite だけを扱う。
 * 実カメラでの走査は M3 に先送りし（architect guidance）、この境界はプロトコル層で
 * 純粋な encode/decode として固定する。
 */
export const QR_FAMILY_PREFIX = 'TCPQ';
export const QR_PROTOCOL_PREFIX = 'TCPQ1:';
export const QR_PAYLOAD_MAX_BYTES = 1024;
const QR_JSON_MAX_DEPTH = 6;
const QR_PROTOCOL_VERSION = { major: 1, minor: 1 } as const;

export type QrPayload =
  | { readonly kind: 'public-passport'; readonly value: PublicPassport }
  | { readonly kind: 'lounge-invite'; readonly value: LoungeInvite };

export type QrPayloadErrorCode =
  | 'NOT_PASSPORT_QR'
  | 'INVALID_PREFIX'
  | 'OVERSIZED_PAYLOAD'
  | 'INVALID_JSON'
  | 'UNKNOWN_VERSION'
  | 'DUPLICATE_SCAN';

export class QrPayloadError extends Error {
  readonly code: QrPayloadErrorCode;

  constructor(code: QrPayloadErrorCode, message: string) {
    super(message);
    this.name = 'QrPayloadError';
    this.code = code;
  }
}

function byteLength(raw: string): number {
  return new TextEncoder().encode(raw).byteLength;
}

export function encodeQrPayload(payload: QrPayload): string {
  const envelope = {
    qrProtocolVersion: QR_PROTOCOL_VERSION,
    kind: payload.kind,
    value: payload.value,
  };
  const raw = `${QR_PROTOCOL_PREFIX}${JSON.stringify(envelope)}`;
  if (byteLength(raw) > QR_PAYLOAD_MAX_BYTES) {
    throw new QrPayloadError(
      'OVERSIZED_PAYLOAD',
      'QR Payload が上限を超えています。'
    );
  }
  return raw;
}

function qrProtocolVersion(value: unknown, path: string): void {
  const record = strictRecord(value, path, ['major', 'minor']);
  const major = integerValue(record.major, `${path}.major`, 0, 1_000);
  const minor = integerValue(record.minor, `${path}.minor`, 0, 1_000);
  if (
    major !== QR_PROTOCOL_VERSION.major ||
    minor !== QR_PROTOCOL_VERSION.minor
  ) {
    throw new QrPayloadError(
      'UNKNOWN_VERSION',
      'QR Protocol Version は対応していません。'
    );
  }
}

function decodeEnvelope(parsed: unknown): QrPayload {
  const path = '$.qrPayload';
  try {
    const record = strictRecord(parsed, path, [
      'qrProtocolVersion',
      'kind',
      'value',
    ]);
    qrProtocolVersion(record.qrProtocolVersion, `${path}.qrProtocolVersion`);
    if (record.kind === 'public-passport') {
      return {
        kind: 'public-passport',
        value: parsePublicPassport(record.value),
      };
    }
    if (record.kind === 'lounge-invite') {
      return { kind: 'lounge-invite', value: parseLoungeInvite(record.value) };
    }
    throw new QrPayloadError('INVALID_JSON', `${path}.kind が不正です。`);
  } catch (error: unknown) {
    if (error instanceof QrPayloadError) throw error;
    if (error instanceof SchemaValidationError) {
      throw new QrPayloadError(
        error.code === 'UNSUPPORTED_VERSION'
          ? 'UNKNOWN_VERSION'
          : 'INVALID_JSON',
        'QR の内容を Passport / Invite として解析できません。'
      );
    }
    throw error;
  }
}

export function decodeQrPayload(
  raw: string,
  seenRawPayloads: ReadonlySet<string>
): QrPayload {
  if (seenRawPayloads.has(raw)) {
    throw new QrPayloadError(
      'DUPLICATE_SCAN',
      '同じ QR を連続して読み取りました。新しく表示された QR を読み取ってください。'
    );
  }
  if (!raw.startsWith(QR_FAMILY_PREFIX)) {
    throw new QrPayloadError(
      'NOT_PASSPORT_QR',
      'これは TenkaCloud Passport の QR ではありません。'
    );
  }
  if (!raw.startsWith(QR_PROTOCOL_PREFIX)) {
    throw new QrPayloadError('INVALID_PREFIX', 'QR の Prefix が不正です。');
  }
  if (byteLength(raw) > QR_PAYLOAD_MAX_BYTES) {
    throw new QrPayloadError(
      'OVERSIZED_PAYLOAD',
      'QR Payload が上限を超えています。'
    );
  }
  const jsonPart = raw.slice(QR_PROTOCOL_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = parseBoundedJson(
      jsonPart,
      QR_PAYLOAD_MAX_BYTES,
      QR_JSON_MAX_DEPTH
    );
  } catch (error: unknown) {
    if (
      error instanceof SchemaValidationError &&
      error.code === 'LIMIT_EXCEEDED'
    ) {
      throw new QrPayloadError(
        'OVERSIZED_PAYLOAD',
        'QR Payload が上限を超えています。'
      );
    }
    throw new QrPayloadError(
      'INVALID_JSON',
      'QR の内容が JSON として解析できません。'
    );
  }
  return decodeEnvelope(parsed);
}
