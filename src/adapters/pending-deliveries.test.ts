import { describe, expect, it } from 'bun:test';
import {
  NEARBY_TRANSPORT_MAX_QUEUE_SIZE,
  type NearbyOutboundEnvelope,
  type NearbyTransportConnectionState,
} from '../ports/nearby-transport';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';
import {
  type DeliveryObservation,
  PendingDeliveries,
} from './pending-deliveries';

const IDENTITY: AuthenticatedTransportIdentity = {
  kind: 'authenticated',
  loungeId: 'lng_11111111111111111111111111111111',
  participantId: 'ptc_22222222222222222222222222222222',
};
const ENVELOPE: NearbyOutboundEnvelope = {
  delivery: { kind: 'broadcast' },
  payload: 'owned payload',
};
const membership = { active: true };
function connected(): DeliveryObservation<typeof membership> {
  return { phase: 'connected', membership, identity: IDENTITY };
}

function rejectionOf(promise: Promise<void>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error
  );
}

describe('pending delivery ownership', () => {
  it('starts empty and transfers a successful lease only once', async () => {
    const queue = new PendingDeliveries<typeof membership>();
    expect(queue.size).toBe(0);
    expect(queue.isFull).toBe(false);
    expect(queue.takeNext(connected())).toBeUndefined();
    const pending = queue.enqueue(
      Object.freeze({
        delivery: Object.freeze({ kind: 'broadcast' as const }),
        payload: 'frozen payload',
      })
    );
    expect(queue.size).toBe(1);
    const lease = queue.takeNext(connected());
    if (!lease) throw new Error('Expected owned delivery');
    expect(queue.size).toBe(0);
    expect(Object.isFrozen(lease)).toBe(true);
    expect(lease.succeed()).toBe(true);
    expect(lease.succeed()).toBe(false);
    expect(lease.fail()).toBe(false);
    await expect(pending).resolves.toBeUndefined();
    expect(queue.takeNext(connected())).toBeUndefined();
  });

  it('settles a failed lease once without exposing the underlying failure', async () => {
    const queue = new PendingDeliveries<typeof membership>();
    const pending = queue.enqueue(ENVELOPE);
    const checked = rejectionOf(pending);
    const lease = queue.takeNext(connected());
    if (!lease) throw new Error('Expected owned delivery');
    expect(lease.fail()).toBe(true);
    expect(lease.succeed()).toBe(false);
    expect(lease.fail()).toBe(false);
    expect(await checked).toMatchObject({
      code: 'DELIVERY_FAILED',
    });
  });

  it('invalidates queued items without cancelling an already transferred lease', async () => {
    const queue = new PendingDeliveries<typeof membership>();
    const first = queue.enqueue(ENVELOPE);
    const second = queue.enqueue(ENVELOPE);
    const rejected = rejectionOf(second);
    const lease = queue.takeNext(connected());
    if (!lease) throw new Error('Expected first lease');
    queue.invalidate('CONNECTION_INTERRUPTED');
    expect(queue.size).toBe(0);
    lease.succeed();
    await expect(first).resolves.toBeUndefined();
    expect(await rejected).toMatchObject({
      code: 'CONNECTION_INTERRUPTED',
    });
    queue.invalidate('DISPOSED');
    const next = queue.enqueue(ENVELOPE);
    const nextLease = queue.takeNext(connected());
    if (!nextLease) throw new Error('Expected reusable queue');
    nextLease.succeed();
    await next;
  });

  it('enforces the existing queue bound and rejects all still-owned entries on disposal', async () => {
    const queue = new PendingDeliveries<typeof membership>();
    const pending = Array.from(
      { length: NEARBY_TRANSPORT_MAX_QUEUE_SIZE },
      () => queue.enqueue(ENVELOPE)
    );
    const settled = Promise.allSettled(pending);
    expect(queue.isFull).toBe(true);
    await expect(queue.enqueue(ENVELOPE)).rejects.toMatchObject({
      code: 'QUEUE_LIMIT_EXCEEDED',
    });
    expect(queue.size).toBe(NEARBY_TRANSPORT_MAX_QUEUE_SIZE);
    queue.invalidate('DISPOSED');
    for (const result of await settled) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 'DISPOSED' });
    }
  });

  it('owns envelope and identity values across aliases while borrowing live membership', async () => {
    const queue = new PendingDeliveries<typeof membership>();
    const envelope = {
      delivery: {
        kind: 'target' as const,
        participantId: IDENTITY.participantId,
      },
      payload: 'original',
    };
    const identity = { ...IDENTITY };
    const pending = queue.enqueue(envelope);
    envelope.payload = 'changed';
    envelope.delivery.participantId = 'ptc_33333333333333333333333333333333';
    const lease = queue.takeNext({ phase: 'connected', membership, identity });
    if (!lease) throw new Error('Expected immutable ownership');
    identity.participantId = 'ptc_44444444444444444444444444444444';
    expect(lease.envelope).toEqual({
      delivery: { kind: 'target', participantId: IDENTITY.participantId },
      payload: 'original',
    });
    expect(lease.identity).toEqual(IDENTITY);
    expect(lease.membership).toBe(membership);
    expect(() =>
      Object.assign(lease.envelope, { payload: 'overwrite' })
    ).toThrow(TypeError);
    lease.succeed();
    await pending;
  });

  it.each([
    'idle',
    'hosting',
    'joining',
    'reconnecting',
    'terminal',
    'disposed',
  ] satisfies NearbyTransportConnectionState[])(
    'rejects transfer observed as %s with its existing error code',
    async (phase) => {
      const queue = new PendingDeliveries<typeof membership>();
      const pending = queue.enqueue(ENVELOPE);
      const checked = rejectionOf(pending);
      expect(queue.takeNext({ ...connected(), phase })).toBeUndefined();
      expect(queue.size).toBe(0);
      expect(await checked).toMatchObject({
        code: phase === 'disposed' ? 'DISPOSED' : 'CONNECTION_INTERRUPTED',
      });
    }
  );

  it.each([null, { active: false }])(
    'rejects absent or inactive membership before transferring',
    async (observed) => {
      const queue = new PendingDeliveries<typeof membership>();
      const pending = queue.enqueue(ENVELOPE);
      const checked = rejectionOf(pending);
      expect(
        queue.takeNext({
          phase: 'connected',
          membership: observed,
          identity: IDENTITY,
        })
      ).toBeUndefined();
      expect(await checked).toMatchObject({
        code: 'CONNECTION_INTERRUPTED',
      });
    }
  );

  it('retains the second route-context check and outward delivery-failure mapping', async () => {
    const queue = new PendingDeliveries<{ readonly active: boolean }>();
    let reads = 0;
    const changing = {
      get active() {
        reads += 1;
        return reads === 1;
      },
    };
    const pending = queue.enqueue(ENVELOPE);
    const checked = rejectionOf(pending);
    expect(
      queue.takeNext({
        phase: 'connected',
        membership: changing,
        identity: IDENTITY,
      })
    ).toBeUndefined();
    expect(reads).toBe(2);
    expect(await checked).toMatchObject({
      code: 'DELIVERY_FAILED',
    });
    const missingIdentity = queue.enqueue(ENVELOPE);
    const checkedIdentity = rejectionOf(missingIdentity);
    expect(queue.takeNext({ ...connected(), identity: null })).toBeUndefined();
    expect(await checkedIdentity).toMatchObject({
      code: 'DELIVERY_FAILED',
    });
  });

  it('never strands an entry when an observation or mutable-envelope read fails', async () => {
    const queue = new PendingDeliveries<typeof membership>();
    const input = {
      delivery: { kind: 'broadcast' as const },
      get payload(): string {
        throw new Error('private serialization failure');
      },
    };
    await expect(queue.enqueue(input)).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE',
    });
    expect(queue.size).toBe(0);
    const pending = queue.enqueue(ENVELOPE);
    const checked = rejectionOf(pending);
    expect(
      queue.takeNext({
        phase: 'connected',
        membership,
        get identity(): never {
          throw new Error('private observation failure');
        },
      })
    ).toBeUndefined();
    expect(await checked).toMatchObject({
      code: 'DELIVERY_FAILED',
    });
    expect(queue.size).toBe(0);
  });
});

