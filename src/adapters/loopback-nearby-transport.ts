import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { LoungeInvite } from '../domain/lounge-invite';
import type { ParticipantId } from '../domain/session-identifiers';
import {
  createNearbyJoinDescriptor,
  NEARBY_TRANSPORT_MAX_BYTES_PER_WINDOW,
  NEARBY_TRANSPORT_MAX_LISTENERS,
  NEARBY_TRANSPORT_MAX_SENDS_PER_WINDOW,
  NEARBY_TRANSPORT_RATE_WINDOW_MS,
  type NearbyEnvelopeDelivery,
  type NearbyHostBinding,
  type NearbyHostInvitePolicy,
  type NearbyJoinInput,
  type NearbyOutboundEnvelope,
  type NearbyTransport,
  type NearbyTransportCondition,
  type NearbyTransportConnectionState,
  NearbyTransportError,
  type NearbyTransportErrorCode,
  type NearbyTransportEvent,
  type NearbyTransportEventListener,
  type NearbyTransportLeaveReason,
  type NearbyTransportTerminalReason,
} from '../ports/nearby-transport';
import {
  immutableNearbyTransportEvent,
  nearbyJoinDescriptorsMatch,
  type ValidatedNearbyEnvelope,
  type ValidatedNearbyJoinInput,
  validateAuthenticatedTransportIdentity,
  validateNearbyEnvelope,
  validateNearbyHostAuthorization,
  validateNearbyHostBinding,
  validateNearbyHostPolicy,
  validateNearbyJoinInput,
} from '../ports/nearby-transport-validation';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';
import { EndpointLifecycle } from './endpoint-lifecycle';
import {
  HostMembership,
  type StoredHostAuthorization,
} from './host-membership';
import { PendingDeliveries } from './pending-deliveries';

const LOOPBACK_REFERENCE_ADAPTER_LABEL =
  'TENKACLOUD_LOOPBACK_REFERENCE_V1_NOT_FOR_PRODUCTION';
const TRANSPORT_CONDITIONS = [
  'local-network-permission-denied',
  'network-changed',
  'hotspot-disconnected',
  'app-background',
] as const;
const LEAVE_REASONS = ['owner-left', 'network-lost'] as const;

type HostRecord = HostMembership<Endpoint>;

interface RateCharge {
  readonly chargedAtMonotonicMs: number;
  readonly bytes: number;
}

interface Endpoint extends EndpointLifecycle<HostRecord> {
  readonly listeners: Set<NearbyTransportEventListener>;
  readonly deliveries: PendingDeliveries<HostRecord>;
  readonly rateCharges: RateCharge[];
  drainScheduled: boolean;
  joinInFlight: boolean;
}

interface ValidatedAuthorization {
  readonly invite: LoungeInvite;
  readonly stored: StoredHostAuthorization;
}

interface ResolvedJoin {
  readonly record: HostRecord;
  readonly authorization: StoredHostAuthorization;
  readonly reconnecting: boolean;
}

type NearbyMembershipEvent = Extract<
  NearbyTransportEvent,
  { readonly kind: 'membership-changed' }
>;

interface MembershipBroadcast {
  readonly record: HostRecord;
  readonly event: NearbyMembershipEvent;
  readonly recipients: readonly Endpoint[];
  readonly departing?: Endpoint;
}

interface PreparedConditionRecipient {
  readonly endpoint: Endpoint;
  readonly participantId: ParticipantId;
  readonly generation: number;
}

function fixedError(code: NearbyTransportErrorCode): NearbyTransportError {
  return new NearbyTransportError(code);
}

function cloneDelivery(
  delivery: NearbyEnvelopeDelivery
): NearbyEnvelopeDelivery {
  return delivery.kind === 'broadcast'
    ? { kind: 'broadcast' }
    : { kind: 'target', participantId: delivery.participantId };
}

function disposeAuthorization(authorization: StoredHostAuthorization): boolean {
  try {
    authorization.dispose();
    return true;
  } catch {
    return false;
  }
}

class LoopbackNearbyTransport implements NearbyTransport {
  readonly #network: LoopbackNearbyNetwork;

  constructor(network: LoopbackNearbyNetwork) {
    this.#network = network;
  }

  host(invitePolicy: NearbyHostInvitePolicy): Promise<LoungeInvite> {
    return this.#network.host(this, invitePolicy);
  }

  join(invite: NearbyJoinInput): Promise<void> {
    return this.#network.join(this, invite);
  }

  send(envelope: NearbyOutboundEnvelope): Promise<void> {
    return this.#network.send(this, envelope);
  }

  leave(reason: NearbyTransportLeaveReason): Promise<void> {
    return this.#network.leave(this, reason);
  }

  subscribe(listener: NearbyTransportEventListener): () => void {
    return this.#network.subscribe(this, listener);
  }

  dispose(): Promise<void> {
    return this.#network.dispose(this);
  }
}

/**
 * Contract Test 専用の同一 Process Network。暗号化、OS Permission、Socket を提供しないため
 * Production Composition へ注入してはならない。
 */
export class LoopbackNearbyNetwork {
  readonly #endpoints = new WeakMap<LoopbackNearbyTransport, Endpoint>();
  readonly #registeredEndpoints = new Set<Endpoint>();
  readonly #hostsByHint = new Map<string, HostRecord>();
  readonly #membershipBroadcastQueue: MembershipBroadcast[];
  #dispatchingMembershipBroadcast: boolean;
  #nextBindingId: number;

