import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TransportFingerprint } from '../domain/lounge-invite';
import type { LoungeId } from '../domain/session-identifiers';

const IN_PROCESS_TRANSPORT_IDENTITY_LABEL =
  'tenkacloud-passport/in-process-transport/v1';

/**
 * 単一端末 Adapter の Lounge-scoped identity を SHA-256 にする。この値は実 Transport の
 * 証明書検証を代替せず、同じ端末内の M1 Flow を Lounge 間で相関させないためだけに使う。
 */
export function inProcessTransportFingerprint(
  loungeId: LoungeId
): TransportFingerprint {
  const identity = new TextEncoder().encode(
    `${IN_PROCESS_TRANSPORT_IDENTITY_LABEL}/${loungeId}`
  );
  return `sha256_${bytesToHex(sha256(identity))}`;
}
