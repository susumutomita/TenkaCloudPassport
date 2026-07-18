import type { PublicPassport } from '../domain/passport';
import {
  isParticipantId,
  type LoungeId,
  type ParticipantId,
} from '../domain/session-identifiers';
import type {
  AuthenticatedPeerEnvelope,
  CapabilityToken,
  MembershipPayload,
  PeerEnvelope,
  TransportAuthentication,
} from './peer-envelope';
import {
  isCapabilityToken,
  PEER_CAPABILITY_MAX_REQUIRED,
  PEER_CAPABILITY_MAX_SUPPORTED,
  PEER_MAX_SEQUENCE,
  PEER_MEMBERSHIP_MAX_PARTICIPANTS,
} from './peer-envelope';
import {
  PEER_ENVELOPE_MAX_BYTES,
  parsePeerEnvelopeJson,
  SchemaValidationError,
} from './schema';
import { boundedUtf8ByteLength } from './validation';

export { PEER_MESSAGE_MAX_TTL_MS } from './peer-envelope';

export const PEER_RATE_WINDOW_MS = 1_000;
export const PEER_RATE_MAX_MESSAGES = 16;
export const PEER_RATE_MAX_BYTES = 8 * 1_024;
export const PEER_FUTURE_CLOCK_SKEW_MS = 30_000;
export const PEER_MAX_REMOTE_PARTICIPANTS =
  PEER_MEMBERSHIP_MAX_PARTICIPANTS - 1;
export const PEER_MAX_MESSAGES_PER_PARTICIPANT = 512;
export const PEER_SESSION_MAX_MESSAGES =
  PEER_MAX_REMOTE_PARTICIPANTS * PEER_MAX_MESSAGES_PER_PARTICIPANT;

export type PeerProtocolRejectionCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_MISMATCH'
  | 'INVALID_ENVELOPE'
  | 'INVALID_TIME'
  | 'HELLO_REQUIRED'
  | 'CAPABILITY_REQUIRED'
  | 'UNSUPPORTED_REQUIRED_CAPABILITY'
  | 'HOST_ONLY_MESSAGE'
  | 'PEER_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BYTE_LIMIT_EXCEEDED'
  | 'MESSAGE_LIMIT_EXCEEDED';

export type PeerProtocolSessionErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'HOST_ONLY_OPERATION'
  | 'INVALID_MEMBERSHIP'
  | 'SESSION_CLOSED';

export class PeerProtocolSessionError extends Error {
  readonly code: PeerProtocolSessionErrorCode;

  constructor(code: PeerProtocolSessionErrorCode, message: string) {
    super(message);
    this.name = 'PeerProtocolSessionError';
    this.code = code;
  }
}

export interface CreatePeerProtocolSessionInput {
  readonly loungeId: LoungeId;
  readonly hostParticipantId: ParticipantId;
  readonly localParticipantId: ParticipantId;
  readonly loungeExpiresAtEpochMs: number;
  readonly localSupportedCapabilities: readonly CapabilityToken[];
  readonly localRequiredCapabilities: readonly CapabilityToken[];
}

export interface ReceivePeerEnvelopeInput {
  readonly raw: string;
  readonly nowEpochMs: number;
  readonly transportAuthentication: TransportAuthentication;
}

export type PeerProtocolReceiveOutcome =
  | {
      readonly kind: 'accepted';
      readonly envelope: AuthenticatedPeerEnvelope;
      readonly sequenceGap: number;
    }
  | {
      readonly kind: 'ignored';
      readonly reason: 'duplicate-message-id' | 'out-of-order' | 'expired';
    }
  | {
      readonly kind: 'peer-rejected';
      readonly participantId: ParticipantId;
      readonly code: PeerProtocolRejectionCode;
    };

export interface NegotiatedPeerCapabilities {
  readonly supported: readonly CapabilityToken[];
  readonly required: readonly CapabilityToken[];
  readonly negotiated: readonly CapabilityToken[];
}

export interface LateJoinSnapshot {
  readonly membership: Omit<MembershipPayload, 'kind'> | null;
  readonly publicPassports: readonly {
    readonly participantId: ParticipantId;
    readonly publicPassport: PublicPassport;
  }[];
}