it('snapshots a frozen accessor envelope rather than retaining its mutable backing state', async () => {
  const queue = new PendingDeliveries<typeof membership>();
  let payload = 'admitted value';
  const envelope = Object.freeze({
    delivery: Object.freeze({ kind: 'broadcast' as const }),
    get payload() {
      return payload;
    },
  });
  const pending = queue.enqueue(envelope);
  payload = 'changed backing state';
  const lease = queue.takeNext(connected());
  if (!lease) throw new Error('Expected frozen data snapshot');
  expect(lease.envelope.payload).toBe('admitted value');
  expect(
    Object.getOwnPropertyDescriptor(lease.envelope, 'payload')?.get
  ).toBeUndefined();
  lease.succeed();
  await pending;
});

it('captures the delivery discriminator and target from one accessor snapshot', async () => {
  const queue = new PendingDeliveries<typeof membership>();
  let reads = 0;
  const pending = queue.enqueue({
    get delivery(): NearbyOutboundEnvelope['delivery'] {
      reads += 1;
      return reads === 1
        ? { kind: 'target', participantId: IDENTITY.participantId }
        : { kind: 'broadcast' };
    },
    payload: 'target snapshot',
  });
  const lease = queue.takeNext(connected());
  if (!lease) throw new Error('Expected target snapshot');
  expect(reads).toBe(1);
  expect(lease.envelope.delivery).toEqual({
    kind: 'target',
    participantId: IDENTITY.participantId,
  });
  lease.succeed();
  await pending;
});

it('rechecks capacity after a caller accessor admits a nested delivery', async () => {
  const queue = new PendingDeliveries<typeof membership>();
  const originals = Array.from(
    { length: NEARBY_TRANSPORT_MAX_QUEUE_SIZE - 1 },
    () => queue.enqueue(ENVELOPE)
  );
  const originalResults = Promise.allSettled(originals);
  let nested: Promise<void> | undefined;
  const outer = queue.enqueue({
    delivery: { kind: 'broadcast' },
    get payload() {
      nested = queue.enqueue({
        delivery: { kind: 'broadcast' },
        payload: 'nested',
      });
      return 'outer must not be admitted';
    },
  });
  expect(queue.size).toBe(NEARBY_TRANSPORT_MAX_QUEUE_SIZE);
  await expect(outer).rejects.toMatchObject({ code: 'QUEUE_LIMIT_EXCEEDED' });
  if (nested === undefined) throw new Error('Expected nested admission');
  const payloads: string[] = [];
  let lease = queue.takeNext(connected());
  while (lease !== undefined) {
    payloads.push(lease.envelope.payload);
    lease.succeed();
    lease = queue.takeNext(connected());
  }
  expect(payloads).toHaveLength(NEARBY_TRANSPORT_MAX_QUEUE_SIZE);
  expect(payloads.filter((value) => value === 'nested')).toHaveLength(1);
  expect(payloads).not.toContain('outer must not be admitted');
  await nested;
  expect(
    (await originalResults).every((result) => result.status === 'fulfilled')
  ).toBe(true);
});
