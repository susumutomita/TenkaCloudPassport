import {
  LOUNGE_INVITE_SCHEMA_VERSION,
  type LoungeInvite,
} from '../domain/lounge-invite';
import { loungeId } from './schema';
import { integerValue, schemaError, strictRecord } from './validation';

export function parseLoungeInvite(value: unknown): LoungeInvite {
  const path = '$.loungeInvite';
  const record = strictRecord(value, path, [
    'schemaVersion',
    'loungeId',
    'expiresAtEpochMs',
  ]);
  if (record.schemaVersion !== LOUNGE_INVITE_SCHEMA_VERSION) {
    return schemaError(
      'UNSUPPORTED_VERSION',
      `${path}.schemaVersion`,
      `${path} の Schema Version は対応していません。`
    );
  }
  return {
    schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
    loungeId: loungeId(record.loungeId, `${path}.loungeId`),
    expiresAtEpochMs: integerValue(
      record.expiresAtEpochMs,
      `${path}.expiresAtEpochMs`,
      0,
      Number.MAX_SAFE_INTEGER
    ),
  };
}
