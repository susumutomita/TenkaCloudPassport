import type { ParticipantId } from '../domain/session-identifiers';
import {
  type NearbyTransportConnectionState,
  NearbyTransportError,
  type NearbyTransportTerminalReason,
} from '../ports/nearby-transport';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';

interface Session {
  readonly active: boolean;
  readonly authorization: unknown;
}

type Affiliation<Record> =
  | {
      readonly kind: 'detached';
      readonly identity: AuthenticatedTransportIdentity | null;
    }
  | {
      readonly kind: 'host' | 'guest';
      readonly record: Record;
      readonly identity: AuthenticatedTransportIdentity;
    };

/** Own endpoint lifetime and atomic affiliation; event dispatch remains in the network. */
export class EndpointLifecycle<Record extends Session> {
  #state: NearbyTransportConnectionState = 'idle';
  #generation = 0;
  #affiliation: Affiliation<Record> = { kind: 'detached', identity: null };
  #reservation: {
    readonly record: Record;
    readonly participantId: ParticipantId;
  } | null = null;

  readonly #announce: (
    state: NearbyTransportConnectionState,
    reason?: NearbyTransportTerminalReason
  ) => void;

  constructor(
    announce: (
      state: NearbyTransportConnectionState,
      reason?: NearbyTransportTerminalReason
    ) => void
  ) {
    this.#announce = announce;
  }

  announceCommittedState(
    state: NearbyTransportConnectionState,
    reason?: NearbyTransportTerminalReason
  ): void {
    if (this.#state !== state) return;
    this.#announce(state, reason);
  }

  get lifecycle(): this {
    return this;
  }
  get state(): NearbyTransportConnectionState {
    return this.#state;
  }
  get operationGeneration(): number {
    return this.#generation;
  }
  get role(): 'host' | 'guest' | null {
    return this.#affiliation.kind === 'detached'
      ? null
      : this.#affiliation.kind;
  }
  get record(): Record | null {
    return this.#affiliation.kind === 'detached'
      ? null
      : this.#affiliation.record;
  }
  get identity(): AuthenticatedTransportIdentity | null {
    return this.#affiliation.identity;
  }
  get pendingReservation() {
    return this.#reservation;
  }

  attachHost(record: Record, identity: AuthenticatedTransportIdentity): void {
    this.#affiliation = {
      kind: 'host',
      record,
      identity: Object.freeze({ ...identity }),
    };
  }
  attachGuest(record: Record, identity: AuthenticatedTransportIdentity): void {
    this.#affiliation = {
      kind: 'guest',
      record,
      identity: Object.freeze({ ...identity }),
    };
  }
  detachPreservingIdentity(): void {
    this.#affiliation = { kind: 'detached', identity: this.identity };
  }
  clearIdentity(): void {
    this.#affiliation = { kind: 'detached', identity: null };
  }
  resetAffiliation(): void {
    this.clearIdentity();
  }
  reserve(record: Record, participantId: ParticipantId): void {
    this.#reservation = Object.freeze({ record, participantId });
  }
  releaseReservation(): void {
    this.#reservation = null;
  }
  advanceGeneration(): number {
    this.#generation += 1;
    return this.#generation;
  }

  /** Internal committed phase changes occur before any corresponding callbacks. */
  setPhase(state: NearbyTransportConnectionState): void {
    this.#state = state;
  }
  transition(state: NearbyTransportConnectionState): boolean {
    if (
      (this.#state === 'disposed' && state !== 'disposed') ||
      (this.#state === 'terminal' && state !== 'disposed')
    )
      return false;
    this.#state = state;
    return true;
  }
  commitTerminal(): boolean {
    if (this.#state === 'disposed' || this.#state === 'terminal') return false;
    this.#state = 'terminal';
    return true;
  }

  activeHostedRecord(): Record | null {
    return this.#affiliation.kind === 'host' && this.#affiliation.record.active
      ? this.#affiliation.record
      : null;
  }

  prepareHostedCondition<T>(
    record: Record,
    prepareGuests: () => readonly T[]
  ): readonly T[] {
    if (
      this.record !== record ||
      !record.active ||
      this.#state === 'disposed' ||
      this.#state === 'terminal'
    )
      return [];
    this.#state = 'reconnecting';
    return prepareGuests();
  }

  prepareGuestCondition<
    Host extends { readonly lifecycle: EndpointLifecycle<Record> },
  >(hostFor: (record: Record) => Host): Host | null {
    const record = this.record;
    if (
      this.role !== 'guest' ||
      !record?.active ||
      this.#state === 'disposed' ||
      this.#state === 'terminal'
    )
      return null;
    this.#state = 'reconnecting';
    const host = hostFor(record);
    if (
      host.lifecycle.state === 'disposed' ||
      host.lifecycle.state === 'terminal'
    )
      return null;
    host.lifecycle.setPhase('reconnecting');
    return host;
  }

  finishRecoverableCondition(
    generation: number,
    terminatePending: () => void,
    refreshHost: (record: Record) => void
  ): void {
    if (
      this.#generation !== generation ||
      this.#state === 'disposed' ||
      this.#state === 'terminal'
    )
      return;
    if (this.#reservation) {
      terminatePending();
      return;
    }
    if (this.#state === 'idle' && this.role === null && this.record === null)
      return;
    this.#state = 'reconnecting';
    this.announceCommittedState('reconnecting');
    const record = this.record;
    if (this.role === 'guest' && record?.active) refreshHost(record);
  }

  assertJoinActive(
    record: Record,
    authorization: unknown,
    generation: number,
    terminate: (reason: NearbyTransportTerminalReason) => void
  ): void {
    if (this.#state === 'disposed') throw new NearbyTransportError('DISPOSED');
    if (this.#generation !== generation)
      throw new NearbyTransportError('CONNECTION_INTERRUPTED');
    if (!record.active) {
      if (this.#state !== 'terminal') terminate('host-ended');
      throw new NearbyTransportError('CONNECTION_INTERRUPTED');
    }
    if (
      record.authorization !== authorization ||
      (this.#state !== 'joining' && this.#state !== 'reconnecting')
    ) {
      if (this.#state !== 'terminal') terminate('connection-interrupted');
      throw new NearbyTransportError('CONNECTION_INTERRUPTED');
    }
  }
}
