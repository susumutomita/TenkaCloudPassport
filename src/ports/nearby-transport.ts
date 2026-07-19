import {
  createLoungeInvite,
  type LoungeInvite,
  type TransportFingerprint,
} from '../domain/lounge-invite';
import type { LoungeId, ParticipantId } from '../domain/session-identifiers';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';

export const NEARBY_TRANSPORT_MAX_PARTICIPANTS = 6;
export const NEARBY_TRANSPORT_MAX_PAYLOAD_BYTES = 4 * 1_024;
export const NEARBY_TRANSPORT_MAX_QUEUE_SIZE = 8;
export const NEARBY_TRANSPORT_RATE_WINDOW_MS = 1_000;
export const NEARBY_TRANSPORT_MAX_SENDS_PER_WINDOW = 16;
export const NEARBY_TRANSPORT_MAX_BYTES_PER_WINDOW = 8 * 1_024;
export const NEARBY_TRANSPORT_MAX_LISTENERS = 16;
export const NEARBY_TRANSPORT_HOST_END_DEADLINE_MS = 5_000;

export type NearbyTransportErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_STATE'
  | 'HOST_NOT_FOUND'
  | 'TRANSPORT_FINGERPRINT_MISMATCH'
  | 'AUTHORIZATION_FAILED'
  | 'AUTHENTICATION_MISMATCH'
  | 'READY_REJECTED'
  | 'CAPACITY_EXCEEDED'
  | 'PARTICIPANT_IN_USE'
  | 'NOT_READY'
  | 'INVALID_ENVELOPE'
  | 'PAYLOAD_LIMIT_EXCEEDED'
  | 'QUEUE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BYTE_RATE_LIMIT_EXCEEDED'
  | 'TARGET_NOT_FOUND'
  | 'LISTENER_LIMIT_EXCEEDED'
  | 'DELIVERY_FAILED'
  | 'CONNECTION_INTERRUPTED'
  | 'DISPOSED';

const NEARBY_TRANSPORT_ERROR_MESSAGES: Readonly<
  Record<NearbyTransportErrorCode, string>
> = {
  INVALID_CONFIGURATION: 'Nearby Transport の設定が不正です。',
  INVALID_STATE: '現在の状態では Nearby Transport を操作できません。',
  HOST_NOT_FOUND: '参加先の Host を確認できません。',
  TRANSPORT_FINGERPRINT_MISMATCH:
    'Transport Fingerprint が Invite と一致しません。',
  AUTHORIZATION_FAILED: 'Join Request を認証できませんでした。',
  AUTHENTICATION_MISMATCH: '認証済み Transport Identity が一致しません。',
  READY_REJECTED: 'Host または Guest の Ready を確認できませんでした。',
  CAPACITY_EXCEEDED: 'Lounge の接続可能人数を超えています。',
  PARTICIPANT_IN_USE: 'Participant ID は別の接続で使用中です。',
  NOT_READY: 'Secure Join と Ready の完了前には送信できません。',
  INVALID_ENVELOPE: '送信 Envelope が不正です。',
  PAYLOAD_LIMIT_EXCEEDED: '送信 Payload の byte 上限を超えています。',
  QUEUE_LIMIT_EXCEEDED: '送信 Queue の上限に達しました。',
  RATE_LIMIT_EXCEEDED: '送信回数の上限に達しました。',
  BYTE_RATE_LIMIT_EXCEEDED: '送信 byte rate の上限に達しました。',
  TARGET_NOT_FOUND: '送信先は現在の Membership に存在しません。',
  LISTENER_LIMIT_EXCEEDED: 'Event Listener の上限に達しました。',
  DELIVERY_FAILED: 'Envelope を配送できませんでした。',
  CONNECTION_INTERRUPTED: '接続が完了前に終了しました。',
  DISPOSED: '破棄済み Nearby Transport は再利用できません。',
};

export class NearbyTransportError extends Error {
  readonly code: NearbyTransportErrorCode;

  constructor(code: NearbyTransportErrorCode) {
    super(NEARBY_TRANSPORT_ERROR_MESSAGES[code]);
    this.name = 'NearbyTransportError';
    this.code = code;
  }
}