interface PeerState {
  phase: 'new' | 'hello-received' | 'negotiated';
  role: 'host' | 'guest' | null;
  lastSequence: number;
  readonly seenMessageIds: Set<string>;
  readonly recentCharges: Array<{
    readonly receivedAtEpochMs: number;
    readonly bytes: number;
  }>;
  recentBytes: number;
  lastChargedAtEpochMs: number | null;
  totalMessageCount: number;
  capabilities: NegotiatedPeerCapabilities | null;
}

interface ChargedPeer {
  readonly participantId: ParticipantId;
  readonly peer: PeerState;
}

function uniqueCapabilities(
  values: readonly CapabilityToken[],
  label: string,
  maximumLength: number
): readonly CapabilityToken[] {
  if (
    values.length === 0 ||
    values.length > maximumLength ||
    new Set(values).size !== values.length ||
    values.some((value) => !isCapabilityToken(value))
  ) {
    throw new PeerProtocolSessionError(
      'INVALID_CONFIGURATION',
      `${label} は 1 件以上の重複しない Capability が必要です。`
    );
  }
  return [...values];
}

function assertSessionConfiguration(input: CreatePeerProtocolSessionInput): {
  readonly supported: readonly CapabilityToken[];
  readonly required: readonly CapabilityToken[];
} {
  if (
    !Number.isSafeInteger(input.loungeExpiresAtEpochMs) ||
    input.loungeExpiresAtEpochMs < 0
  ) {
    throw new PeerProtocolSessionError(
      'INVALID_CONFIGURATION',
      'Lounge の期限は非負の safe integer が必要です。'
    );
  }
  const supported = uniqueCapabilities(
    input.localSupportedCapabilities,
    'Supported Capability',
    PEER_CAPABILITY_MAX_SUPPORTED
  );
  const required = uniqueCapabilities(
    input.localRequiredCapabilities,
    'Required Capability',
    PEER_CAPABILITY_MAX_REQUIRED
  );
  if (required.some((capability) => !supported.includes(capability))) {
    throw new PeerProtocolSessionError(
      'INVALID_CONFIGURATION',
      'Required Capability は Supported の部分集合である必要があります。'
    );
  }
  return { supported, required };
}

function newPeerState(): PeerState {
  return {
    phase: 'new',
    role: null,
    lastSequence: -1,
    seenMessageIds: new Set<string>(),
    recentCharges: [],
    recentBytes: 0,
    lastChargedAtEpochMs: null,
    totalMessageCount: 0,
    capabilities: null,
  };
}

export class PeerProtocolSession {
  readonly #input: CreatePeerProtocolSessionInput;
  readonly #localSupportedCapabilities: readonly CapabilityToken[];
  readonly #localRequiredCapabilities: readonly CapabilityToken[];
  readonly #peers = new Map<ParticipantId, PeerState>();
  readonly #rejectedPeers = new Map<ParticipantId, PeerProtocolRejectionCode>();
  readonly #departedParticipantIds = new Set<ParticipantId>();
  readonly #publicPassports = new Map<ParticipantId, PublicPassport>();
  #membership: Omit<MembershipPayload, 'kind'> | null = null;
  #lastMembershipRevision = -1;
  #totalMessageCount = 0;
  #closed = false;

