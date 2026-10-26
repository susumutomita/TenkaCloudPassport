import {
  NEARBY_TRANSPORT_MAX_QUEUE_SIZE,
  type NearbyOutboundEnvelope,
  type NearbyTransportConnectionState,
  NearbyTransportError,
  type NearbyTransportErrorCode,
} from '../ports/nearby-transport';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';

interface PendingDelivery {
  readonly envelope: NearbyOutboundEnvelope;
  readonly resolve: () => void;
  readonly reject: (error: NearbyTransportError) => void;
}

export interface DeliveryObservation<
  Membership extends { readonly active: boolean },
> {
  readonly phase: NearbyTransportConnectionState;
  readonly membership: Membership | null;
  readonly identity: AuthenticatedTransportIdentity | null;
}

export interface DeliveryLease<Membership> {
  readonly envelope: NearbyOutboundEnvelope;
  readonly membership: Membership;
  readonly identity: AuthenticatedTransportIdentity;
  succeed(): boolean;
  fail(): boolean;
}

function immutableEnvelope(
  envelope: NearbyOutboundEnvelope
): NearbyOutboundEnvelope {
  const sourceDelivery = envelope.delivery;
  const delivery =
    sourceDelivery.kind === 'broadcast'
      ? Object.freeze({ kind: 'broadcast' as const })
      : Object.freeze({
          kind: 'target' as const,
          participantId: sourceDelivery.participantId,
        });
  return Object.freeze({ delivery, payload: envelope.payload });
}

function leaseDelivery<Membership>(
  delivery: PendingDelivery,
  membership: Membership,
  identity: AuthenticatedTransportIdentity
): DeliveryLease<Membership> {
  let settled = false;
  function settle(failed: boolean): boolean {
    if (settled) return false;
    settled = true;
    if (failed) delivery.reject(new NearbyTransportError('DELIVERY_FAILED'));
    else delivery.resolve();
    return true;
  }
  return Object.freeze({
    envelope: delivery.envelope,
    membership,
    identity: Object.freeze({ ...identity }),
    succeed: () => settle(false),
    fail: () => settle(true),
  });
}

/** Own queued entries until transfer, and settle each transferred lease once. */
export class PendingDeliveries<
  Membership extends { readonly active: boolean },
> {
  readonly #entries: PendingDelivery[] = [];

  get size(): number {
    return this.#entries.length;
  }
  get isFull(): boolean {
    return this.size >= NEARBY_TRANSPORT_MAX_QUEUE_SIZE;
  }

  enqueue(envelope: NearbyOutboundEnvelope): Promise<void> {
    if (this.isFull)
      return Promise.reject(new NearbyTransportError('QUEUE_LIMIT_EXCEEDED'));
    let owned: NearbyOutboundEnvelope;
    try {
      owned = immutableEnvelope(envelope);
    } catch {
      return Promise.reject(new NearbyTransportError('INVALID_ENVELOPE'));
    }
    // Copying may execute caller accessors that admit another delivery.
    if (this.isFull)
      return Promise.reject(new NearbyTransportError('QUEUE_LIMIT_EXCEEDED'));
    return new Promise<void>((resolve, reject) => {
      this.#entries.push({ envelope: owned, resolve, reject });
    });
  }

  takeNext(
    observation: DeliveryObservation<Membership>
  ): DeliveryLease<Membership> | undefined {
    let delivery = this.#entries.shift();
    while (delivery !== undefined) {
      try {
        const failure = this.#transferFailure(observation);
        if (failure === undefined) {
          const membership = observation.membership;
          const identity = observation.identity;
          // Preserve the route guard and its outward DELIVERY_FAILED mapping.
          if (membership?.active && identity)
            return leaseDelivery(delivery, membership, identity);
          delivery.reject(new NearbyTransportError('DELIVERY_FAILED'));
        } else delivery.reject(new NearbyTransportError(failure));
      } catch {
        delivery.reject(new NearbyTransportError('DELIVERY_FAILED'));
      }
      delivery = this.#entries.shift();
    }
    return undefined;
  }

  #transferFailure(
    observation: DeliveryObservation<Membership>
  ): NearbyTransportErrorCode | undefined {
    if (observation.phase === 'disposed') return 'DISPOSED';
    if (observation.phase !== 'connected' || !observation.membership?.active)
      return 'CONNECTION_INTERRUPTED';
    return undefined;
  }

  invalidate(code: NearbyTransportErrorCode): void {
    const pending = this.#entries.splice(0);
    for (const delivery of pending)
      delivery.reject(new NearbyTransportError(code));
  }
}
