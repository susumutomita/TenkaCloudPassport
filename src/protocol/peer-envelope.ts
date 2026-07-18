import type { CapabilityToken } from '../domain/capability';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import type { PublicPassport } from '../domain/passport';
import type { LoungeId, ParticipantId } from '../domain/session-identifiers';

export type { CapabilityToken } from '../domain/capability';
export {
  CAPABILITY_MAX_REQUIRED as PEER_CAPABILITY_MAX_REQUIRED,
  CAPABILITY_MAX_SUPPORTED as PEER_CAPABILITY_MAX_SUPPORTED,
  CAPABILITY_TOKEN_MAX_LENGTH as PEER_CAPABILITY_TOKEN_MAX_LENGTH,
  isCapabilityToken,
  LOCAL_LLM_CAPABILITY,
  RULES_PROVIDER_CAPABILITY,
} from '../domain/capability';

export const PROTOCOL_VERSION = { major: 1, minor: 2 } as const;
export const PEER_MESSAGE_MAX_TTL_MS = 60_000;
export const PEER_MEMBERSHIP_MAX_PARTICIPANTS = 6;
export const PEER_BRIDGE_MAX_EVIDENCE_IDS = 4;
export const PEER_MAX_SEQUENCE = 2_147_483_647;

export interface ProtocolVersion {
  readonly major: 1;
  readonly minor: 2;
}

export type MessageId = `mid_${string}`;
export type RoundId = `rnd_${string}`;
export type EvidenceId = `evi_${string}`;
export interface HelloPayload {
  readonly kind: 'hello';
  readonly role: 'host' | 'guest';
}

export interface CapabilityPayload {
  readonly kind: 'capability';
  readonly supported: readonly CapabilityToken[];
  readonly required: readonly CapabilityToken[];
}

export interface ReadyPayload {
  readonly kind: 'ready';
  readonly roundId: RoundId;
}

export interface PublicPassportPayload {
  readonly kind: 'public-passport';
  readonly publicPassport: PublicPassport;
}

export type PeerFieldReference =
  | { readonly kind: 'clue'; readonly clueId: ClueId }
  | { readonly kind: 'language'; readonly language: LanguageCode };

export interface PetSignalPayload {
  readonly kind: 'pet-signal';
  readonly evidenceId: EvidenceId;
  readonly fieldReference: PeerFieldReference;
  readonly signalType:
    | 'shared-topic'
    | 'offer-need-complement'
    | 'shared-language'
    | 'owner-confirmed';
}

export interface BridgeProposalPayload {
  readonly kind: 'bridge-proposal';
  readonly participantIds: readonly ParticipantId[];
  readonly evidenceIds: readonly EvidenceId[];
}

export interface MembershipPayload {
  readonly kind: 'membership';
  readonly revision: number;
  readonly participantIds: readonly ParticipantId[];
}

export interface LeavePayload {
  readonly kind: 'leave';
  readonly reason: 'owner-left' | 'network-lost' | 'host-ended';
}

export interface ExpirePayload {
  readonly kind: 'expire';
  readonly reason: 'lounge-expired';
}

export interface PeerErrorPayload {
  readonly kind: 'error';
  readonly code:
    | 'invalid-message'
    | 'unsupported-capability'
    | 'rate-limited'
    | 'resync-required';
  readonly phase: 'handshake' | 'protocol' | 'lounge';
}

export type PeerPayload =
  | HelloPayload
  | CapabilityPayload
  | ReadyPayload
  | PublicPassportPayload
  | PetSignalPayload
  | BridgeProposalPayload
  | MembershipPayload
  | LeavePayload
  | ExpirePayload
  | PeerErrorPayload;

export interface PeerEnvelope {
  readonly protocolVersion: ProtocolVersion;
  readonly loungeId: LoungeId;
  readonly senderParticipantId: ParticipantId;
  readonly messageId: MessageId;
  readonly sequence: number;
  readonly sentAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly payload: PeerPayload;
}

export interface AuthenticatedTransportIdentity {
  readonly kind: 'authenticated';
  readonly loungeId: LoungeId;
  readonly participantId: ParticipantId;
}

export interface UnauthenticatedTransportIdentity {
  readonly kind: 'unauthenticated';
  readonly participantId: ParticipantId;
}

export type TransportAuthentication =
  | AuthenticatedTransportIdentity
  | UnauthenticatedTransportIdentity;

export interface AuthenticatedPeerEnvelope extends PeerEnvelope {
  readonly transportAuthentication: AuthenticatedTransportIdentity;
}