  constructor(input: CreatePeerProtocolSessionInput) {
    const capabilities = assertSessionConfiguration(input);
    this.#input = {
      ...input,
      localSupportedCapabilities: capabilities.supported,
      localRequiredCapabilities: capabilities.required,
    };
    this.#localSupportedCapabilities = capabilities.supported;
    this.#localRequiredCapabilities = capabilities.required;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new PeerProtocolSessionError(
        'SESSION_CLOSED',
        '破棄済み Peer Protocol Session は再利用できません。'
      );
    }
  }

  #peer(participantId: ParticipantId): PeerState | null {
    const existing = this.#peers.get(participantId);
    if (existing) return existing;
    if (this.#peers.size >= PEER_MAX_REMOTE_PARTICIPANTS) return null;
    const created = newPeerState();
    this.#peers.set(participantId, created);
    return created;
  }

  #reject(
    participantId: ParticipantId,
    code: PeerProtocolRejectionCode
  ): PeerProtocolReceiveOutcome {
    this.#peers.delete(participantId);
    this.#rejectedPeers.set(participantId, code);
    this.#publicPassports.delete(participantId);
    return { kind: 'peer-rejected', participantId, code };
  }

  #chargeSession(
    participantId: ParticipantId
  ): PeerProtocolReceiveOutcome | null {
    this.#totalMessageCount += 1;
    if (this.#totalMessageCount <= PEER_SESSION_MAX_MESSAGES) return null;
    this.dispose();
    return {
      kind: 'peer-rejected',
      participantId,
      code: 'MESSAGE_LIMIT_EXCEEDED',
    };
  }

  #charge(
    participantId: ParticipantId,
    peer: PeerState,
    bytes: number,
    nowEpochMs: number
  ): PeerProtocolReceiveOutcome | null {
    if (
      !Number.isSafeInteger(nowEpochMs) ||
      nowEpochMs < 0 ||
      (peer.lastChargedAtEpochMs !== null &&
        nowEpochMs < peer.lastChargedAtEpochMs)
    ) {
      return this.#reject(participantId, 'INVALID_TIME');
    }
    const cutoff = nowEpochMs - PEER_RATE_WINDOW_MS;
    while (
      peer.recentCharges[0] &&
      peer.recentCharges[0].receivedAtEpochMs <= cutoff
    ) {
      const expired = peer.recentCharges.shift();
      if (expired) peer.recentBytes -= expired.bytes;
    }
    peer.recentCharges.push({ receivedAtEpochMs: nowEpochMs, bytes });
    peer.recentBytes += bytes;
    peer.lastChargedAtEpochMs = nowEpochMs;
    peer.totalMessageCount += 1;

    if (peer.totalMessageCount > PEER_MAX_MESSAGES_PER_PARTICIPANT) {
      return this.#reject(participantId, 'MESSAGE_LIMIT_EXCEEDED');
    }
    if (peer.recentCharges.length > PEER_RATE_MAX_MESSAGES) {
      return this.#reject(participantId, 'RATE_LIMIT_EXCEEDED');
    }
    if (
      bytes > PEER_ENVELOPE_MAX_BYTES ||
      peer.recentBytes > PEER_RATE_MAX_BYTES
    ) {
      return this.#reject(participantId, 'BYTE_LIMIT_EXCEEDED');
    }
    return null;
  }

  #validateTime(
    envelope: AuthenticatedPeerEnvelope,
    nowEpochMs: number
  ): PeerProtocolReceiveOutcome | null {
    if (
      !Number.isSafeInteger(nowEpochMs) ||
      nowEpochMs < 0 ||
      envelope.sentAtEpochMs > nowEpochMs + PEER_FUTURE_CLOCK_SKEW_MS ||
      envelope.expiresAtEpochMs > this.#input.loungeExpiresAtEpochMs
    ) {
      return this.#reject(envelope.senderParticipantId, 'INVALID_TIME');
    }
    if (envelope.expiresAtEpochMs <= nowEpochMs) {
      return { kind: 'ignored', reason: 'expired' };
    }
    return null;
  }

  #acceptHello(
    envelope: AuthenticatedPeerEnvelope,
    peer: PeerState
  ): PeerProtocolReceiveOutcome | null {
    const participantId = envelope.senderParticipantId;
    if (envelope.sequence !== 0 || envelope.payload.kind !== 'hello') {
      return this.#reject(participantId, 'HELLO_REQUIRED');
    }
    const expectedRole =
      participantId === this.#input.hostParticipantId ? 'host' : 'guest';
    if (envelope.payload.role !== expectedRole) {
      return this.#reject(participantId, 'INVALID_ENVELOPE');
    }
    peer.role = envelope.payload.role;
    peer.phase = 'hello-received';
    return null;
  }

  #acceptCapability(
    envelope: AuthenticatedPeerEnvelope,
    peer: PeerState
  ): PeerProtocolReceiveOutcome | null {
    const participantId = envelope.senderParticipantId;
    if (envelope.sequence !== 1 || envelope.payload.kind !== 'capability') {
      return this.#reject(participantId, 'CAPABILITY_REQUIRED');
    }
    const remote = envelope.payload;
    const remoteRequirementMissing = remote.required.some(
      (capability) => !this.#localSupportedCapabilities.includes(capability)
    );
    const localRequirementMissing = this.#localRequiredCapabilities.some(
      (capability) => !remote.supported.includes(capability)
    );
    if (remoteRequirementMissing || localRequirementMissing) {
      return this.#reject(participantId, 'UNSUPPORTED_REQUIRED_CAPABILITY');
    }
    peer.capabilities = {
      supported: [...remote.supported],
      required: [...remote.required],
      negotiated: this.#localSupportedCapabilities.filter((capability) =>
        remote.supported.includes(capability)
      ),
    };
    peer.phase = 'negotiated';
    return null;
  }

  #validateHandshake(
    envelope: AuthenticatedPeerEnvelope,
    peer: PeerState
  ): PeerProtocolReceiveOutcome | null {
    const participantId = envelope.senderParticipantId;
    if (peer.phase === 'new') return this.#acceptHello(envelope, peer);
    if (peer.phase === 'hello-received') {
      return this.#acceptCapability(envelope, peer);
    }
    if (
      envelope.payload.kind === 'hello' ||
      envelope.payload.kind === 'capability'
    ) {
      return this.#reject(participantId, 'INVALID_ENVELOPE');
    }
    return null;
  }

  #validateHostOnly(
    envelope: AuthenticatedPeerEnvelope
  ): PeerProtocolReceiveOutcome | null {
    if (
      (envelope.payload.kind === 'membership' ||
        envelope.payload.kind === 'expire') &&
      envelope.senderParticipantId !== this.#input.hostParticipantId
    ) {
      return this.#reject(envelope.senderParticipantId, 'HOST_ONLY_MESSAGE');
    }
    if (
      envelope.payload.kind === 'membership' &&
      (!envelope.payload.participantIds.includes(
        this.#input.hostParticipantId
      ) ||
        !envelope.payload.participantIds.includes(
          this.#input.localParticipantId
        ))
    ) {
      return this.#reject(envelope.senderParticipantId, 'INVALID_ENVELOPE');
    }
    if (
      envelope.payload.kind === 'membership' &&
      envelope.payload.revision <= this.#lastMembershipRevision
    ) {
      return this.#reject(envelope.senderParticipantId, 'INVALID_ENVELOPE');
    }
    if (
      envelope.payload.kind === 'membership' &&
      envelope.payload.participantIds.some((participantId) =>
        this.#departedParticipantIds.has(participantId)
      )
    ) {
      return this.#reject(envelope.senderParticipantId, 'INVALID_ENVELOPE');
    }
    return null;
  }

  #assertMembership(payload: Omit<MembershipPayload, 'kind'>): void {
    if (
      !Number.isSafeInteger(payload.revision) ||
      payload.revision < 0 ||
      payload.revision > PEER_MAX_SEQUENCE ||
      payload.participantIds.length < 2 ||
      payload.participantIds.length > PEER_MEMBERSHIP_MAX_PARTICIPANTS ||
      new Set(payload.participantIds).size !== payload.participantIds.length ||
      payload.participantIds.some((participantId) =>
        this.#departedParticipantIds.has(participantId)
      ) ||
      payload.participantIds.some(
        (participantId) => !isParticipantId(participantId)
      ) ||
      !payload.participantIds.includes(this.#input.hostParticipantId) ||
      !payload.participantIds.includes(this.#input.localParticipantId) ||
      payload.revision <= this.#lastMembershipRevision
    ) {
      throw new PeerProtocolSessionError(
        'INVALID_MEMBERSHIP',
        'Local Membership は新しい revision の 2〜6 名の完全 Snapshot が必要です。'
      );
    }
  }

  #assertLocalHost(): void {
    if (this.#input.localParticipantId !== this.#input.hostParticipantId) {
      throw new PeerProtocolSessionError(
        'HOST_ONLY_OPERATION',
        'Local Membership を更新できるのは Host だけです。'
      );
    }
  }

  #assertCleanupRevision(revision: number): void {
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision > PEER_MAX_SEQUENCE ||
      revision <= this.#lastMembershipRevision
    ) {
      throw new PeerProtocolSessionError(
        'INVALID_MEMBERSHIP',
        'Local cleanup には現在より新しい範囲内の revision が必要です。'
      );
    }
  }

  #removeParticipant(participantId: ParticipantId): void {
    this.#peers.delete(participantId);
    this.#rejectedPeers.delete(participantId);
    this.#publicPassports.delete(participantId);
    this.#departedParticipantIds.add(participantId);
  }

  #applyMembership(payload: MembershipPayload): void {
    const currentIds = new Set(this.#membership?.participantIds ?? []);
    const nextIds = new Set(payload.participantIds);
    for (const participantId of this.#peers.keys())
      currentIds.add(participantId);
    for (const participantId of this.#publicPassports.keys()) {
      currentIds.add(participantId);
    }
    for (const participantId of currentIds) {
      if (!nextIds.has(participantId)) this.#removeParticipant(participantId);
    }
    this.#membership = {
      revision: payload.revision,
      participantIds: [...payload.participantIds],
    };
    this.#lastMembershipRevision = payload.revision;
  }

  #applyLeave(participantId: ParticipantId): void {
    this.#removeParticipant(participantId);
    if (!this.#membership?.participantIds.includes(participantId)) return;
    const participantIds = this.#membership.participantIds.filter(
      (memberId) => memberId !== participantId
    );
    this.#membership =
      participantIds.length >= 2
        ? { revision: this.#membership.revision, participantIds }
        : null;
  }

  #applyAccepted(envelope: AuthenticatedPeerEnvelope): void {
    const participantId = envelope.senderParticipantId;
    if (envelope.payload.kind === 'public-passport') {
      this.#publicPassports.set(participantId, envelope.payload.publicPassport);
    }
    if (envelope.payload.kind === 'membership') {
      this.#applyMembership(envelope.payload);
    }
    if (envelope.payload.kind === 'leave') {
      this.#applyLeave(participantId);
    }
  }

  #authenticatedEnvelope(
    input: ReceivePeerEnvelopeInput,
    participantId: ParticipantId
  ): AuthenticatedPeerEnvelope | PeerProtocolReceiveOutcome {
    let parsed: PeerEnvelope;
    try {
      parsed = parsePeerEnvelopeJson(input.raw);
    } catch (error: unknown) {
      if (error instanceof SchemaValidationError) {
        return this.#reject(participantId, 'INVALID_ENVELOPE');
      }
      throw error;
    }
    if (
      input.transportAuthentication.kind !== 'authenticated' ||
      parsed.loungeId !== input.transportAuthentication.loungeId ||
      parsed.senderParticipantId !== participantId ||
      parsed.loungeId !== this.#input.loungeId
    ) {
      return this.#reject(participantId, 'AUTHENTICATION_MISMATCH');
    }
    return {
      ...parsed,
      transportAuthentication: input.transportAuthentication,
    };
  }

  #chargedPeer(
    input: ReceivePeerEnvelopeInput
  ): ChargedPeer | PeerProtocolReceiveOutcome {
    const participantId = input.transportAuthentication.participantId;
    const bytes = boundedUtf8ByteLength(input.raw, PEER_ENVELOPE_MAX_BYTES);
    const sessionCharge = this.#chargeSession(participantId);
    if (sessionCharge) return sessionCharge;
    if (participantId === this.#input.localParticipantId) {
      return {
        kind: 'peer-rejected',
        participantId,
        code: 'AUTHENTICATION_MISMATCH',
      };
    }
    if (this.#departedParticipantIds.has(participantId)) {
      return {
        kind: 'peer-rejected',
        participantId,
        code: 'INVALID_ENVELOPE',
      };
    }
    const rejectionCode = this.#rejectedPeers.get(participantId);
    if (rejectionCode) {
      return { kind: 'peer-rejected', participantId, code: rejectionCode };
    }
    const peer = this.#peer(participantId);
    if (!peer) {
      return {
        kind: 'peer-rejected',
        participantId,
        code: 'PEER_LIMIT_EXCEEDED',
      };
    }
    const charged = this.#charge(participantId, peer, bytes, input.nowEpochMs);
    return charged ?? { participantId, peer };
  }

  receive(input: ReceivePeerEnvelopeInput): PeerProtocolReceiveOutcome {
    this.#assertOpen();
    if (
      Number.isSafeInteger(input.nowEpochMs) &&
      input.nowEpochMs >= this.#input.loungeExpiresAtEpochMs
    ) {
      this.dispose();
      throw new PeerProtocolSessionError(
        'SESSION_CLOSED',
        'Lounge の期限到達時に Peer Protocol Session を破棄しました。'
      );
    }
    const participantId = input.transportAuthentication.participantId;
    if (input.transportAuthentication.kind === 'unauthenticated') {
      return {
        kind: 'peer-rejected',
        participantId,
        code: 'AUTHENTICATION_REQUIRED',
      };
    }
    const chargedPeer = this.#chargedPeer(input);
    if ('kind' in chargedPeer) return chargedPeer;
    const peer = chargedPeer.peer;

    const envelope = this.#authenticatedEnvelope(input, participantId);
    if ('kind' in envelope) return envelope;
    const timeOutcome = this.#validateTime(envelope, input.nowEpochMs);
    if (timeOutcome) return timeOutcome;
    if (peer.seenMessageIds.has(envelope.messageId)) {
      return { kind: 'ignored', reason: 'duplicate-message-id' };
    }
    if (envelope.sequence <= peer.lastSequence) {
      return { kind: 'ignored', reason: 'out-of-order' };
    }

    const handshakeOutcome = this.#validateHandshake(envelope, peer);
    if (handshakeOutcome) return handshakeOutcome;
    const hostOnlyOutcome = this.#validateHostOnly(envelope);
    if (hostOnlyOutcome) return hostOnlyOutcome;

    const sequenceGap = envelope.sequence - peer.lastSequence - 1;
    peer.lastSequence = envelope.sequence;
    peer.seenMessageIds.add(envelope.messageId);
    this.#applyAccepted(envelope);

    const closesSession =
      envelope.payload.kind === 'expire' ||
      (envelope.payload.kind === 'leave' &&
        envelope.senderParticipantId === this.#input.hostParticipantId);
    if (closesSession) this.dispose();
    return { kind: 'accepted', envelope, sequenceGap };
  }

  peerCapabilities(
    participantId: ParticipantId
  ): NegotiatedPeerCapabilities | null {
    if (this.#closed) return null;
    const capabilities = this.#peers.get(participantId)?.capabilities;
    if (!capabilities) return null;
    return {
      supported: [...capabilities.supported],
      required: [...capabilities.required],
      negotiated: [...capabilities.negotiated],
    };
  }

  updateLocalMembership(payload: Omit<MembershipPayload, 'kind'>): void {
    this.#assertOpen();
    this.#assertLocalHost();
    this.#assertMembership(payload);
    this.#applyMembership({ kind: 'membership', ...payload });
  }

  cleanupLocalHostMembership(revision: number): void {
    this.#assertOpen();
    this.#assertLocalHost();
    this.#assertCleanupRevision(revision);
    this.#applyMembership({
      kind: 'membership',
      revision,
      participantIds: [this.#input.hostParticipantId],
    });
  }

  lateJoinSnapshot(): LateJoinSnapshot {
    const publicPassports = [...this.#publicPassports.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([participantId, publicPassport]) => ({
        participantId,
        publicPassport,
      }));
    return {
      membership: this.#membership
        ? {
            revision: this.#membership.revision,
            participantIds: [...this.#membership.participantIds],
          }
        : null,
      publicPassports,
    };
  }

  dispose(): void {
    this.#peers.clear();
    this.#rejectedPeers.clear();
    this.#departedParticipantIds.clear();
    this.#publicPassports.clear();
    this.#membership = null;
    this.#lastMembershipRevision = -1;
    this.#totalMessageCount = 0;
    this.#closed = true;
  }
}

export function createPeerProtocolSession(
  input: CreatePeerProtocolSessionInput
): PeerProtocolSession {
  return new PeerProtocolSession(input);
}
