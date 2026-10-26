import type { ParticipantId } from '../domain/session-identifiers';
import {
  type NearbyHostBinding,
  type NearbyJoinDescriptor,
  type NearbyTransportConnectionState,
  NearbyTransportError,
  type NearbyTransportTerminalReason,
} from '../ports/nearby-transport';
import type { ValidatedNearbyHostAuthorization } from '../ports/nearby-transport-validation';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';

export type StoredHostAuthorization = Omit<
  ValidatedNearbyHostAuthorization,
  'invite'
>;

export interface MembershipEndpoint<Endpoint> {
  readonly state: NearbyTransportConnectionState;
  readonly role: 'host' | 'guest' | null;
  readonly identity: AuthenticatedTransportIdentity | null;
  readonly record: HostMembership<Endpoint> | null;
  joinInFlight: boolean;
  readonly pendingReservation: {
    readonly record: HostMembership<Endpoint>;
    readonly participantId: ParticipantId;
  } | null;
  reserve(record: HostMembership<Endpoint>, participantId: ParticipantId): void;
  attachGuest(
    record: HostMembership<Endpoint>,
    identity: AuthenticatedTransportIdentity
  ): void;
  transition(state: NearbyTransportConnectionState): boolean;
  commitTerminal(): boolean;
  detachPreservingIdentity(): void;
  clearIdentity(): void;
}

interface DepartureEffects<Endpoint> {
  readonly unregister: (endpoint: Endpoint) => void;
  readonly broadcast: (identity: AuthenticatedTransportIdentity) => void;
  readonly terminal: (
    endpoint: Endpoint,
    reason: NearbyTransportTerminalReason
  ) => void;
  readonly refresh: () => void;
}

interface EndpointIndex<Endpoint> {
  readonly size: number;
  get(id: ParticipantId): Endpoint | undefined;
  [Symbol.iterator](): MapIterator<[ParticipantId, Endpoint]>;
  keys(): MapIterator<ParticipantId>;
  values(): MapIterator<Endpoint>;
}

function endpointIndex<Endpoint>(
  entries: Map<ParticipantId, Endpoint>
): EndpointIndex<Endpoint> {
  return Object.freeze({
    get size() {
      return entries.size;
    },
    get: (id: ParticipantId) => entries.get(id),
    [Symbol.iterator]: () => entries.entries(),
    keys: () => entries.keys(),
    values: () => entries.values(),
  });
}

/** Own one host's admission capacity and member/reservation indices. */
export class HostMembership<Endpoint> {
  readonly #members = new Map<ParticipantId, Endpoint>();
  readonly #pending = new Map<ParticipantId, Endpoint>();
  readonly guests = endpointIndex(this.#members);
  readonly pendingGuests = endpointIndex(this.#pending);
  #active = true;

  constructor(
    readonly host: Endpoint,
    readonly binding: NearbyHostBinding,
    readonly hostParticipantId: ParticipantId,
    readonly loungeId: AuthenticatedTransportIdentity['loungeId'],
    readonly capacity: number,
    public descriptor: NearbyJoinDescriptor,
    public authorization: StoredHostAuthorization
  ) {}

  get active(): boolean {
    return this.#active;
  }

  deactivate(): boolean {
    if (!this.#active) return false;
    this.#active = false;
    return true;
  }

  reserve(
    endpoint: Endpoint & MembershipEndpoint<Endpoint>,
    participantId: ParticipantId,
    reconnecting: boolean
  ): void {
    if (!this.#active) throw new NearbyTransportError('HOST_NOT_FOUND');
    if (endpoint.joinInFlight) throw new NearbyTransportError('INVALID_STATE');
    if (
      participantId === this.hostParticipantId ||
      this.#pending.has(participantId) ||
      (this.#members.has(participantId) && !reconnecting)
    )
      throw new NearbyTransportError('PARTICIPANT_IN_USE');
    if (!reconnecting && endpoint.state !== 'idle')
      throw new NearbyTransportError('INVALID_STATE');
    if (reconnecting && endpoint.state !== 'reconnecting')
      throw new NearbyTransportError('INVALID_STATE');
    if (reconnecting && this.#members.get(participantId) !== endpoint)
      throw new NearbyTransportError('INVALID_STATE');
    if (
      !reconnecting &&
      this.#members.size + this.#pending.size + 1 >= this.capacity
    )
      throw new NearbyTransportError('CAPACITY_EXCEEDED');
    endpoint.joinInFlight = true;
    if (!reconnecting) {
      this.#pending.set(participantId, endpoint);
      endpoint.reserve(this, participantId);
    }
  }

  commit(
    endpoint: Endpoint & MembershipEndpoint<Endpoint>,
    identity: AuthenticatedTransportIdentity
  ): void {
    const ownedIdentity = Object.freeze({ ...identity });
    if (
      !this.#active ||
      this.#pending.get(ownedIdentity.participantId) !== endpoint ||
      this.#members.has(ownedIdentity.participantId) ||
      this.#members.size + 1 >= this.capacity
    )
      throw new NearbyTransportError('CONNECTION_INTERRUPTED');
    this.#pending.delete(ownedIdentity.participantId);
    endpoint.attachGuest(this, ownedIdentity);
    this.#members.set(ownedIdentity.participantId, endpoint);
  }

  releaseReservation(
    participantId: ParticipantId,
    endpoint: Endpoint
  ): boolean {
    if (this.#pending.get(participantId) !== endpoint) return false;
    this.#pending.delete(participantId);
    return true;
  }

  reconnectIdentity(
    endpoint: Endpoint & MembershipEndpoint<Endpoint>,
    participantId: ParticipantId
  ): AuthenticatedTransportIdentity {
    const identity = endpoint.identity;
    if (
      !this.#active ||
      this.#members.get(participantId) !== endpoint ||
      endpoint.record !== this ||
      !identity ||
      identity.participantId !== participantId
    )
      throw new NearbyTransportError('AUTHENTICATION_MISMATCH');
    return Object.freeze({ ...identity });
  }

  depart(
    endpoint: Endpoint & MembershipEndpoint<Endpoint>,
    reason: NearbyTransportTerminalReason,
    effects: DepartureEffects<Endpoint>
  ): void {
    const identity = endpoint.identity;
    if (!identity || this.#members.get(identity.participantId) !== endpoint) {
      if (endpoint.transition('terminal')) effects.terminal(endpoint, reason);
      return;
    }
    this.#members.delete(identity.participantId);
    effects.unregister(endpoint);
    endpoint.detachPreservingIdentity();
    const terminalCommitted = endpoint.commitTerminal();
    effects.broadcast(identity);
    if (terminalCommitted) effects.terminal(endpoint, reason);
    endpoint.clearIdentity();
    effects.refresh();
  }

  clearMembers(): void {
    if (this.#active) throw new NearbyTransportError('INVALID_STATE');
    this.#members.clear();
  }
}