  constructor() {
    this.#membershipBroadcastQueue = [];
    this.#dispatchingMembershipBroadcast = false;
    this.#nextBindingId = 1;
  }

  get activeEndpointCount(): number {
    return this.#registeredEndpoints.size;
  }

  createTransport(): NearbyTransport {
    const transport = new LoopbackNearbyTransport(this);
    const rateCharges: RateCharge[] = [];
    const endpoint: Endpoint = Object.assign(
      new EndpointLifecycle<HostRecord>((state, reason) =>
        this.#emit(endpoint, {
          kind: 'connection-state-changed',
          state,
          ...(reason ? { reason } : {}),
        })
      ),
      {
        listeners: new Set<NearbyTransportEventListener>(),
        deliveries: new PendingDeliveries<HostRecord>(),
        rateCharges,
        drainScheduled: false,
        joinInFlight: false,
      }
    );
    this.#endpoints.set(transport, endpoint);
    return transport;
  }

  activeListenerCount(transport: NearbyTransport): number {
    return this.#externalEndpoint(transport).listeners.size;
  }

  queuedEnvelopeCount(transport: NearbyTransport): number {
    return this.#externalEndpoint(transport).deliveries.size;
  }

  reportCondition(
    transport: NearbyTransport,
    condition: NearbyTransportCondition
  ): void {
    const endpoint = this.#externalEndpoint(transport);
    this.#assertNotDisposed(endpoint);
    if (!TRANSPORT_CONDITIONS.includes(condition)) {
      throw fixedError('INVALID_CONFIGURATION');
    }
    if (endpoint.state === 'terminal') return;
    if (
      endpoint.role === 'guest' &&
      endpoint.record?.active &&
      ['disposed', 'terminal'].includes(endpoint.record.host.state)
    ) {
      return;
    }
    const generation = endpoint.advanceGeneration();
    const hostedRecord = this.#activeHostedRecord(endpoint);
    if (condition === 'local-network-permission-denied') {
      this.#reportTerminalCondition(endpoint, condition);
      return;
    }
    const preparedHostedGuests = hostedRecord
      ? this.#prepareHostedCondition(endpoint, hostedRecord)
      : [];
    const guestHost = this.#prepareGuestCondition(endpoint);
    this.#emit(endpoint, { kind: 'transport-condition', condition });
    if (hostedRecord) {
      this.#emitCommittedConnectionState(endpoint, 'reconnecting');
      this.#interruptPendingGuests(
        hostedRecord,
        'connection-interrupted',
        condition
      );
      this.#reportConditionToHostedGuests(
        endpoint,
        hostedRecord,
        condition,
        preparedHostedGuests
      );
      return;
    }
    if (guestHost) {
      this.#emitCommittedConnectionState(endpoint, 'reconnecting');
      this.#emitCommittedConnectionState(guestHost, 'reconnecting');
      return;
    }
    endpoint.finishRecoverableCondition(
      generation,
      () => this.#terminateForCondition(endpoint, condition),
      this.#refreshHostState
    );
  }

  #reportTerminalCondition(
    endpoint: Endpoint,
    condition: 'local-network-permission-denied'
  ): void {
    const terminalCommitted = this.#commitTerminal(endpoint);
    this.#emit(endpoint, { kind: 'transport-condition', condition });
    if (endpoint.state === 'disposed') return;
    this.#terminateForCondition(endpoint, condition);
    if (terminalCommitted) this.#emitCommittedTerminal(endpoint, condition);
  }

  #activeHostedRecord(endpoint: Endpoint): HostRecord | null {
    return endpoint.activeHostedRecord();
  }

  #reportConditionToHostedGuests(
    endpoint: Endpoint,
    hostedRecord: HostRecord,
    condition: NearbyTransportCondition,
    preparedGuests: readonly PreparedConditionRecipient[]
  ): void {
    for (const prepared of preparedGuests) {
      const guest = prepared.endpoint;
      if (
        !hostedRecord.active ||
        endpoint.record !== hostedRecord ||
        endpoint.state !== 'reconnecting'
      ) {
        break;
      }
      if (
        hostedRecord.guests.get(prepared.participantId) !== guest ||
        guest.record !== hostedRecord ||
        guest.role !== 'guest' ||
        guest.operationGeneration !== prepared.generation ||
        guest.state !== 'reconnecting'
      ) {
        continue;
      }
      this.#emit(guest, { kind: 'transport-condition', condition });
      if (
        !hostedRecord.active ||
        endpoint.record !== hostedRecord ||
        endpoint.state !== 'reconnecting'
      ) {
        break;
      }
      if (
        guest.operationGeneration !== prepared.generation ||
        guest.record !== hostedRecord ||
        guest.role !== 'guest' ||
        guest.state !== 'reconnecting'
      ) {
        continue;
      }
      this.#emitCommittedConnectionState(guest, 'reconnecting');
    }
  }

  #prepareHostedCondition(
    endpoint: Endpoint,
    hostedRecord: HostRecord
  ): readonly PreparedConditionRecipient[] {
    return endpoint.prepareHostedCondition(hostedRecord, () => {
      const prepared: PreparedConditionRecipient[] = [];
      for (const [participantId, guest] of hostedRecord.guests) {
        if (
          guest.record !== hostedRecord ||
          guest.role !== 'guest' ||
          ['disposed', 'terminal'].includes(guest.state)
        ) {
          continue;
        }
        const guestGeneration = guest.advanceGeneration();
        guest.setPhase('reconnecting');
        prepared.push({
          endpoint: guest,
          participantId,
          generation: guestGeneration,
        });
      }
      return prepared;
    });
  }

  #prepareGuestCondition(endpoint: Endpoint): Endpoint | null {
    return endpoint.prepareGuestCondition((record) => record.host);
  }

  async host(
    transport: LoopbackNearbyTransport,
    policy: NearbyHostInvitePolicy
  ): Promise<LoungeInvite> {
    const endpoint = this.#endpoint(transport);
    this.#assertNotDisposed(endpoint);
    const validationGeneration = endpoint.operationGeneration;
    const validatedPolicy = validateNearbyHostPolicy(policy);
    this.#assertValidationActive(endpoint, validationGeneration);
    const existing = this.#existingHostRecord(endpoint);
    const generation = endpoint.advanceGeneration();
    const binding = existing?.binding ?? this.#newBinding();
    const candidate = await this.#issueAuthorization(validatedPolicy, binding);
    this.#assertHostOperationActive(endpoint, generation, candidate);
    const invite = existing
      ? this.#replaceHostAuthorization(
          endpoint,
          existing,
          validatedPolicy,
          candidate,
          generation
        )
      : this.#registerHost(endpoint, validatedPolicy, binding, candidate);
    this.#assertHostCompletionActive(endpoint, generation);
    return invite;
  }

  #assertHostOperationActive(
    endpoint: Endpoint,
    generation: number,
    candidate: ValidatedAuthorization
  ): void {
    if (endpoint.state === 'disposed') {
      disposeAuthorization(candidate.stored);
      throw fixedError('DISPOSED');
    }
    if (endpoint.operationGeneration !== generation) {
      disposeAuthorization(candidate.stored);
      throw fixedError('CONNECTION_INTERRUPTED');
    }
  }

  #existingHostRecord(endpoint: Endpoint): HostRecord | null {
    const existing = endpoint.record;
    if (!existing) {
      if (endpoint.state !== 'idle') throw fixedError('INVALID_STATE');
      return null;
    }
    if (
      endpoint.role !== 'host' ||
      !existing.active ||
      !['hosting', 'connected', 'reconnecting'].includes(endpoint.state)
    ) {
      throw fixedError('INVALID_STATE');
    }
    return existing;
  }

  #replaceHostAuthorization(
    endpoint: Endpoint,
    existing: HostRecord,
    policy: NearbyHostInvitePolicy,
    candidate: ValidatedAuthorization,
    generation: number
  ): LoungeInvite {
    if (
      policy.hostParticipantId !== existing.hostParticipantId ||
      candidate.invite.loungeId !== existing.loungeId ||
      candidate.invite.capacity !== existing.capacity
    ) {
      disposeAuthorization(candidate.stored);
      throw fixedError('INVALID_CONFIGURATION');
    }
    if (!disposeAuthorization(existing.authorization)) {
      disposeAuthorization(candidate.stored);
      this.#endHost(existing, 'connection-interrupted', false);
      throw fixedError('CONNECTION_INTERRUPTED');
    }
    this.#assertHostReplacementActive(
      endpoint,
      existing,
      generation,
      candidate
    );
    this.#interruptPendingGuests(existing, 'connection-interrupted');
    this.#assertHostReplacementActive(
      endpoint,
      existing,
      generation,
      candidate
    );
    existing.authorization = candidate.stored;
    existing.descriptor = createNearbyJoinDescriptor(candidate.invite);
    if (endpoint.state === 'reconnecting') this.#refreshHostState(existing);
    return candidate.invite;
  }

  #assertHostReplacementActive(
    endpoint: Endpoint,
    existing: HostRecord,
    generation: number,
    candidate: ValidatedAuthorization
  ): void {
    try {
      if (
        !existing.active ||
        endpoint.record !== existing ||
        endpoint.role !== 'host' ||
        !['hosting', 'connected', 'reconnecting'].includes(endpoint.state)
      ) {
        disposeAuthorization(candidate.stored);
        throw fixedError(
          endpoint.state === 'disposed' ? 'DISPOSED' : 'CONNECTION_INTERRUPTED'
        );
      }
      this.#assertHostOperationActive(endpoint, generation, candidate);
    } catch (error: unknown) {
      if (existing.active && endpoint.record === existing) {
        this.#endHost(existing, 'connection-interrupted', false);
      }
      throw error;
    }
  }

  #assertHostCompletionActive(endpoint: Endpoint, generation: number): void {
    if (endpoint.state === 'disposed') throw fixedError('DISPOSED');
    if (
      endpoint.operationGeneration !== generation ||
      endpoint.role !== 'host' ||
      !endpoint.record?.active
    ) {
      throw fixedError('CONNECTION_INTERRUPTED');
    }
  }

  #registerHost(
    endpoint: Endpoint,
    policy: NearbyHostInvitePolicy,
    binding: NearbyHostBinding,
    candidate: ValidatedAuthorization
  ): LoungeInvite {
    const record = new HostMembership(
      endpoint,
      binding,
      policy.hostParticipantId,
      candidate.invite.loungeId,
      candidate.invite.capacity,
      createNearbyJoinDescriptor(candidate.invite),
      candidate.stored
    );
    this.#hostsByHint.set(binding.hostDiscoveryHint, record);
    endpoint.attachHost(record, {
      kind: 'authenticated',
      loungeId: record.loungeId,
      participantId: record.hostParticipantId,
    });
    this.#registeredEndpoints.add(endpoint);
    this.#setState(endpoint, 'hosting');
    return candidate.invite;
  }

  async join(
    transport: LoopbackNearbyTransport,
    candidateInput: NearbyJoinInput
  ): Promise<void> {
    const endpoint = this.#endpoint(transport);
    if (endpoint.state === 'disposed') {
      return Promise.reject(fixedError('DISPOSED'));
    }
    const validationGeneration = endpoint.operationGeneration;
    const input = validateNearbyJoinInput(candidateInput);
    this.#assertValidationActive(endpoint, validationGeneration);
    const resolved = this.#resolveJoin(endpoint, input);
    const { record, authorization, reconnecting } = resolved;
    const generation = endpoint.advanceGeneration();
    try {
      this.#setState(endpoint, reconnecting ? 'reconnecting' : 'joining');
      this.#assertJoinActive(endpoint, record, authorization, generation);
      const identity = await this.#authorizeJoinIdentity(
        endpoint,
        record,
        authorization,
        input,
        reconnecting,
        generation
      );
      await this.#waitForReady(
        endpoint,
        record,
        authorization,
        input,
        identity,
        generation
      );
      this.#assertJoinActive(endpoint, record, authorization, generation);
      this.#completeJoin(endpoint, record, identity, reconnecting);
    } finally {
      endpoint.joinInFlight = false;
      this.#releasePendingReservation(endpoint);
    }
  }

  #resolveJoin(
    endpoint: Endpoint,
    input: ValidatedNearbyJoinInput
  ): ResolvedJoin {
    const { invite } = input;
    const record = this.#hostsByHint.get(invite.hostDiscoveryHint);
    if (!record?.active) throw fixedError('HOST_NOT_FOUND');
    if (invite.transportFingerprint !== record.binding.transportFingerprint) {
      throw fixedError('TRANSPORT_FINGERPRINT_MISMATCH');
    }
    const reconnecting = this.#isReconnecting(
      record,
      endpoint,
      input.participantId
    );
    if (
      invite.loungeId !== record.loungeId ||
      invite.capacity !== record.capacity ||
      (!reconnecting && !nearbyJoinDescriptorsMatch(invite, record.descriptor))
    ) {
      throw fixedError('INVALID_CONFIGURATION');
    }
    this.#reserveJoin(record, endpoint, input.participantId, reconnecting);
    return {
      record,
      authorization: record.authorization,
      reconnecting,
    };
  }

  #reserveJoin(
    record: HostRecord,
    endpoint: Endpoint,
    participantId: ParticipantId,
    reconnecting: boolean
  ): void {
    record.reserve(endpoint, participantId, reconnecting);
  }

  #isReconnecting(
    record: HostRecord,
    endpoint: Endpoint,
    participantId: ParticipantId
  ): boolean {
    return (
      record.guests.get(participantId) === endpoint &&
      endpoint.record === record &&
      endpoint.identity?.participantId === participantId
    );
  }

  async #authorizeJoinIdentity(
    endpoint: Endpoint,
    record: HostRecord,
    authorization: StoredHostAuthorization,
    input: ValidatedNearbyJoinInput,
    reconnecting: boolean,
    generation: number
  ): Promise<AuthenticatedTransportIdentity> {
    if (reconnecting) {
      return record.reconnectIdentity(endpoint, input.participantId);
    }
    let candidateIdentity: unknown;
    try {
      candidateIdentity = await authorization.authorizeJoin(
        input.rawJoinRequest,
        record.binding.transportFingerprint
      );
    } catch {
      this.#assertJoinActive(endpoint, record, authorization, generation);
      this.#setState(endpoint, 'terminal', 'connection-interrupted');
      throw fixedError('AUTHORIZATION_FAILED');
    }
    this.#assertJoinActive(endpoint, record, authorization, generation);
    let identity: AuthenticatedTransportIdentity;
    try {
      identity = validateAuthenticatedTransportIdentity(
        candidateIdentity,
        record.loungeId,
        input.participantId
      );
    } catch {
      this.#assertJoinActive(endpoint, record, authorization, generation);
      this.#setState(endpoint, 'terminal', 'connection-interrupted');
      throw fixedError('AUTHENTICATION_MISMATCH');
    }
    this.#assertJoinActive(endpoint, record, authorization, generation);
    return identity;
  }

  async #waitForReady(
    endpoint: Endpoint,
    record: HostRecord,
    authorization: StoredHostAuthorization,
    input: ValidatedNearbyJoinInput,
    identity: AuthenticatedTransportIdentity,
    generation: number
  ): Promise<void> {
    try {
      await Promise.all([
        authorization.waitUntilReady(Object.freeze({ ...identity })),
        input.waitUntilReady(),
      ]);
    } catch {
      this.#assertJoinActive(endpoint, record, authorization, generation);
      this.#setState(endpoint, 'terminal', 'ready-rejected');
      throw fixedError('READY_REJECTED');
    }
    this.#assertJoinActive(endpoint, record, authorization, generation);
  }

  #assertJoinActive(
    endpoint: Endpoint,
    record: HostRecord,
    authorization: StoredHostAuthorization,
    generation: number
  ): void {
    endpoint.assertJoinActive(record, authorization, generation, (reason) =>
      this.#setState(endpoint, 'terminal', reason)
    );
  }

  #completeJoin(
    endpoint: Endpoint,
    record: HostRecord,
    identity: AuthenticatedTransportIdentity,
    reconnecting: boolean
  ): void {
    if (!reconnecting) {
      record.commit(endpoint, identity);
      this.#registeredEndpoints.add(endpoint);
    }
    const previousHostState = record.host.state;
    endpoint.setPhase('connected');
    const nextHostState = this.#nextHostState(record);
    record.host.setPhase(nextHostState);
    if (!reconnecting) {
      this.#broadcastMembership(record, 'joined', identity);
      this.#assertJoinedMembershipActive(endpoint, record, identity);
    }
    this.#emit(endpoint, {
      kind: 'connection-state-changed',
      state: 'connected',
    });
    this.#assertJoinedMembershipActive(endpoint, record, identity);
    if (previousHostState !== nextHostState) {
      this.#emit(record.host, {
        kind: 'connection-state-changed',
        state: nextHostState,
      });
      this.#assertJoinedMembershipActive(endpoint, record, identity);
    }
  }

  #assertJoinedMembershipActive(
    endpoint: Endpoint,
    record: HostRecord,
    identity: AuthenticatedTransportIdentity
  ): void {
    if (endpoint.state === 'disposed') throw fixedError('DISPOSED');
    if (
      !record.active ||
      endpoint.state !== 'connected' ||
      endpoint.record !== record ||
      endpoint.identity?.participantId !== identity.participantId ||
      record.guests.get(identity.participantId) !== endpoint
    ) {
      throw fixedError('CONNECTION_INTERRUPTED');
    }
  }

  send(
    transport: LoopbackNearbyTransport,
    envelope: NearbyOutboundEnvelope
  ): Promise<void> {
    const endpoint = this.#endpoint(transport);
    const initialStateError = this.#sendStateError(endpoint);
    if (initialStateError) return Promise.reject(initialStateError);
    const validationGeneration = endpoint.operationGeneration;
    let validated: ValidatedNearbyEnvelope;
    try {
      validated = validateNearbyEnvelope(envelope);
    } catch (error: unknown) {
      return Promise.reject(
        error instanceof NearbyTransportError
          ? error
          : fixedError('INVALID_ENVELOPE')
      );
    }
    const validatedStateError = this.#sendStateError(
      endpoint,
      validationGeneration
    );
    if (validatedStateError) return Promise.reject(validatedStateError);
    if (
      validated.envelope.delivery.kind === 'target' &&
      !this.#targetEndpoint(
        endpoint.record,
        validated.envelope.delivery.participantId,
        endpoint
      )
    ) {
      return Promise.reject(fixedError('TARGET_NOT_FOUND'));
    }
    if (endpoint.deliveries.isFull) {
      return Promise.reject(fixedError('QUEUE_LIMIT_EXCEEDED'));
    }
    try {
      this.#charge(endpoint, validated.bytes);
    } catch (error: unknown) {
      return Promise.reject(
        error instanceof NearbyTransportError
          ? error
          : fixedError('DELIVERY_FAILED')
      );
    }
    const pending = endpoint.deliveries.enqueue(validated.envelope);
    this.#scheduleDrain(endpoint);
    return pending;
  }

  #sendStateError(
    endpoint: Endpoint,
    expectedGeneration?: number
  ): NearbyTransportError | null {
    if (endpoint.state === 'disposed') return fixedError('DISPOSED');
    if (
      expectedGeneration !== undefined &&
      endpoint.operationGeneration !== expectedGeneration
    ) {
      return fixedError('CONNECTION_INTERRUPTED');
    }
    if (
      endpoint.state !== 'connected' ||
      !endpoint.record?.active ||
      endpoint.record.host.state !== 'connected'
    ) {
      return fixedError('NOT_READY');
    }
    return null;
  }

  leave(
    transport: LoopbackNearbyTransport,
    reason: NearbyTransportLeaveReason
  ): Promise<void> {
    const endpoint = this.#endpoint(transport);
    if (endpoint.state === 'disposed') {
      return Promise.reject(fixedError('DISPOSED'));
    }
    if (!LEAVE_REASONS.includes(reason)) {
      return Promise.reject(fixedError('INVALID_CONFIGURATION'));
    }
    if (!endpoint.record?.active || !endpoint.role) {
      return Promise.reject(fixedError('INVALID_STATE'));
    }
    endpoint.advanceGeneration();
    this.#rejectQueue(endpoint, 'CONNECTION_INTERRUPTED');
    if (endpoint.role === 'host') {
      const cleanupSucceeded = this.#endHost(endpoint.record, reason, false);
      return cleanupSucceeded
        ? Promise.resolve()
        : Promise.reject(fixedError('CONNECTION_INTERRUPTED'));
    }
    this.#removeGuest(endpoint.record, endpoint, reason);
    return Promise.resolve();
  }

  subscribe(
    transport: LoopbackNearbyTransport,
    listener: NearbyTransportEventListener
  ): () => void {
    const endpoint = this.#endpoint(transport);
    this.#assertNotDisposed(endpoint);
    if (typeof listener !== 'function') {
      throw fixedError('INVALID_CONFIGURATION');
    }
    if (endpoint.listeners.size >= NEARBY_TRANSPORT_MAX_LISTENERS) {
      throw fixedError('LISTENER_LIMIT_EXCEEDED');
    }
    endpoint.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      endpoint.listeners.delete(listener);
    };
  }

  async dispose(transport: LoopbackNearbyTransport): Promise<void> {
    const endpoint = this.#endpoint(transport);
    if (endpoint.state === 'disposed') return;
    endpoint.advanceGeneration();
    this.#rejectQueue(endpoint, 'DISPOSED');
    this.#releasePendingReservation(endpoint);
    let cleanupSucceeded = true;
    if (endpoint.record?.active && endpoint.role === 'host') {
      cleanupSucceeded = this.#endHost(endpoint.record, 'host-ended', true);
    } else if (endpoint.record?.active && endpoint.role === 'guest') {
      this.#removeGuest(endpoint.record, endpoint, 'owner-left');
    }
    this.#registeredEndpoints.delete(endpoint);
    endpoint.resetAffiliation();
    endpoint.rateCharges.length = 0;
    this.#setState(endpoint, 'disposed');
    endpoint.listeners.clear();
    if (!cleanupSucceeded) throw fixedError('CONNECTION_INTERRUPTED');
  }

  #endpoint(transport: LoopbackNearbyTransport): Endpoint {
    const endpoint = this.#endpoints.get(transport);
    if (!endpoint) {
      throw fixedError('INVALID_CONFIGURATION');
    }
    return endpoint;
  }

  #externalEndpoint(transport: NearbyTransport): Endpoint {
    if (!(transport instanceof LoopbackNearbyTransport)) {
      throw fixedError('INVALID_CONFIGURATION');
    }
    return this.#endpoint(transport);
  }

  #assertNotDisposed(endpoint: Endpoint): void {
    if (endpoint.state === 'disposed') throw fixedError('DISPOSED');
  }

  #assertValidationActive(
    endpoint: Endpoint,
    expectedGeneration: number
  ): void {
    if (endpoint.state === 'disposed') throw fixedError('DISPOSED');
    if (endpoint.operationGeneration !== expectedGeneration) {
      throw fixedError('CONNECTION_INTERRUPTED');
    }
  }

  #newBinding(): NearbyHostBinding {
    const bindingId = this.#nextBindingId;
    this.#nextBindingId += 1;
    const hostDiscoveryHint = `loopback-ref://${bindingId}`;
    const digest = sha256(
      new TextEncoder().encode(
        `${LOOPBACK_REFERENCE_ADAPTER_LABEL}/${bindingId}`
      )
    );
    return validateNearbyHostBinding({
      hostDiscoveryHint,
      transportFingerprint: `sha256_${bytesToHex(digest)}`,
    });
  }

  async #issueAuthorization(
    policy: NearbyHostInvitePolicy,
    binding: NearbyHostBinding
  ): Promise<ValidatedAuthorization> {
    let issued: unknown;
    try {
      issued = await policy.issueInvite(Object.freeze({ ...binding }));
    } catch {
      throw fixedError('INVALID_CONFIGURATION');
    }
    const validated = validateNearbyHostAuthorization(issued, binding);
    const { invite, ...stored } = validated;
    return { invite, stored };
  }

  #charge(endpoint: Endpoint, bytes: number): void {
    const now = performance.now();
    while (
      endpoint.rateCharges[0] &&
      now - endpoint.rateCharges[0].chargedAtMonotonicMs >=
        NEARBY_TRANSPORT_RATE_WINDOW_MS
    ) {
      endpoint.rateCharges.shift();
    }
    if (endpoint.rateCharges.length >= NEARBY_TRANSPORT_MAX_SENDS_PER_WINDOW) {
      throw fixedError('RATE_LIMIT_EXCEEDED');
    }
    const recentBytes = endpoint.rateCharges.reduce(
      (total, charge) => total + charge.bytes,
      0
    );
    if (recentBytes + bytes > NEARBY_TRANSPORT_MAX_BYTES_PER_WINDOW) {
      throw fixedError('BYTE_RATE_LIMIT_EXCEEDED');
    }
    endpoint.rateCharges.push({ chargedAtMonotonicMs: now, bytes });
  }

  #scheduleDrain(endpoint: Endpoint): void {
    if (endpoint.drainScheduled) return;
    endpoint.drainScheduled = true;
    queueMicrotask(() => this.#drain(endpoint));
  }

  #drain(endpoint: Endpoint): void {
    endpoint.drainScheduled = false;
    for (;;) {
      const lease = endpoint.deliveries.takeNext({
        phase: endpoint.state,
        membership: endpoint.record,
        identity: endpoint.identity,
      });
      if (lease === undefined) break;
      try {
        this.#route(endpoint, lease.envelope, lease.membership, lease.identity);
        lease.succeed();
      } catch {
        lease.fail();
      }
    }
  }

  #route(
    endpoint: Endpoint,
    envelope: NearbyOutboundEnvelope,
    record: HostRecord,
    identity: AuthenticatedTransportIdentity
  ): void {
    const recipients = this.#routeRecipients(record, endpoint, envelope);
    for (const recipient of recipients) {
      this.#assertRouteActive(record, endpoint, recipient);
      this.#emit(recipient, {
        kind: 'envelope-received',
        envelope: {
          delivery: cloneDelivery(envelope.delivery),
          payload: envelope.payload,
          transportAuthentication: { ...identity },
        },
      });
      if (!record.active || record.host.state !== 'connected') {
        throw fixedError('CONNECTION_INTERRUPTED');
      }
    }
  }

  #routeRecipients(
    record: HostRecord,
    endpoint: Endpoint,
    envelope: NearbyOutboundEnvelope
  ): readonly Endpoint[] {
    const recipients: Endpoint[] = [];
    if (envelope.delivery.kind === 'target') {
      const target = this.#targetEndpoint(
        record,
        envelope.delivery.participantId,
        endpoint
      );
      if (!target) throw fixedError('TARGET_NOT_FOUND');
      recipients.push(target);
    } else if (endpoint.role === 'host') {
      recipients.push(
        ...[...record.guests.values()].filter(
          (guest) => guest.state === 'connected'
        )
      );
    } else {
      if (record.host.state === 'connected') recipients.push(record.host);
      recipients.push(
        ...[...record.guests.values()].filter(
          (guest) => guest !== endpoint && guest.state === 'connected'
        )
      );
    }
    return recipients;
  }

  #assertRouteActive(
    record: HostRecord,
    endpoint: Endpoint,
    recipient: Endpoint
  ): void {
    if (
      !record.active ||
      record.host.state !== 'connected' ||
      endpoint.state !== 'connected' ||
      endpoint.record !== record ||
      recipient.state !== 'connected' ||
      recipient.record !== record
    ) {
      throw fixedError('CONNECTION_INTERRUPTED');
    }
  }

  #targetEndpoint(
    record: HostRecord | null,
    participantId: ParticipantId,
    sender: Endpoint
  ): Endpoint | null {
    if (!record?.active) return null;
    const target =
      participantId === record.hostParticipantId
        ? record.host
        : record.guests.get(participantId);
    return target && target !== sender && target.state === 'connected'
      ? target
      : null;
  }

  #removeGuest(
    record: HostRecord,
    endpoint: Endpoint,
    reason: NearbyTransportTerminalReason
  ): void {
    record.depart(endpoint, reason, {
      unregister: (departing) => {
        this.#registeredEndpoints.delete(departing);
      },
      broadcast: (identity) =>
        this.#broadcastMembership(record, 'left', identity, endpoint),
      terminal: (departing, terminalReason) =>
        this.#emitCommittedTerminal(departing, terminalReason),
      refresh: () => this.#refreshHostState(record),
    });
  }

  #endHost(
    record: HostRecord,
    hostReason: NearbyTransportTerminalReason,
    hostDisposing: boolean
  ): boolean {
    if (!record.deactivate()) return true;
    this.#hostsByHint.delete(record.binding.hostDiscoveryHint);
    const pendingGuests = [...new Set(record.pendingGuests.values())];
    const guests = [...record.guests.values()];
    const committedPendingGuests: Endpoint[] = [];
    const committedGuests: Endpoint[] = [];
    const hostTerminalCommitted = this.#commitTerminal(record.host);
    for (const pendingGuest of pendingGuests) {
      pendingGuest.advanceGeneration();
      this.#rejectQueue(pendingGuest, 'CONNECTION_INTERRUPTED');
      this.#releasePendingReservation(pendingGuest);
      if (this.#commitTerminal(pendingGuest)) {
        committedPendingGuests.push(pendingGuest);
      }
    }
    for (const guest of guests) {
      guest.advanceGeneration();
      this.#rejectQueue(guest, 'CONNECTION_INTERRUPTED');
      this.#registeredEndpoints.delete(guest);
      guest.detachPreservingIdentity();
      if (this.#commitTerminal(guest)) committedGuests.push(guest);
    }
    record.clearMembers();
    this.#registeredEndpoints.delete(record.host);
    record.host.detachPreservingIdentity();
    const cleanupSucceeded = disposeAuthorization(record.authorization);
    for (const pendingGuest of committedPendingGuests) {
      this.#emitCommittedTerminal(pendingGuest, 'host-ended');
    }
    for (const guest of committedGuests) {
      this.#emitCommittedTerminal(guest, 'host-ended');
    }
    for (const guest of guests) {
      guest.clearIdentity();
    }
    if (!hostDisposing && hostTerminalCommitted) {
      this.#emitCommittedTerminal(record.host, hostReason);
    }
    record.host.clearIdentity();
    return cleanupSucceeded;
  }

  #terminateForCondition(
    endpoint: Endpoint,
    condition: NearbyTransportCondition
  ): void {
    this.#rejectQueue(endpoint, 'CONNECTION_INTERRUPTED');
    this.#releasePendingReservation(endpoint);
    if (endpoint.record?.active && endpoint.role === 'host') {
      this.#endHost(endpoint.record, condition, false);
      return;
    }
    if (endpoint.record?.active && endpoint.role === 'guest') {
      this.#removeGuest(endpoint.record, endpoint, condition);
      return;
    }
    this.#setState(endpoint, 'terminal', condition);
  }

  #participantIds(record: HostRecord): readonly ParticipantId[] {
    return [record.hostParticipantId, ...record.guests.keys()].sort();
  }

  #releasePendingReservation(endpoint: Endpoint): void {
    const reservation = endpoint.pendingReservation;
    if (!reservation) return;
    if (
      reservation.record.pendingGuests.get(reservation.participantId) ===
      endpoint
    ) {
      reservation.record.releaseReservation(
        reservation.participantId,
        endpoint
      );
    }
    endpoint.releaseReservation();
  }

  #interruptPendingGuests(
    record: HostRecord,
    reason: 'connection-interrupted' | 'host-ended',
    condition?: NearbyTransportCondition
  ): void {
    for (const pendingGuest of [...record.pendingGuests.values()]) {
      const reservation = pendingGuest.pendingReservation;
      if (
        ['disposed', 'terminal'].includes(pendingGuest.state) ||
        reservation?.record !== record ||
        record.pendingGuests.get(reservation.participantId) !== pendingGuest ||
        (reason === 'connection-interrupted' && !record.active)
      ) {
        continue;
      }
      const guestGeneration = pendingGuest.advanceGeneration();
      if (condition) {
        this.#emit(pendingGuest, { kind: 'transport-condition', condition });
      }
      if (
        pendingGuest.operationGeneration !== guestGeneration ||
        ['disposed', 'terminal'].includes(pendingGuest.state) ||
        pendingGuest.pendingReservation !== reservation ||
        record.pendingGuests.get(reservation.participantId) !== pendingGuest ||
        (reason === 'connection-interrupted' && !record.active)
      ) {
        continue;
      }
      this.#rejectQueue(pendingGuest, 'CONNECTION_INTERRUPTED');
      this.#releasePendingReservation(pendingGuest);
      this.#setState(pendingGuest, 'terminal', reason);
    }
  }

  readonly #refreshHostState = (record: HostRecord): void => {
    if (
      !record.active ||
      ['disposed', 'terminal'].includes(record.host.state)
    ) {
      return;
    }
    const nextState = this.#nextHostState(record);
    if (record.host.state !== nextState) {
      this.#setState(record.host, nextState);
    }
  };

  #nextHostState(record: HostRecord): 'hosting' | 'connected' | 'reconnecting' {
    if (record.guests.size === 0) return 'hosting';
    return [...record.guests.values()].every(
      (guest) => guest.state === 'connected'
    )
      ? 'connected'
      : 'reconnecting';
  }

  #broadcastMembership(
    record: HostRecord,
    change: 'joined' | 'left',
    identity: AuthenticatedTransportIdentity,
    departing?: Endpoint
  ): void {
    const event: NearbyMembershipEvent = {
      kind: 'membership-changed',
      change,
      identity: { ...identity },
      participantIds: this.#participantIds(record),
    };
    this.#membershipBroadcastQueue.push({
      record,
      event,
      recipients: [
        record.host,
        ...record.guests.values(),
        ...(departing ? [departing] : []),
      ],
      ...(departing ? { departing } : {}),
    });
    if (this.#dispatchingMembershipBroadcast) return;
    this.#dispatchingMembershipBroadcast = true;
    try {
      let pending = this.#membershipBroadcastQueue.shift();
      while (pending) {
        for (const recipient of pending.recipients) {
          if (!pending.record.active) break;
          if (!this.#isMembershipRecipientActive(pending, recipient)) continue;
          this.#emit(recipient, pending.event);
        }
        pending = this.#membershipBroadcastQueue.shift();
      }
    } finally {
      this.#dispatchingMembershipBroadcast = false;
    }
  }

  #isMembershipRecipientActive(
    pending: MembershipBroadcast,
    recipient: Endpoint
  ): boolean {
    if (recipient === pending.record.host) {
      return (
        recipient.record === pending.record &&
        recipient.role === 'host' &&
        !['disposed', 'terminal'].includes(recipient.state)
      );
    }
    if (recipient === pending.departing) {
      return (
        pending.event.change === 'left' &&
        recipient.state !== 'disposed' &&
        recipient.identity?.participantId ===
          pending.event.identity.participantId
      );
    }
    const participantId = recipient.identity?.participantId;
    return (
      recipient.record === pending.record &&
      recipient.role === 'guest' &&
      participantId !== undefined &&
      pending.record.guests.get(participantId) === recipient &&
      !['disposed', 'terminal'].includes(recipient.state)
    );
  }

  #rejectQueue(endpoint: Endpoint, code: NearbyTransportErrorCode): void {
    endpoint.deliveries.invalidate(code);
    endpoint.drainScheduled = false;
  }

  #commitTerminal(endpoint: Endpoint): boolean {
    return endpoint.commitTerminal();
  }

  #emitCommittedTerminal(
    endpoint: Endpoint,
    reason: NearbyTransportTerminalReason
  ): void {
    endpoint.announceCommittedState('terminal', reason);
  }

  #emitCommittedConnectionState(
    endpoint: Endpoint,
    state: NearbyTransportConnectionState
  ): void {
    endpoint.announceCommittedState(state);
  }

  #setState(
    endpoint: Endpoint,
    state: NearbyTransportConnectionState,
    reason?: NearbyTransportTerminalReason
  ): void {
    if (!endpoint.transition(state)) return;
    endpoint.announceCommittedState(state, reason);
  }

  #emit(endpoint: Endpoint, event: NearbyTransportEvent): void {
    const immutableEvent = immutableNearbyTransportEvent(event);
    const dispatchGeneration = endpoint.operationGeneration;
    for (const listener of [...endpoint.listeners]) {
      if (endpoint.operationGeneration !== dispatchGeneration) break;
      if (!endpoint.listeners.has(listener)) continue;
      try {
        listener(immutableEvent);
      } catch {
        // Observer failures cannot roll back transport state or block other observers.
      }
    }
  }
}

export function createLoopbackNearbyNetwork(): LoopbackNearbyNetwork {
  return new LoopbackNearbyNetwork();
}