export interface NearbyHostBinding {
  readonly hostDiscoveryHint: string;
  readonly transportFingerprint: TransportFingerprint;
}

export interface NearbyHostAuthorization {
  readonly invite: LoungeInvite;
  readonly authorizeJoin: (
    rawJoinRequest: string,
    transportFingerprint: TransportFingerprint
  ) => Promise<AuthenticatedTransportIdentity>;
  readonly waitUntilReady: (
    identity: AuthenticatedTransportIdentity
  ) => Promise<void>;
  readonly dispose: () => void;
}

export interface NearbyHostInvitePolicy {
  readonly hostParticipantId: ParticipantId;
  readonly issueInvite: (
    binding: NearbyHostBinding
  ) => Promise<NearbyHostAuthorization>;
}

export interface NearbyJoinDescriptor {
  readonly schemaVersion: 2;
  readonly loungeId: LoungeId;
  readonly hostDiscoveryHint: string;
  readonly transportFingerprint: TransportFingerprint;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly capacity: number;
  readonly requiredCapabilities: LoungeInvite['requiredCapabilities'];
}

/** Join Secret を Transport へ渡さない strict projection を作る。 */
export function createNearbyJoinDescriptor(
  invite: LoungeInvite
): NearbyJoinDescriptor {
  const validated = createLoungeInvite(invite);
  return {
    schemaVersion: validated.schemaVersion,
    loungeId: validated.loungeId,
    hostDiscoveryHint: validated.hostDiscoveryHint,
    transportFingerprint: validated.transportFingerprint,
    issuedAtEpochMs: validated.issuedAtEpochMs,
    expiresAtEpochMs: validated.expiresAtEpochMs,
    capacity: validated.capacity,
    requiredCapabilities: [...validated.requiredCapabilities],
  };
}

export interface NearbyJoinInput {
  readonly invite: NearbyJoinDescriptor;
  readonly participantId: ParticipantId;
  readonly rawJoinRequest: string;
  readonly waitUntilReady: () => Promise<void>;
}

export type NearbyEnvelopeDelivery =
  | { readonly kind: 'broadcast' }
  | { readonly kind: 'target'; readonly participantId: ParticipantId };

export interface NearbyOutboundEnvelope {
  readonly delivery: NearbyEnvelopeDelivery;
  readonly payload: string;
}

export interface NearbyReceivedEnvelope extends NearbyOutboundEnvelope {
  readonly transportAuthentication: AuthenticatedTransportIdentity;
}

export type NearbyTransportConnectionState =
  | 'idle'
  | 'hosting'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'terminal'
  | 'disposed';

export type NearbyTransportCondition =
  | 'local-network-permission-denied'
  | 'network-changed'
  | 'hotspot-disconnected'
  | 'app-background';

export type NearbyTransportLeaveReason = 'owner-left' | 'network-lost';

export type NearbyTransportTerminalReason =
  | NearbyTransportLeaveReason
  | NearbyTransportCondition
  | 'host-ended'
  | 'ready-rejected'
  | 'connection-interrupted';

export type NearbyTransportEvent =
  | {
      readonly kind: 'connection-state-changed';
      readonly state: NearbyTransportConnectionState;
      readonly reason?: NearbyTransportTerminalReason;
    }
  | {
      readonly kind: 'transport-condition';
      readonly condition: NearbyTransportCondition;
    }
  | {
      readonly kind: 'membership-changed';
      readonly change: 'joined' | 'left';
      readonly identity: AuthenticatedTransportIdentity;
      readonly participantIds: readonly ParticipantId[];
    }
  | {
      readonly kind: 'envelope-received';
      readonly envelope: NearbyReceivedEnvelope;
    };

export type NearbyTransportEventListener = (
  event: NearbyTransportEvent
) => void;

export interface NearbyTransport {
  host(invitePolicy: NearbyHostInvitePolicy): Promise<LoungeInvite>;
  join(invite: NearbyJoinInput): Promise<void>;
  send(envelope: NearbyOutboundEnvelope): Promise<void>;
  leave(reason: NearbyTransportLeaveReason): Promise<void>;
  subscribe(listener: NearbyTransportEventListener): () => void;
  dispose(): Promise<void>;
}
