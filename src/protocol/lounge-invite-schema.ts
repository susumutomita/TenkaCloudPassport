import { CAPABILITY_MAX_REQUIRED } from '../domain/capability';
import {
  createLoungeInvite,
  LOUNGE_DISCOVERY_HINT_MAX_LENGTH,
  LOUNGE_INVITE_MAX_CAPACITY,
  LOUNGE_INVITE_MIN_CAPACITY,
  LOUNGE_INVITE_SCHEMA_VERSION,
  type LoungeInvite,
  LoungeInviteError,
} from '../domain/lounge-invite';
import {
  arrayValue,
  assertUniqueStrings,
  integerValue,
  schemaError,
  strictRecord,
  stringValue,
} from './validation';

function parseCapabilities(value: unknown, path: string): readonly string[] {
  const values = arrayValue(value, path, 1, CAPABILITY_MAX_REQUIRED).map(
    (capability, index) => stringValue(capability, `${path}[${index}]`, 32)
  );
  assertUniqueStrings(values, path);
  return values;
}

export function parseLoungeInvite(value: unknown): LoungeInvite {
  const path = '$.loungeInvite';
  const record = strictRecord(value, path, [
    'schemaVersion',
    'loungeId',
    'joinSecret',
    'hostDiscoveryHint',
    'transportFingerprint',
    'issuedAtEpochMs',
    'expiresAtEpochMs',
    'capacity',
    'requiredCapabilities',
  ]);
  if (record.schemaVersion !== LOUNGE_INVITE_SCHEMA_VERSION) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      `${path}.schemaVersion`,
      `${path} の Schema Version は対応していません。`
    );
  }
  try {
    return createLoungeInvite({
      loungeId: stringValue(record.loungeId, `${path}.loungeId`, 36),
      joinSecret: stringValue(record.joinSecret, `${path}.joinSecret`, 68),
      hostDiscoveryHint: stringValue(
        record.hostDiscoveryHint,
        `${path}.hostDiscoveryHint`,
        LOUNGE_DISCOVERY_HINT_MAX_LENGTH
      ),
      transportFingerprint: stringValue(
        record.transportFingerprint,
        `${path}.transportFingerprint`,
        71
      ),
      issuedAtEpochMs: integerValue(
        record.issuedAtEpochMs,
        `${path}.issuedAtEpochMs`,
        0,
        Number.MAX_SAFE_INTEGER
      ),
      expiresAtEpochMs: integerValue(
        record.expiresAtEpochMs,
        `${path}.expiresAtEpochMs`,
        0,
        Number.MAX_SAFE_INTEGER
      ),
      capacity: integerValue(
        record.capacity,
        `${path}.capacity`,
        LOUNGE_INVITE_MIN_CAPACITY,
        LOUNGE_INVITE_MAX_CAPACITY
      ),
      requiredCapabilities: parseCapabilities(
        record.requiredCapabilities,
        `${path}.requiredCapabilities`
      ),
    });
  } catch (error: unknown) {
    if (error instanceof LoungeInviteError) {
      return schemaError(
        'INVALID_VALUE',
        path,
        'Lounge Invite の値が Protocol 契約に一致しません。'
      );
    }
    throw error;
  }
}
