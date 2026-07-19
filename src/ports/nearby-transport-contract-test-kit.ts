import { describe, expect, it } from 'bun:test';
import { RULES_PROVIDER_CAPABILITY } from '../domain/capability';
import type { LoungeInvite } from '../domain/lounge-invite';
import type { LoungeId, ParticipantId } from '../domain/session-identifiers';
import {
  createLoungeJoinRequest,
  encodeLoungeJoinRequest,
  issueLoungeHandshake,
} from '../protocol/lounge-handshake';
import {
  createNearbyJoinDescriptor,
  NEARBY_TRANSPORT_HOST_END_DEADLINE_MS,
  NEARBY_TRANSPORT_RATE_WINDOW_MS,
  type NearbyHostAuthorization,
  type NearbyHostInvitePolicy,
  type NearbyOutboundEnvelope,
  type NearbyTransport,
  type NearbyTransportCondition,
  NearbyTransportError,
  type NearbyTransportEvent,
} from './nearby-transport';

const LOUNGE_ID = 'lng_11111111111111111111111111111111' as LoungeId;
const HOST_ID = 'ptc_11111111111111111111111111111111' as ParticipantId;
const GUEST_IDS = [
  'ptc_22222222222222222222222222222222',
  'ptc_33333333333333333333333333333333',
  'ptc_44444444444444444444444444444444',
  'ptc_55555555555555555555555555555555',
  'ptc_66666666666666666666666666666666',
  'ptc_77777777777777777777777777777777',
] as const satisfies readonly ParticipantId[];

interface NearbyTransportContractHarness {
  readonly createTransport: () => NearbyTransport;
  readonly interrupt: (
    transport: NearbyTransport,
    condition: NearbyTransportCondition
  ) => void;
}

export type CreateNearbyTransportContractHarness =
  () => NearbyTransportContractHarness;

interface NearbyTransportDiagnosticsHarness
  extends NearbyTransportContractHarness {
  readonly activeEndpointCount: () => number;
  readonly activeListenerCount: (transport: NearbyTransport) => number;
  readonly queuedEnvelopeCount: (transport: NearbyTransport) => number;
}

export type CreateNearbyTransportDiagnosticsHarness =
  () => NearbyTransportDiagnosticsHarness;

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

let randomGeneration = 1;

function deferred(): Deferred {
  let resolvePromise: (() => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve() {
      resolvePromise?.();
    },
    reject(error) {
      rejectPromise?.(error);
    },
  };
}

function randomBytesSequence(): (length: number) => Uint8Array {
  return (length) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = ((randomGeneration + index) % 255) + 1;
    }
    randomGeneration += 1;
    return bytes;
  };
}

function invitePolicy(
  hostReady: (participantId: ParticipantId) => Promise<void> = async () =>
    undefined,
  capacity = 6,
  transformAuthorization: (
    authorization: NearbyHostAuthorization
  ) => NearbyHostAuthorization = (authorization) => authorization,
  issuedAtEpochMs = 1_000
): NearbyHostInvitePolicy {
  const randomBytes = randomBytesSequence();
  return {
    hostParticipantId: HOST_ID,
    async issueInvite(binding) {
      const issued = await issueLoungeHandshake({
        loungeId: LOUNGE_ID,
        hostDiscoveryHint: binding.hostDiscoveryHint,
        transportFingerprint: binding.transportFingerprint,
        issuedAtEpochMs,
        startedAtMonotonicMs: 100,
        expiresAtEpochMs: issuedAtEpochMs + 1_000_000,
        capacity,
        requiredCapabilities: [RULES_PROVIDER_CAPABILITY],
        randomBytes,
      });
      return transformAuthorization({
        invite: issued.invite,
        authorizeJoin: (rawJoinRequest, transportFingerprint) =>
          issued.host.authorizeJoin(rawJoinRequest, {
            clock: { wallClockMs: 2_000, monotonicMs: 200 },
            transportFingerprint,
          }),
        waitUntilReady: (identity) => hostReady(identity.participantId),
        dispose: () => issued.host.dispose(),
      });
    },
  };
}

async function joinInput(
  invite: LoungeInvite,
  participantId: ParticipantId,
  waitUntilReady: () => Promise<void> = async () => undefined
) {
  const request = await createLoungeJoinRequest(invite, participantId);
  return {
    invite: createNearbyJoinDescriptor(invite),
    participantId,
    rawJoinRequest: encodeLoungeJoinRequest(request),
    waitUntilReady,
  };
}

async function expectTransportError(
  operation: Promise<unknown>,
  code: NearbyTransportError['code']
): Promise<string> {
  let caughtCode: NearbyTransportError['code'] | null = null;
  let caughtMessage = '';
  try {
    await operation;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(NearbyTransportError);
    if (error instanceof NearbyTransportError) {
      caughtCode = error.code;
      caughtMessage = error.message;
    }
  }
  expect(caughtCode).toBe(code);
  return caughtMessage;
}

function recordEvents(transport: NearbyTransport): {
  readonly events: NearbyTransportEvent[];
  readonly unsubscribe: () => void;
} {
  const events: NearbyTransportEvent[] = [];
  return {
    events,
    unsubscribe: transport.subscribe((event) => events.push(event)),
  };
}

function receivedPayloads(events: readonly NearbyTransportEvent[]): string[] {
  return events.flatMap((event) =>
    event.kind === 'envelope-received' ? [event.envelope.payload] : []
  );
}

function subscribeListeners(
  transport: NearbyTransport,
  count: number
): Array<() => void> {
  return Array.from({ length: count }, () => {
    const listener = () => undefined;
    listener();
    return transport.subscribe(listener);
  });
}

async function connectedPair(harness: NearbyTransportContractHarness): Promise<{
  readonly host: NearbyTransport;
  readonly guest: NearbyTransport;
  readonly invite: LoungeInvite;
}> {
  const host = harness.createTransport();
  const guest = harness.createTransport();
  const invite = await host.host(invitePolicy());
  await guest.join(await joinInput(invite, GUEST_IDS[0]));
  return { host, guest, invite };
}

async function connectedTriple(
  harness: NearbyTransportContractHarness
): Promise<{
  readonly host: NearbyTransport;
  readonly firstGuest: NearbyTransport;
  readonly secondGuest: NearbyTransport;
}> {
  const host = harness.createTransport();
  const firstGuest = harness.createTransport();
  const secondGuest = harness.createTransport();
  let invite = await host.host(invitePolicy());
  await firstGuest.join(await joinInput(invite, GUEST_IDS[0]));
  invite = await host.host(invitePolicy());
  await secondGuest.join(await joinInput(invite, GUEST_IDS[1]));
  return { host, firstGuest, secondGuest };
}

export function runNearbyTransportContract(
  label: string,
  createHarness: CreateNearbyTransportContractHarness
): void {
  describe(`NearbyTransport Contract: ${label}`, () => {
    it('実 Join Proof と Host / Guest Ready の完了後だけ接続し送信を許可する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const guest = harness.createTransport();
      const hostReady = deferred();
      const guestReady = deferred();
      const hostEvents = recordEvents(host);
      const invite = await host.host(
        invitePolicy(async () => hostReady.promise)
      );
      const joining = guest.join(
        await joinInput(invite, GUEST_IDS[0], () => guestReady.promise)
      );

      const notReadyMessage = await expectTransportError(
        guest.send({ delivery: { kind: 'broadcast' }, payload: 'passport' }),
        'NOT_READY'
      );
      expect(notReadyMessage).not.toContain('passport');
      expect(
        hostEvents.events.some((event) => event.kind === 'membership-changed')
      ).toBe(false);

      hostReady.resolve();
      guestReady.resolve();
      await joining;
      await guest.send({
        delivery: { kind: 'target', participantId: HOST_ID },
        payload: '{"kind":"hello"}',
      });

      expect(receivedPayloads(hostEvents.events)).toEqual(['{"kind":"hello"}']);
      expect(
        hostEvents.events.find(
          (event) =>
            event.kind === 'membership-changed' && event.change === 'joined'
        )
      ).toMatchObject({
        kind: 'membership-changed',
        identity: {
          kind: 'authenticated',
          loungeId: LOUNGE_ID,
          participantId: GUEST_IDS[0],
        },
      });

      await host.dispose();
      await guest.dispose();
    });

    it('Host を含む 2〜6 名だけを Fresh Invite で参加させ定員超過を拒否する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const guests: NearbyTransport[] = [];
      let invite = await host.host(invitePolicy());

      for (const participantId of GUEST_IDS.slice(0, 5)) {
        const guest = harness.createTransport();
        await guest.join(await joinInput(invite, participantId));
        guests.push(guest);
        invite = await host.host(invitePolicy());
      }

      const overflow = harness.createTransport();
      await expectTransportError(
        overflow.join(await joinInput(invite, GUEST_IDS[5])),
        'CAPACITY_EXCEEDED'
      );
      await overflow.dispose();
      await host.dispose();
      await Promise.all(guests.map((guest) => guest.dispose()));
    });

    it('並行Host開始では後発Operationだけを登録する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const delayed = deferred();
      const delayedPolicy = invitePolicy();
      let staleInvite: LoungeInvite | null = null;
      const firstAttempt = Promise.allSettled([
        host.host({
          ...delayedPolicy,
          async issueInvite(binding) {
            const authorization = await delayedPolicy.issueInvite(binding);
            staleInvite = authorization.invite;
            await delayed.promise;
            return authorization;
          },
        }),
      ]);
      const activeInvite = await host.host(invitePolicy());
      delayed.resolve();
      expect(await firstAttempt).toMatchObject([
        {
          status: 'rejected',
          reason: { code: 'CONNECTION_INTERRUPTED' },
        },
      ]);

      const activeGuest = harness.createTransport();
      await activeGuest.join(await joinInput(activeInvite, GUEST_IDS[0]));
      const staleGuest = harness.createTransport();
      if (staleInvite) {
        await expectTransportError(
          staleGuest.join(await joinInput(staleInvite, GUEST_IDS[1])),
          'HOST_NOT_FOUND'
        );
      }

      await host.dispose();
      await activeGuest.dispose();
      await staleGuest.dispose();
    });

    it('Host開始中のdispose後に遅延Authorizationを登録しない', async () => {
      const disposingHarness = createHarness();
      const disposingHost = disposingHarness.createTransport();
      const disposeGate = deferred();
      const disposingPolicy = invitePolicy();
      const disposedAttempt = Promise.allSettled([
        disposingHost.host({
          ...disposingPolicy,
          async issueInvite(binding) {
            const authorization = await disposingPolicy.issueInvite(binding);
            await disposeGate.promise;
            return authorization;
          },
        }),
      ]);
      await disposingHost.dispose();
      disposeGate.resolve();
      expect(await disposedAttempt).toMatchObject([
        {
          status: 'rejected',
          reason: { code: 'DISPOSED' },
        },
      ]);
    });

    it('Host開始中のrecoverable Condition後にidleから再試行できる', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const issueGate = deferred();
      const delayedPolicy = invitePolicy();
      const interrupted = host.host({
        ...delayedPolicy,
        async issueInvite(binding) {
          const authorization = await delayedPolicy.issueInvite(binding);
          await issueGate.promise;
          return authorization;
        },
      });
      const interruptedError = expectTransportError(
        interrupted,
        'CONNECTION_INTERRUPTED'
      );
      harness.interrupt(host, 'network-changed');
      issueGate.resolve();
      await interruptedError;

      await host.host(invitePolicy());
      await host.dispose();
    });

    it('Join中のInvite Rotationで旧Authorization世代を混在させない', async () => {
      const rotationHarness = createHarness();
      const rotationHost = rotationHarness.createTransport();
      const rotatingGuest = rotationHarness.createTransport();
      const oldAuthorizationReady = deferred();
      const oldAuthorizationReadyEntered = deferred();
      const oldInvite = await rotationHost.host(
        invitePolicy(async () => {
          oldAuthorizationReadyEntered.resolve();
          await oldAuthorizationReady.promise;
        })
      );
      const rotatingJoin = rotatingGuest.join(
        await joinInput(oldInvite, GUEST_IDS[0])
      );
      const rotatingJoinError = expectTransportError(
        rotatingJoin,
        'CONNECTION_INTERRUPTED'
      );
      await oldAuthorizationReadyEntered.promise;
      const rotatedInvite = await rotationHost.host(invitePolicy());
      oldAuthorizationReady.reject(new Error('retired-authorization-detail'));
      await rotatingJoinError;

      const currentGuest = rotationHarness.createTransport();
      await currentGuest.join(await joinInput(rotatedInvite, GUEST_IDS[1]));
      await rotationHost.dispose();
      await rotatingGuest.dispose();
      await currentGuest.dispose();
    });

    it('認証待機中のJoinも定員枠へ予約する', async () => {
      const capacityHarness = createHarness();
      const capacityHost = capacityHarness.createTransport();
      const firstCapacityGuest = capacityHarness.createTransport();
      const secondCapacityGuest = capacityHarness.createTransport();
      const capacityReady = deferred();
      const capacityInvite = await capacityHost.host(
        invitePolicy(async () => capacityReady.promise, 2)
      );
      const firstCapacityJoin = firstCapacityGuest.join(
        await joinInput(capacityInvite, GUEST_IDS[0])
      );
      await expectTransportError(
        secondCapacityGuest.join(await joinInput(capacityInvite, GUEST_IDS[1])),
        'CAPACITY_EXCEEDED'
      );
      capacityReady.resolve();
      await firstCapacityJoin;
      await capacityHost.dispose();
      await firstCapacityGuest.dispose();
      await secondCapacityGuest.dispose();
    });

    it('認証待機中の同一Participant IDを二重予約しない', async () => {
      const duplicateHarness = createHarness();
      const duplicateHost = duplicateHarness.createTransport();
      const firstDuplicateGuest = duplicateHarness.createTransport();
      const secondDuplicateGuest = duplicateHarness.createTransport();
      const duplicateReady = deferred();
      const duplicateInvite = await duplicateHost.host(
        invitePolicy(async () => duplicateReady.promise)
      );
      const firstDuplicateJoin = firstDuplicateGuest.join(
        await joinInput(duplicateInvite, GUEST_IDS[0])
      );
      await expectTransportError(
        secondDuplicateGuest.join(
          await joinInput(duplicateInvite, GUEST_IDS[0])
        ),
        'PARTICIPANT_IN_USE'
      );
      duplicateReady.resolve();
      await firstDuplicateJoin;
      await duplicateHost.dispose();
      await firstDuplicateGuest.dispose();
      await secondDuplicateGuest.dispose();
    });

    it('Host Relay が Broadcast と Target Send を現在 Membership だけへ配送する', async () => {
      const harness = createHarness();
      const { host, firstGuest, secondGuest } = await connectedTriple(harness);
      const hostEvents = recordEvents(host);
      const firstEvents = recordEvents(firstGuest);
      const secondEvents = recordEvents(secondGuest);

      await host.send({
        delivery: { kind: 'broadcast' },
        payload: 'from-host',
      });
      await firstGuest.send({
        delivery: { kind: 'broadcast' },
        payload: 'from-first',
      });
      await host.send({
        delivery: { kind: 'target', participantId: GUEST_IDS[0] },
        payload: 'only-first',
      });

      expect(receivedPayloads(hostEvents.events)).toEqual(['from-first']);
      expect(receivedPayloads(firstEvents.events)).toEqual([
        'from-host',
        'only-first',
      ]);
      expect(receivedPayloads(secondEvents.events)).toEqual([
        'from-host',
        'from-first',
      ]);
      await expectTransportError(
        host.send({
          delivery: { kind: 'target', participantId: HOST_ID },
          payload: 'self',
        }),
        'TARGET_NOT_FOUND'
      );

      await host.dispose();
      await firstGuest.dispose();
      await secondGuest.dispose();
    });

    it('joined通知時点でcommit済みMembershipへのTarget Sendを許可する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const guest = harness.createTransport();
      const guestEvents = recordEvents(guest);
      const joinedSends: Promise<void>[] = [];
      host.subscribe((event) => {
        if (event.kind === 'membership-changed' && event.change === 'joined') {
          joinedSends.push(
            host.send({
              delivery: {
                kind: 'target',
                participantId: event.identity.participantId,
              },
              payload: 'sent-from-joined-listener',
            })
          );
        }
      });

      const invite = await host.host(invitePolicy());
      await guest.join(await joinInput(invite, GUEST_IDS[0]));
      await Promise.all(joinedSends);
      expect(receivedPayloads(guestEvents.events)).toEqual([
        'sent-from-joined-listener',
      ]);

      guestEvents.unsubscribe();
      await host.dispose();
      await guest.dispose();
    });

    it('Event Snapshotを凍結し先行Listenerの変更を後続Observerへ渡さない', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const guest = harness.createTransport();
      let membershipIdentityMutation = true;
      let membershipListMutation = true;
      host.subscribe((event) => {
        if (event.kind !== 'membership-changed') return;
        membershipIdentityMutation = Reflect.set(
          event.identity,
          'participantId',
          GUEST_IDS[5]
        );
        membershipListMutation = Reflect.set(
          event.participantIds,
          '0',
          GUEST_IDS[5]
        );
      });
      const hostEvents = recordEvents(host);
      const invite = await host.host(invitePolicy());
      await guest.join(await joinInput(invite, GUEST_IDS[0]));

      expect(membershipIdentityMutation).toBe(false);
      expect(membershipListMutation).toBe(false);
      expect(
        hostEvents.events.find(
          (event) =>
            event.kind === 'membership-changed' && event.change === 'joined'
        )
      ).toMatchObject({
        identity: { participantId: GUEST_IDS[0] },
        participantIds: [HOST_ID, GUEST_IDS[0]],
      });

      let envelopeMutation = true;
      guest.subscribe((event) => {
        if (event.kind !== 'envelope-received') return;
        envelopeMutation = Reflect.set(
          event.envelope,
          'payload',
          'mutated-payload'
        );
      });
      const guestEvents = recordEvents(guest);
      await host.send({
        delivery: { kind: 'broadcast' },
        payload: 'immutable-payload',
      });
      expect(envelopeMutation).toBe(false);
      expect(receivedPayloads(guestEvents.events)).toEqual([
        'immutable-payload',
      ]);

      hostEvents.unsubscribe();
      guestEvents.unsubscribe();
      await host.dispose();
      await guest.dispose();
    });

    it('Guest Leave を Membership へ反映し Host End で全 Guest を5秒以内に終了する', async () => {
      const harness = createHarness();
      const { host, firstGuest, secondGuest } = await connectedTriple(harness);
      const hostEvents = recordEvents(host);
      const secondEvents = recordEvents(secondGuest);

      const invalidLeaveMessage = await expectTransportError(
        secondGuest.leave(JSON.parse('"passport-content"')),
        'INVALID_CONFIGURATION'
      );
      expect(invalidLeaveMessage).not.toContain('passport-content');

      await firstGuest.leave('owner-left');
      expect(
        hostEvents.events.find(
          (event) =>
            event.kind === 'membership-changed' && event.change === 'left'
        )
      ).toMatchObject({
        identity: { participantId: GUEST_IDS[0] },
      });
      await expectTransportError(
        host.send({
          delivery: { kind: 'target', participantId: GUEST_IDS[0] },
          payload: 'departed',
        }),
        'TARGET_NOT_FOUND'
      );

      const startedAt = performance.now();
      await host.leave('owner-left');
      expect(performance.now() - startedAt).toBeLessThan(
        NEARBY_TRANSPORT_HOST_END_DEADLINE_MS
      );
      expect(
        secondEvents.events.find(
          (event) =>
            event.kind === 'connection-state-changed' &&
            event.state === 'terminal'
        )
      ).toMatchObject({ reason: 'host-ended' });

      await host.dispose();
      await firstGuest.dispose();
      await secondGuest.dispose();

      const reentrantHarness = createHarness();
      const reentrantPair = await connectedPair(reentrantHarness);
      const reentrantDisposals: Promise<void>[] = [];
      reentrantPair.guest.subscribe((event) => {
        if (event.kind === 'membership-changed' && event.change === 'left') {
          reentrantDisposals.push(reentrantPair.guest.dispose());
        }
      });
      await reentrantPair.guest.leave('owner-left');
      await Promise.all(reentrantDisposals);
      const disposedReentrantListener = () => undefined;
      disposedReentrantListener();
      expect(() =>
        reentrantPair.guest.subscribe(disposedReentrantListener)
      ).toThrow(NearbyTransportError);
      await reentrantPair.host.dispose();

      const leaveConditionHarness = createHarness();
      const leaveConditionPair = await connectedPair(leaveConditionHarness);
      const leaveConditionCalls: NearbyTransportCondition[] = [];
      leaveConditionPair.guest.subscribe((event) => {
        if (event.kind === 'membership-changed' && event.change === 'left') {
          leaveConditionCalls.push('network-changed');
          leaveConditionHarness.interrupt(
            leaveConditionPair.guest,
            'network-changed'
          );
        }
      });
      const leaveConditionEvents = recordEvents(leaveConditionPair.guest);
      await leaveConditionPair.guest.leave('owner-left');
      expect(leaveConditionCalls).toEqual(['network-changed']);
      expect(leaveConditionEvents.events.map((event) => event.kind)).toEqual([
        'membership-changed',
        'connection-state-changed',
      ]);
      expect(leaveConditionEvents.events.at(-1)).toEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'owner-left',
      });
      leaveConditionEvents.unsubscribe();
      await leaveConditionPair.host.dispose();
      await leaveConditionPair.guest.dispose();

      const cleanupConditionHarness = createHarness();
      const cleanupConditionHost = cleanupConditionHarness.createTransport();
      const cleanupConditions: NearbyTransportCondition[] = [];
      const cleanupInvite = await cleanupConditionHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          dispose() {
            authorization.dispose();
            cleanupConditions.push('network-changed');
            cleanupConditionHarness.interrupt(
              cleanupConditionHost,
              'network-changed'
            );
          },
        }))
      );
      expect(cleanupInvite.loungeId).toBe(LOUNGE_ID);
      const cleanupConditionEvents = recordEvents(cleanupConditionHost);
      await cleanupConditionHost.leave('owner-left');
      expect(cleanupConditions).toEqual(['network-changed']);
      expect(cleanupConditionEvents.events).toEqual([
        {
          kind: 'connection-state-changed',
          state: 'terminal',
          reason: 'owner-left',
        },
      ]);
      cleanupConditionEvents.unsubscribe();
      await cleanupConditionHost.dispose();
    });

    it('Payload、Queue、Send Rate、rolling byte の各上限を別の型付きErrorにする', async () => {
      const payloadHarness = createHarness();
      const payloadPair = await connectedPair(payloadHarness);
      const payloadErrorMessage = await expectTransportError(
        payloadPair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'x'.repeat(4_097),
        }),
        'PAYLOAD_LIMIT_EXCEEDED'
      );
      expect(payloadErrorMessage).not.toContain('xxxx');
      await expectTransportError(
        payloadPair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'x'.repeat(1_000_000),
        }),
        'PAYLOAD_LIMIT_EXCEEDED'
      );
      await payloadPair.host.dispose();
      await payloadPair.guest.dispose();

      const queueHarness = createHarness();
      const queuePair = await connectedPair(queueHarness);
      const queued = Array.from({ length: 8 }, (_, index) =>
        queuePair.host.send({
          delivery: { kind: 'broadcast' },
          payload: `queued-${index}`,
        })
      );
      const queuedResults = Promise.allSettled(queued);
      const overflowResult = Promise.allSettled([
        queuePair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'queue-overflow',
        }),
      ]);
      await queuePair.host.dispose();
      expect(await overflowResult).toMatchObject([
        {
          status: 'rejected',
          reason: { code: 'QUEUE_LIMIT_EXCEEDED' },
        },
      ]);
      expect(
        (await queuedResults).every(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof NearbyTransportError &&
            result.reason.code === 'DISPOSED'
        )
      ).toBe(true);
      await queuePair.guest.dispose();

      const rateHarness = createHarness();
      const ratePair = await connectedPair(rateHarness);
      for (let index = 0; index < 16; index += 1) {
        await ratePair.host.send({
          delivery: { kind: 'broadcast' },
          payload: `rate-${index}`,
        });
      }
      await expectTransportError(
        ratePair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'rate-overflow',
        }),
        'RATE_LIMIT_EXCEEDED'
      );
      await new Promise((resolve) =>
        setTimeout(resolve, NEARBY_TRANSPORT_RATE_WINDOW_MS + 10)
      );
      await ratePair.host.send({
        delivery: { kind: 'broadcast' },
        payload: 'rate-window-recovered',
      });
      await ratePair.host.dispose();
      await ratePair.guest.dispose();

      const byteHarness = createHarness();
      const bytePair = await connectedPair(byteHarness);
      await bytePair.host.send({
        delivery: { kind: 'broadcast' },
        payload: 'a'.repeat(4_096),
      });
      await bytePair.host.send({
        delivery: { kind: 'broadcast' },
        payload: 'b'.repeat(4_096),
      });
      await expectTransportError(
        bytePair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'c',
        }),
        'BYTE_RATE_LIMIT_EXCEEDED'
      );
      await new Promise((resolve) =>
        setTimeout(resolve, NEARBY_TRANSPORT_RATE_WINDOW_MS + 10)
      );
      await bytePair.host.send({
        delivery: { kind: 'broadcast' },
        payload: 'byte-window-recovered',
      });
      await bytePair.host.dispose();
      await bytePair.guest.dispose();
    });

    it('Network切替、Hotspot切断、Backgroundを別通知にし再Readyまで送信を閉じる', async () => {
      const harness = createHarness();
      const pair = await connectedPair(harness);
      const events = recordEvents(pair.guest);
      const input = await joinInput(pair.invite, GUEST_IDS[0]);
      const recoverable: readonly NearbyTransportCondition[] = [
        'network-changed',
        'hotspot-disconnected',
        'app-background',
      ];

      for (const condition of recoverable) {
        harness.interrupt(pair.guest, condition);
        await expectTransportError(
          pair.guest.send({
            delivery: { kind: 'target', participantId: HOST_ID },
            payload: 'before-reconnect',
          }),
          'NOT_READY'
        );
        await pair.guest.join(input);
      }

      expect(
        events.events
          .filter((event) => event.kind === 'transport-condition')
          .map((event) => event.condition)
      ).toEqual([...recoverable]);

      const denied = harness.createTransport();
      const deniedEvents = recordEvents(denied);
      harness.interrupt(denied, 'local-network-permission-denied');
      expect(deniedEvents.events).toContainEqual({
        kind: 'transport-condition',
        condition: 'local-network-permission-denied',
      });
      expect(deniedEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'local-network-permission-denied',
      });

      const leaveHarness = createHarness();
      const leavePair = await connectedPair(leaveHarness);
      const leavePromises: Promise<void>[] = [];
      const firstListenerConditions: NearbyTransportCondition[] = [];
      leavePair.guest.subscribe((event) => {
        if (event.kind === 'transport-condition') {
          firstListenerConditions.push(event.condition);
          leavePromises.push(leavePair.guest.leave('owner-left'));
        }
      });
      const leaveEvents = recordEvents(leavePair.guest);
      leaveHarness.interrupt(
        leavePair.guest,
        'local-network-permission-denied'
      );
      await Promise.all(leavePromises);
      expect(firstListenerConditions).toEqual([
        'local-network-permission-denied',
      ]);
      expect(
        leaveEvents.events.filter(
          (event) => event.kind === 'transport-condition'
        )
      ).toEqual([]);
      expect(leaveEvents.events.at(-1)).toEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'local-network-permission-denied',
      });

      await denied.dispose();
      await pair.host.dispose();
      await pair.guest.dispose();
      leaveEvents.unsubscribe();
      await leavePair.host.dispose();
      await leavePair.guest.dispose();

      const deniedHostHarness = createHarness();
      const deniedHostPair = await connectedPair(deniedHostHarness);
      deniedHostPair.host.subscribe((event) => {
        if (
          event.kind === 'transport-condition' &&
          event.condition === 'local-network-permission-denied'
        ) {
          deniedHostHarness.interrupt(deniedHostPair.guest, 'network-changed');
        }
      });
      const deniedHostGuestEvents = recordEvents(deniedHostPair.guest);
      deniedHostHarness.interrupt(
        deniedHostPair.host,
        'local-network-permission-denied'
      );
      expect(deniedHostGuestEvents.events).toEqual([
        {
          kind: 'connection-state-changed',
          state: 'terminal',
          reason: 'host-ended',
        },
      ]);
      deniedHostGuestEvents.unsubscribe();
      await deniedHostPair.host.dispose();
      await deniedHostPair.guest.dispose();
    });

    it('Host側のNetwork切替も全Guestを再接続にし双方Ready後だけ復帰する', async () => {
      const harness = createHarness();
      const pair = await connectedPair(harness);
      const hostEvents = recordEvents(pair.host);
      const guestEvents = recordEvents(pair.guest);
      const reconnectInput = await joinInput(pair.invite, GUEST_IDS[0]);

      harness.interrupt(pair.host, 'network-changed');
      await expectTransportError(
        pair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'host-before-reconnect',
        }),
        'NOT_READY'
      );
      await expectTransportError(
        pair.guest.send({
          delivery: { kind: 'target', participantId: HOST_ID },
          payload: 'guest-before-reconnect',
        }),
        'NOT_READY'
      );

      await pair.host.host(invitePolicy(undefined, 6, undefined, 2_000));
      await expectTransportError(
        pair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'host-after-auth-before-guest-ready',
        }),
        'NOT_READY'
      );
      const reconnecting = pair.guest.join(reconnectInput);
      await expectTransportError(
        pair.guest.join(reconnectInput),
        'INVALID_STATE'
      );
      await reconnecting;
      await pair.guest.send({
        delivery: { kind: 'target', participantId: HOST_ID },
        payload: 'after-reconnect',
      });
      expect(receivedPayloads(hostEvents.events)).toEqual(['after-reconnect']);
      expect(
        guestEvents.events.filter(
          (event) =>
            event.kind === 'transport-condition' &&
            event.condition === 'network-changed'
        )
      ).toHaveLength(1);

      await pair.host.dispose();
      await pair.guest.dispose();

      const immediateRecoveryHarness = createHarness();
      const immediateRecoveryPair = await connectedPair(
        immediateRecoveryHarness
      );
      const immediateRehosts: Promise<LoungeInvite>[] = [];
      immediateRecoveryPair.host.subscribe((event) => {
        if (
          event.kind === 'transport-condition' &&
          event.condition === 'network-changed'
        ) {
          immediateRehosts.push(
            immediateRecoveryPair.host.host(invitePolicy())
          );
        }
      });
      immediateRecoveryHarness.interrupt(
        immediateRecoveryPair.host,
        'network-changed'
      );
      expect(immediateRehosts).toHaveLength(1);
      const immediateRecoveryInvite = await Promise.race(immediateRehosts);
      await expectTransportError(
        immediateRecoveryPair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'host-listener-rehost-before-ready',
        }),
        'NOT_READY'
      );
      await expectTransportError(
        immediateRecoveryPair.guest.send({
          delivery: { kind: 'target', participantId: HOST_ID },
          payload: 'guest-listener-rehost-before-ready',
        }),
        'NOT_READY'
      );
      await immediateRecoveryPair.guest.join(
        await joinInput(immediateRecoveryInvite, GUEST_IDS[0])
      );
      await immediateRecoveryPair.guest.send({
        delivery: { kind: 'target', participantId: HOST_ID },
        payload: 'listener-rehost-after-ready',
      });
      await immediateRecoveryPair.host.dispose();
      await immediateRecoveryPair.guest.dispose();

      const rejectedRecoveryHarness = createHarness();
      const rejectedRecoveryPair = await connectedPair(rejectedRecoveryHarness);
      const rejectedRecoveryEvents = recordEvents(rejectedRecoveryPair.guest);
      rejectedRecoveryHarness.interrupt(
        rejectedRecoveryPair.guest,
        'network-changed'
      );
      await expectTransportError(
        rejectedRecoveryPair.guest.join(
          await joinInput(
            rejectedRecoveryPair.invite,
            GUEST_IDS[0],
            async () => {
              throw new Error('native-ready-detail');
            }
          )
        ),
        'READY_REJECTED'
      );
      await rejectedRecoveryPair.host.dispose();
      expect(
        rejectedRecoveryEvents.events.flatMap((event) =>
          event.kind === 'connection-state-changed' &&
          event.state === 'terminal'
            ? [event.reason]
            : []
        )
      ).toEqual(['ready-rejected']);
      rejectedRecoveryEvents.unsubscribe();
      await rejectedRecoveryPair.guest.dispose();
    });

    it('Host Conditionは認証待機中のJoin世代も中断する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const guest = harness.createTransport();
      const guestEvents = recordEvents(guest);
      const ready = deferred();
      const readyEntered = deferred();
      const invite = await host.host(
        invitePolicy(async () => {
          readyEntered.resolve();
          await ready.promise;
        })
      );
      const joining = guest.join(await joinInput(invite, GUEST_IDS[0]));
      const joiningError = expectTransportError(
        joining,
        'CONNECTION_INTERRUPTED'
      );
      await readyEntered.promise;

      harness.interrupt(host, 'network-changed');
      expect(guestEvents.events).toContainEqual({
        kind: 'transport-condition',
        condition: 'network-changed',
      });
      expect(guestEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'connection-interrupted',
      });
      ready.resolve();
      await joiningError;

      guestEvents.unsubscribe();
      await host.dispose();
      await guest.dispose();

      const reentrantHarness = createHarness();
      const reentrantHost = reentrantHarness.createTransport();
      const reentrantGuest = reentrantHarness.createTransport();
      const reentrantReady = deferred();
      const reentrantReadyEntered = deferred();
      const reentrantInvite = await reentrantHost.host(
        invitePolicy(async () => {
          reentrantReadyEntered.resolve();
          await reentrantReady.promise;
        })
      );
      const reentrantHostDisposals: Promise<void>[] = [];
      reentrantGuest.subscribe((event) => {
        if (
          event.kind === 'transport-condition' &&
          event.condition === 'network-changed'
        ) {
          reentrantHostDisposals.push(reentrantHost.dispose());
        }
      });
      const reentrantEvents = recordEvents(reentrantGuest);
      const reentrantJoin = reentrantGuest.join(
        await joinInput(reentrantInvite, GUEST_IDS[0])
      );
      const reentrantJoinError = expectTransportError(
        reentrantJoin,
        'CONNECTION_INTERRUPTED'
      );
      await reentrantReadyEntered.promise;
      reentrantHarness.interrupt(reentrantHost, 'network-changed');
      await Promise.all(reentrantHostDisposals);
      reentrantReady.resolve();
      await reentrantJoinError;
      expect(reentrantEvents.events).toEqual([
        { kind: 'connection-state-changed', state: 'joining' },
        {
          kind: 'connection-state-changed',
          state: 'terminal',
          reason: 'host-ended',
        },
      ]);
      reentrantEvents.unsubscribe();
      await reentrantHost.dispose();
      await reentrantGuest.dispose();
    });

    it('Host Condition通知内のdispose後にterminal Guestを復活させない', async () => {
      const harness = createHarness();
      const group = await connectedTriple(harness);
      const firstEvents = recordEvents(group.firstGuest);
      const secondEvents = recordEvents(group.secondGuest);
      const hostDisposals: Promise<void>[] = [];
      group.firstGuest.subscribe((event) => {
        if (
          event.kind === 'transport-condition' &&
          event.condition === 'network-changed'
        ) {
          hostDisposals.push(group.host.dispose());
        }
      });
      harness.interrupt(group.host, 'network-changed');
      await Promise.all(hostDisposals);
      const statesAfterHostEnd = (events: readonly NearbyTransportEvent[]) => {
        const terminalIndex = events.findIndex(
          (event) =>
            event.kind === 'connection-state-changed' &&
            event.state === 'terminal' &&
            event.reason === 'host-ended'
        );
        expect(terminalIndex).toBeGreaterThanOrEqual(0);
        return events.slice(terminalIndex + 1).length;
      };
      expect(statesAfterHostEnd(firstEvents.events)).toBe(0);
      expect(statesAfterHostEnd(secondEvents.events)).toBe(0);
      firstEvents.unsubscribe();
      secondEvents.unsubscribe();
      await group.host.dispose();
      await group.firstGuest.dispose();
      await group.secondGuest.dispose();

      const staleRecipientHarness = createHarness();
      const staleRecipientGroup = await connectedTriple(staleRecipientHarness);
      const staleRecipientLeaves: Promise<void>[] = [];
      staleRecipientGroup.firstGuest.subscribe((event) => {
        if (
          event.kind === 'transport-condition' &&
          event.condition === 'network-changed'
        ) {
          staleRecipientLeaves.push(
            staleRecipientGroup.secondGuest.leave('owner-left')
          );
        }
      });
      const staleRecipientEvents = recordEvents(
        staleRecipientGroup.secondGuest
      );
      staleRecipientHarness.interrupt(
        staleRecipientGroup.host,
        'network-changed'
      );
      await Promise.all(staleRecipientLeaves);
      const staleRecipientTerminalIndex = staleRecipientEvents.events.findIndex(
        (event) =>
          event.kind === 'connection-state-changed' &&
          event.state === 'terminal' &&
          event.reason === 'owner-left'
      );
      expect(staleRecipientTerminalIndex).toBeGreaterThanOrEqual(0);
      expect(
        staleRecipientEvents.events.slice(staleRecipientTerminalIndex + 1)
      ).toEqual([]);
      staleRecipientEvents.unsubscribe();
      await staleRecipientGroup.host.dispose();
      await staleRecipientGroup.firstGuest.dispose();
      await staleRecipientGroup.secondGuest.dispose();
    });

    it('Reconnect待機中の新Conditionは旧callbackより優先して再試行できる', async () => {
      const harness = createHarness();
      const pair = await connectedPair(harness);
      const ready = deferred();
      const readyEntered = deferred();
      harness.interrupt(pair.guest, 'network-changed');
      const reconnecting = pair.guest.join(
        await joinInput(pair.invite, GUEST_IDS[0], async () => {
          readyEntered.resolve();
          await ready.promise;
        })
      );
      const reconnectingError = expectTransportError(
        reconnecting,
        'CONNECTION_INTERRUPTED'
      );
      await readyEntered.promise;

      harness.interrupt(pair.guest, 'app-background');
      ready.resolve();
      await reconnectingError;
      await pair.guest.join(await joinInput(pair.invite, GUEST_IDS[0]));
      await pair.guest.send({
        delivery: { kind: 'target', participantId: HOST_ID },
        payload: 'new-condition-generation',
      });

      await pair.host.dispose();
      await pair.guest.dispose();
    });

    it('未知Host、Fingerprint差替え、重複Identity、未知field、Join改ざんを固定Errorで拒否する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const firstGuest = harness.createTransport();
      const invite = await host.host(invitePolicy());
      const firstInput = await joinInput(invite, GUEST_IDS[0]);
      const unknownHostGuest = harness.createTransport();
      await expectTransportError(
        unknownHostGuest.join({
          ...firstInput,
          invite: {
            ...firstInput.invite,
            hostDiscoveryHint: 'loopback-ref://unknown',
          },
        }),
        'HOST_NOT_FOUND'
      );
      await expectTransportError(
        unknownHostGuest.join({
          ...firstInput,
          invite: {
            ...firstInput.invite,
            transportFingerprint: `sha256_${'ff'.repeat(32)}`,
          },
        }),
        'TRANSPORT_FINGERPRINT_MISMATCH'
      );
      await expectTransportError(
        unknownHostGuest.join({
          ...firstInput,
          invite: JSON.parse(
            JSON.stringify({ ...firstInput.invite, joinSecret: 'must-reject' })
          ),
        }),
        'INVALID_CONFIGURATION'
      );
      const inputWithUnknownField = { ...firstInput, unexpectedField: true };
      await expectTransportError(
        unknownHostGuest.join(inputWithUnknownField),
        'INVALID_CONFIGURATION'
      );
      await expectTransportError(
        unknownHostGuest.join({
          ...firstInput,
          rawJoinRequest: 'x'.repeat(1_024),
        }),
        'AUTHORIZATION_FAILED'
      );
      await expectTransportError(
        unknownHostGuest.join({
          ...firstInput,
          rawJoinRequest: 'x'.repeat(1_025),
        }),
        'INVALID_CONFIGURATION'
      );
      const hostIdentityGuest = harness.createTransport();
      await expectTransportError(
        hostIdentityGuest.join(await joinInput(invite, HOST_ID)),
        'PARTICIPANT_IN_USE'
      );

      await firstGuest.join(firstInput);
      const duplicate = harness.createTransport();
      await expectTransportError(
        duplicate.join(firstInput),
        'PARTICIPANT_IN_USE'
      );

      const tamperedInvite = await host.host(invitePolicy());
      const tamperedInput = await joinInput(tamperedInvite, GUEST_IDS[1]);
      const tampered = harness.createTransport();
      const authorizationMessage = await expectTransportError(
        tampered.join({
          ...tamperedInput,
          rawJoinRequest: `${tamperedInput.rawJoinRequest}x`,
        }),
        'AUTHORIZATION_FAILED'
      );
      expect(authorizationMessage).not.toContain(
        tamperedInput.rawJoinRequest.slice(0, 16)
      );

      await host.dispose();
      await firstGuest.dispose();
      await unknownHostGuest.dispose();
      await duplicate.dispose();
      await tampered.dispose();
      await hostIdentityGuest.dispose();
    });

    it('共有strict validatorがProxyと不正Capability配列をfail closedにする', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const guest = harness.createTransport();
      const invite = await host.host(invitePolicy());
      const input = await joinInput(invite, GUEST_IDS[0]);
      const unreadableInput = new Proxy(input, {
        ownKeys() {
          throw new Error('proxy-input-detail');
        },
      });
      await expectTransportError(
        guest.join(unreadableInput),
        'INVALID_CONFIGURATION'
      );
      const reentrantGuest = harness.createTransport();
      const reentrantGuestDisposals: Promise<void>[] = [];
      const reentrantInput = new Proxy(input, {
        ownKeys(target) {
          reentrantGuestDisposals.push(reentrantGuest.dispose());
          return Reflect.ownKeys(target);
        },
      });
      await expectTransportError(
        reentrantGuest.join(reentrantInput),
        'DISPOSED'
      );
      await Promise.all(reentrantGuestDisposals);

      const tooManyCapabilities = Array.from(
        { length: 5 },
        () => RULES_PROVIDER_CAPABILITY
      );
      await expectTransportError(
        guest.join({
          ...input,
          invite: {
            ...input.invite,
            requiredCapabilities: tooManyCapabilities,
          },
        }),
        'INVALID_CONFIGURATION'
      );

      const capabilitiesWithUnknownField = [RULES_PROVIDER_CAPABILITY];
      Object.defineProperty(capabilitiesWithUnknownField, 'unexpectedField', {
        enumerable: true,
        value: true,
      });
      await expectTransportError(
        guest.join({
          ...input,
          invite: {
            ...input.invite,
            requiredCapabilities: capabilitiesWithUnknownField,
          },
        }),
        'INVALID_CONFIGURATION'
      );

      const nonStringCapabilities = JSON.parse('[1]');
      await expectTransportError(
        guest.join({
          ...input,
          invite: {
            ...input.invite,
            requiredCapabilities: nonStringCapabilities,
          },
        }),
        'INVALID_CONFIGURATION'
      );

      const unreadableCapabilities = new Proxy([RULES_PROVIDER_CAPABILITY], {
        ownKeys() {
          throw new Error('proxy-capability-detail');
        },
      });
      await expectTransportError(
        guest.join({
          ...input,
          invite: {
            ...input.invite,
            requiredCapabilities: unreadableCapabilities,
          },
        }),
        'INVALID_CONFIGURATION'
      );

      const invalidBindingHost = harness.createTransport();
      let invalidBindingDisposeCount = 0;
      await expectTransportError(
        invalidBindingHost.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            invite: JSON.parse(
              JSON.stringify({
                ...authorization.invite,
                hostDiscoveryHint: 'loopback-ref://different-binding',
              })
            ),
            dispose() {
              invalidBindingDisposeCount += 1;
              authorization.dispose();
            },
          }))
        ),
        'INVALID_CONFIGURATION'
      );
      expect(invalidBindingDisposeCount).toBe(1);

      const reentrantPolicyHost = harness.createTransport();
      const reentrantPolicyDisposals: Promise<void>[] = [];
      const baseReentrantPolicy = invitePolicy();
      const reentrantPolicy = new Proxy(baseReentrantPolicy, {
        ownKeys(target) {
          reentrantPolicyDisposals.push(reentrantPolicyHost.dispose());
          return Reflect.ownKeys(target);
        },
      });
      await expectTransportError(
        reentrantPolicyHost.host(reentrantPolicy),
        'DISPOSED'
      );
      await Promise.all(reentrantPolicyDisposals);

      await host.dispose();
      await guest.dispose();
      await reentrantGuest.dispose();
      await invalidBindingHost.dispose();
      await reentrantPolicyHost.dispose();
    });

    it('Authorization不正、Identity不一致、Ready拒否、Join中disposeをfail closedにする', async () => {
      const invalidAuthorizationHarness = createHarness();
      const invalidAuthorizationHost =
        invalidAuthorizationHarness.createTransport();
      await expectTransportError(
        invalidAuthorizationHost.host({
          hostParticipantId: HOST_ID,
          issueInvite: async () => JSON.parse('null'),
        }),
        'INVALID_CONFIGURATION'
      );
      const policyWithUnknownField = {
        ...invitePolicy(),
        unexpectedField: true,
      };
      await expectTransportError(
        invalidAuthorizationHost.host(policyWithUnknownField),
        'INVALID_CONFIGURATION'
      );
      let invalidAuthorizationDisposeCount = 0;
      await expectTransportError(
        invalidAuthorizationHost.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            unexpectedField: true,
            dispose() {
              invalidAuthorizationDisposeCount += 1;
              authorization.dispose();
            },
          }))
        ),
        'INVALID_CONFIGURATION'
      );
      expect(invalidAuthorizationDisposeCount).toBe(1);

      let nestedInviteDisposeCount = 0;
      const inviteWithUnknownPolicy = invitePolicy(
        undefined,
        6,
        (authorization) => {
          const inviteWithUnknownField = {
            ...authorization.invite,
            unexpectedField: true,
          };
          return {
            ...authorization,
            invite: inviteWithUnknownField,
            dispose() {
              nestedInviteDisposeCount += 1;
              authorization.dispose();
            },
          };
        }
      );
      await expectTransportError(
        invalidAuthorizationHost.host(inviteWithUnknownPolicy),
        'INVALID_CONFIGURATION'
      );
      expect(nestedInviteDisposeCount).toBe(1);

      let nestedInviteAccessorReads = 0;
      let nestedAccessorDisposeCount = 0;
      let nestedInviteAccessorValue: LoungeInvite['loungeId'] = LOUNGE_ID;
      function readNestedInviteLoungeId(): LoungeInvite['loungeId'] {
        nestedInviteAccessorReads += 1;
        return nestedInviteAccessorValue;
      }
      await expectTransportError(
        invalidAuthorizationHost.host(
          invitePolicy(undefined, 6, (authorization) => {
            nestedInviteAccessorValue = authorization.invite.loungeId;
            const inviteWithAccessor = { ...authorization.invite };
            Object.defineProperty(inviteWithAccessor, 'loungeId', {
              enumerable: true,
              get: readNestedInviteLoungeId,
            });
            return {
              ...authorization,
              invite: inviteWithAccessor,
              dispose() {
                nestedAccessorDisposeCount += 1;
                authorization.dispose();
              },
            };
          })
        ),
        'INVALID_CONFIGURATION'
      );
      expect(nestedInviteAccessorReads).toBe(0);
      expect(nestedAccessorDisposeCount).toBe(1);
      expect(readNestedInviteLoungeId()).toBe(nestedInviteAccessorValue);

      let disposeAccessorReads = 0;
      let disposeAccessorValue: NearbyHostAuthorization['dispose'] | null =
        null;
      function readDisposeAccessor():
        | NearbyHostAuthorization['dispose']
        | null {
        disposeAccessorReads += 1;
        return disposeAccessorValue;
      }
      await expectTransportError(
        invalidAuthorizationHost.host(
          invitePolicy(undefined, 6, (authorization) => {
            disposeAccessorValue = authorization.dispose;
            const authorizationWithAccessor = { ...authorization };
            Object.defineProperty(authorizationWithAccessor, 'dispose', {
              enumerable: true,
              get: readDisposeAccessor,
            });
            return authorizationWithAccessor;
          })
        ),
        'INVALID_CONFIGURATION'
      );
      expect(disposeAccessorReads).toBe(0);
      expect(readDisposeAccessor()).toBe(disposeAccessorValue);
      await invalidAuthorizationHost.dispose();

      const bindingHarness = createHarness();
      const bindingHost = bindingHarness.createTransport();
      const bindingGuest = bindingHarness.createTransport();
      const bindingEvents = recordEvents(bindingHost);
      const basePolicy = invitePolicy();
      let bindingMutationSucceeded = true;
      const mutablePolicy: NearbyHostInvitePolicy = {
        ...basePolicy,
        async issueInvite(binding) {
          bindingMutationSucceeded = Reflect.set(
            binding,
            'hostDiscoveryHint',
            'loopback-ref://mutated'
          );
          Reflect.set(mutablePolicy, 'hostParticipantId', GUEST_IDS[5]);
          return basePolicy.issueInvite(binding);
        },
      };
      const bindingInvite = await bindingHost.host(mutablePolicy);
      expect(bindingMutationSucceeded).toBe(false);
      await bindingGuest.join(await joinInput(bindingInvite, GUEST_IDS[0]));
      expect(
        bindingEvents.events.find(
          (event) =>
            event.kind === 'membership-changed' && event.change === 'joined'
        )
      ).toMatchObject({
        participantIds: [HOST_ID, GUEST_IDS[0]],
      });
      bindingEvents.unsubscribe();
      await bindingHost.dispose();
      await bindingGuest.dispose();

      const invalidIdentityHarness = createHarness();
      const invalidIdentityHost = invalidIdentityHarness.createTransport();
      const invalidIdentityGuest = invalidIdentityHarness.createTransport();
      const invalidIdentityInvite = await invalidIdentityHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          authorizeJoin: async () => JSON.parse('null'),
        }))
      );
      await expectTransportError(
        invalidIdentityGuest.join(
          await joinInput(invalidIdentityInvite, GUEST_IDS[0])
        ),
        'AUTHENTICATION_MISMATCH'
      );
      await invalidIdentityHost.dispose();
      await invalidIdentityGuest.dispose();

      const pendingReasonHarness = createHarness();
      const pendingReasonHost = pendingReasonHarness.createTransport();
      const pendingReasonGuest = pendingReasonHarness.createTransport();
      const pendingReasonEvents = recordEvents(pendingReasonGuest);
      const pendingReasonHostDisposals: Promise<void>[] = [];
      pendingReasonGuest.subscribe((event) => {
        if (
          event.kind === 'connection-state-changed' &&
          event.state === 'terminal' &&
          event.reason === 'connection-interrupted'
        ) {
          pendingReasonHostDisposals.push(pendingReasonHost.dispose());
        }
      });
      const pendingReasonInvite = await pendingReasonHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          async authorizeJoin() {
            throw new Error('native-authorization-detail');
          },
        }))
      );
      await expectTransportError(
        pendingReasonGuest.join(
          await joinInput(pendingReasonInvite, GUEST_IDS[0])
        ),
        'AUTHORIZATION_FAILED'
      );
      await Promise.all(pendingReasonHostDisposals);
      expect(
        pendingReasonEvents.events.flatMap((event) =>
          event.kind === 'connection-state-changed' &&
          event.state === 'terminal'
            ? [event.reason]
            : []
        )
      ).toEqual(['connection-interrupted']);
      pendingReasonEvents.unsubscribe();
      await pendingReasonHost.dispose();
      await pendingReasonGuest.dispose();

      const symbolIdentityHarness = createHarness();
      const symbolIdentityHost = symbolIdentityHarness.createTransport();
      const symbolIdentityGuest = symbolIdentityHarness.createTransport();
      const nativeDetail = Symbol('native-detail');
      const symbolIdentityInvite = await symbolIdentityHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          async authorizeJoin(rawJoinRequest, transportFingerprint) {
            const identity = await authorization.authorizeJoin(
              rawJoinRequest,
              transportFingerprint
            );
            Object.defineProperty(identity, nativeDetail, {
              enumerable: true,
              value: 'passport-content-must-not-reflect',
            });
            return identity;
          },
        }))
      );
      await expectTransportError(
        symbolIdentityGuest.join(
          await joinInput(symbolIdentityInvite, GUEST_IDS[0])
        ),
        'AUTHENTICATION_MISMATCH'
      );
      await symbolIdentityHost.dispose();
      await symbolIdentityGuest.dispose();

      const reentrantIdentityHarness = createHarness();
      const reentrantIdentityHost = reentrantIdentityHarness.createTransport();
      const reentrantIdentityGuest = reentrantIdentityHarness.createTransport();
      const reentrantIdentityDisposals: Promise<void>[] = [];
      let reentrantHostReadyCalls = 0;
      let reentrantGuestReadyCalls = 0;
      async function reentrantHostReady(): Promise<void> {
        reentrantHostReadyCalls += 1;
      }
      async function reentrantGuestReady(): Promise<void> {
        reentrantGuestReadyCalls += 1;
      }
      const reentrantIdentityInvite = await reentrantIdentityHost.host(
        invitePolicy(reentrantHostReady, 6, (authorization) => ({
          ...authorization,
          async authorizeJoin(rawJoinRequest, transportFingerprint) {
            const identity = await authorization.authorizeJoin(
              rawJoinRequest,
              transportFingerprint
            );
            return new Proxy(identity, {
              ownKeys(target) {
                reentrantIdentityDisposals.push(
                  reentrantIdentityGuest.dispose()
                );
                return Reflect.ownKeys(target);
              },
            });
          },
        }))
      );
      await expectTransportError(
        reentrantIdentityGuest.join(
          await joinInput(
            reentrantIdentityInvite,
            GUEST_IDS[0],
            reentrantGuestReady
          )
        ),
        'DISPOSED'
      );
      await Promise.all(reentrantIdentityDisposals);
      expect(reentrantHostReadyCalls).toBe(0);
      expect(reentrantGuestReadyCalls).toBe(0);
      await reentrantHostReady();
      await reentrantGuestReady();
      expect(reentrantHostReadyCalls).toBe(1);
      expect(reentrantGuestReadyCalls).toBe(1);
      await reentrantIdentityHost.dispose();
      await reentrantIdentityGuest.dispose();

      const invalidReentrantIdentityHarness = createHarness();
      const invalidReentrantIdentityHost =
        invalidReentrantIdentityHarness.createTransport();
      const invalidReentrantIdentityGuest =
        invalidReentrantIdentityHarness.createTransport();
      const invalidReentrantIdentityEvents = recordEvents(
        invalidReentrantIdentityGuest
      );
      const invalidReentrantIdentityDisposals: Promise<void>[] = [];
      const invalidReentrantIdentityInvite =
        await invalidReentrantIdentityHost.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            async authorizeJoin(rawJoinRequest, transportFingerprint) {
              const identity = await authorization.authorizeJoin(
                rawJoinRequest,
                transportFingerprint
              );
              const invalidIdentity = {
                ...identity,
                participantId: GUEST_IDS[5],
              };
              return new Proxy(invalidIdentity, {
                ownKeys(target) {
                  invalidReentrantIdentityDisposals.push(
                    invalidReentrantIdentityHost.dispose()
                  );
                  return Reflect.ownKeys(target);
                },
              });
            },
          }))
        );
      await expectTransportError(
        invalidReentrantIdentityGuest.join(
          await joinInput(
            invalidReentrantIdentityInvite,
            GUEST_IDS[0],
            reentrantGuestReady
          )
        ),
        'CONNECTION_INTERRUPTED'
      );
      await Promise.all(invalidReentrantIdentityDisposals);
      expect(invalidReentrantIdentityEvents.events).toEqual([
        { kind: 'connection-state-changed', state: 'joining' },
        {
          kind: 'connection-state-changed',
          state: 'terminal',
          reason: 'host-ended',
        },
      ]);
      invalidReentrantIdentityEvents.unsubscribe();
      await invalidReentrantIdentityHost.dispose();
      await invalidReentrantIdentityGuest.dispose();

      const frozenIdentityHarness = createHarness();
      const frozenIdentityHost = frozenIdentityHarness.createTransport();
      const frozenIdentityGuest = frozenIdentityHarness.createTransport();
      let identityMutationSucceeded = true;
      const frozenIdentityInvite = await frozenIdentityHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          async waitUntilReady(identity) {
            identityMutationSucceeded = Reflect.set(
              identity,
              'participantId',
              GUEST_IDS[5]
            );
            await authorization.waitUntilReady(identity);
          },
        }))
      );
      await frozenIdentityGuest.join(
        await joinInput(frozenIdentityInvite, GUEST_IDS[0])
      );
      expect(identityMutationSucceeded).toBe(false);
      await frozenIdentityHost.dispose();
      await frozenIdentityGuest.dispose();

      const mismatchHarness = createHarness();
      const mismatchHost = mismatchHarness.createTransport();
      const mismatchGuest = mismatchHarness.createTransport();
      const mismatchInvite = await mismatchHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          authorizeJoin: async () => ({
            kind: 'authenticated',
            loungeId: LOUNGE_ID,
            participantId: GUEST_IDS[5],
          }),
        }))
      );
      await expectTransportError(
        mismatchGuest.join(await joinInput(mismatchInvite, GUEST_IDS[0])),
        'AUTHENTICATION_MISMATCH'
      );
      await mismatchHost.dispose();
      await mismatchGuest.dispose();

      const readyHarness = createHarness();
      const readyHost = readyHarness.createTransport();
      const readyGuest = readyHarness.createTransport();
      const readyInvite = await readyHost.host(invitePolicy());
      const readyMessage = await expectTransportError(
        readyGuest.join(
          await joinInput(readyInvite, GUEST_IDS[0], async () => {
            throw new Error('passport-content-must-not-reflect');
          })
        ),
        'READY_REJECTED'
      );
      expect(readyMessage).not.toContain('passport-content');
      await readyHost.dispose();
      await readyGuest.dispose();

      const snapshotHarness = createHarness();
      const snapshotHost = snapshotHarness.createTransport();
      const snapshotGuest = snapshotHarness.createTransport();
      const authorizationGate = deferred();
      let originalReadyCalls = 0;
      let mutatedReadyCalls = 0;
      const snapshotInvite = await snapshotHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          async authorizeJoin(rawJoinRequest, transportFingerprint) {
            await authorizationGate.promise;
            return authorization.authorizeJoin(
              rawJoinRequest,
              transportFingerprint
            );
          },
        }))
      );
      const snapshotInput = await joinInput(
        snapshotInvite,
        GUEST_IDS[0],
        async () => {
          originalReadyCalls += 1;
        }
      );
      const snapshotJoin = snapshotGuest.join(snapshotInput);
      Reflect.set(snapshotInput, 'participantId', GUEST_IDS[5]);
      const mutatedReady = async () => {
        mutatedReadyCalls += 1;
      };
      await mutatedReady();
      mutatedReadyCalls = 0;
      Reflect.set(snapshotInput, 'waitUntilReady', mutatedReady);
      authorizationGate.resolve();
      await snapshotJoin;
      expect(originalReadyCalls).toBe(1);
      expect(mutatedReadyCalls).toBe(0);
      await snapshotHost.dispose();
      await snapshotGuest.dispose();

      const raceHarness = createHarness();
      const raceHost = raceHarness.createTransport();
      const raceGuest = raceHarness.createTransport();
      const hostReady = deferred();
      const hostReadyEntered = deferred();
      const raceInvite = await raceHost.host(
        invitePolicy(async () => {
          hostReadyEntered.resolve();
          await hostReady.promise;
        })
      );
      const joining = raceGuest.join(await joinInput(raceInvite, GUEST_IDS[0]));
      const joiningError = expectTransportError(joining, 'DISPOSED');
      await hostReadyEntered.promise;
      await raceGuest.dispose();
      hostReady.reject(new Error('native-ready-detail'));
      await joiningError;
      await raceHost.dispose();

      const lateAuthorizationHarness = createHarness();
      const lateAuthorizationHost = lateAuthorizationHarness.createTransport();
      const lateAuthorizationGuest = lateAuthorizationHarness.createTransport();
      const replacementGuest = lateAuthorizationHarness.createTransport();
      const lateAuthorizationGate = deferred();
      let authorizationCalls = 0;
      const lateAuthorizationInvite = await lateAuthorizationHost.host(
        invitePolicy(undefined, 2, (authorization) => ({
          ...authorization,
          async authorizeJoin(rawJoinRequest, transportFingerprint) {
            authorizationCalls += 1;
            if (authorizationCalls === 1) {
              await lateAuthorizationGate.promise;
            }
            return authorization.authorizeJoin(
              rawJoinRequest,
              transportFingerprint
            );
          },
        }))
      );
      const lateAuthorizationJoin = lateAuthorizationGuest.join(
        await joinInput(lateAuthorizationInvite, GUEST_IDS[0])
      );
      const lateAuthorizationError = expectTransportError(
        lateAuthorizationJoin,
        'DISPOSED'
      );
      await lateAuthorizationGuest.dispose();
      await replacementGuest.join(
        await joinInput(lateAuthorizationInvite, GUEST_IDS[1])
      );
      lateAuthorizationGate.reject(new Error('native-authorization-detail'));
      await lateAuthorizationError;
      const disposedAuthorizationListener = () => undefined;
      disposedAuthorizationListener();
      expect(() =>
        lateAuthorizationGuest.subscribe(disposedAuthorizationListener)
      ).toThrow(NearbyTransportError);
      await lateAuthorizationHost.dispose();
      await replacementGuest.dispose();

      const interruptedHarness = createHarness();
      const interruptedHost = interruptedHarness.createTransport();
      const interruptedGuest = interruptedHarness.createTransport();
      const interruptedEvents = recordEvents(interruptedGuest);
      const interruptedReady = deferred();
      const interruptedReadyEntered = deferred();
      const interruptedInvite = await interruptedHost.host(
        invitePolicy(async () => {
          interruptedReadyEntered.resolve();
          await interruptedReady.promise;
        })
      );
      const interruptedJoin = interruptedGuest.join(
        await joinInput(interruptedInvite, GUEST_IDS[0])
      );
      await interruptedReadyEntered.promise;
      await interruptedHost.leave('owner-left');
      interruptedReady.resolve();
      await expectTransportError(interruptedJoin, 'CONNECTION_INTERRUPTED');
      expect(interruptedEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'host-ended',
      });
      interruptedEvents.unsubscribe();
      await interruptedHost.dispose();
      await interruptedGuest.dispose();
    });

    it('Connection Event内のreentrant dispose後は外部callbackと成功通知を継続しない', async () => {
      const hostingHarness = createHarness();
      const hostingHost = hostingHarness.createTransport();
      const hostingDisposals: Promise<void>[] = [];
      hostingHost.subscribe((event) => {
        if (
          event.kind === 'connection-state-changed' &&
          event.state === 'hosting'
        ) {
          hostingDisposals.push(hostingHost.dispose());
        }
      });
      let postDisposeListenerCalls = 0;
      const postDisposeListener = (event: NearbyTransportEvent) => {
        if (
          event.kind === 'connection-state-changed' &&
          event.state === 'hosting'
        ) {
          postDisposeListenerCalls += 1;
        }
      };
      hostingHost.subscribe(postDisposeListener);
      await expectTransportError(hostingHost.host(invitePolicy()), 'DISPOSED');
      await Promise.all(hostingDisposals);
      expect(postDisposeListenerCalls).toBe(0);
      postDisposeListener({
        kind: 'connection-state-changed',
        state: 'hosting',
      });
      expect(postDisposeListenerCalls).toBe(1);

      const joiningHarness = createHarness();
      const joiningHost = joiningHarness.createTransport();
      const joiningGuest = joiningHarness.createTransport();
      const replacementGuest = joiningHarness.createTransport();
      let authorizationCalls = 0;
      const joiningInvite = await joiningHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          async authorizeJoin(rawJoinRequest, transportFingerprint) {
            authorizationCalls += 1;
            return authorization.authorizeJoin(
              rawJoinRequest,
              transportFingerprint
            );
          },
        }))
      );
      const joiningDisposals: Promise<void>[] = [];
      joiningGuest.subscribe((event) => {
        if (
          event.kind === 'connection-state-changed' &&
          event.state === 'joining'
        ) {
          joiningDisposals.push(joiningGuest.dispose());
        }
      });
      await expectTransportError(
        joiningGuest.join(await joinInput(joiningInvite, GUEST_IDS[0])),
        'DISPOSED'
      );
      expect(authorizationCalls).toBe(0);
      await Promise.all(joiningDisposals);
      await replacementGuest.join(await joinInput(joiningInvite, GUEST_IDS[1]));
      await joiningHost.dispose();
      await joiningGuest.dispose();
      await replacementGuest.dispose();

      const connectedHarness = createHarness();
      const connectedHost = connectedHarness.createTransport();
      const connectedGuest = connectedHarness.createTransport();
      const connectedHostEvents = recordEvents(connectedHost);
      const connectedDisposals: Promise<void>[] = [];
      connectedGuest.subscribe((event) => {
        if (
          event.kind === 'connection-state-changed' &&
          event.state === 'connected'
        ) {
          connectedDisposals.push(connectedGuest.dispose());
        }
      });
      const connectedInvite = await connectedHost.host(invitePolicy());
      await expectTransportError(
        connectedGuest.join(await joinInput(connectedInvite, GUEST_IDS[0])),
        'DISPOSED'
      );
      await Promise.all(connectedDisposals);
      expect(
        connectedHostEvents.events.flatMap((event) =>
          event.kind === 'membership-changed' ? [event.change] : []
        )
      ).toEqual(['joined', 'left']);
      connectedHostEvents.unsubscribe();
      await connectedHost.dispose();
      await connectedGuest.dispose();

      const membershipHarness = createHarness();
      const membershipHost = membershipHarness.createTransport();
      const firstMembershipGuest = membershipHarness.createTransport();
      const secondMembershipGuest = membershipHarness.createTransport();
      const membershipInvite = await membershipHost.host(invitePolicy());
      await firstMembershipGuest.join(
        await joinInput(membershipInvite, GUEST_IDS[0])
      );
      const secondMembershipInvite = await membershipHost.host(invitePolicy());
      const membershipDisposals: Promise<void>[] = [];
      membershipHost.subscribe((event) => {
        if (
          event.kind === 'membership-changed' &&
          event.change === 'joined' &&
          event.identity.participantId === GUEST_IDS[1]
        ) {
          membershipDisposals.push(secondMembershipGuest.dispose());
        }
      });
      const membershipHostEvents = recordEvents(membershipHost);
      const firstMembershipGuestEvents = recordEvents(firstMembershipGuest);
      await expectTransportError(
        secondMembershipGuest.join(
          await joinInput(secondMembershipInvite, GUEST_IDS[1])
        ),
        'DISPOSED'
      );
      await Promise.all(membershipDisposals);
      const changesForSecondGuest = (events: readonly NearbyTransportEvent[]) =>
        events.flatMap((event) =>
          event.kind === 'membership-changed' &&
          event.identity.participantId === GUEST_IDS[1]
            ? [event.change]
            : []
        );
      expect(changesForSecondGuest(membershipHostEvents.events)).toEqual([
        'joined',
        'left',
      ]);
      expect(changesForSecondGuest(firstMembershipGuestEvents.events)).toEqual([
        'joined',
        'left',
      ]);
      membershipHostEvents.unsubscribe();
      firstMembershipGuestEvents.unsubscribe();
      await membershipHost.dispose();
      await firstMembershipGuest.dispose();
      await secondMembershipGuest.dispose();

      const staleMembershipHarness = createHarness();
      const staleMembershipHost = staleMembershipHarness.createTransport();
      const staleMembershipFirstGuest =
        staleMembershipHarness.createTransport();
      const staleMembershipSecondGuest =
        staleMembershipHarness.createTransport();
      const staleMembershipInvite = await staleMembershipHost.host(
        invitePolicy()
      );
      await staleMembershipFirstGuest.join(
        await joinInput(staleMembershipInvite, GUEST_IDS[0])
      );
      const staleMembershipSecondInvite = await staleMembershipHost.host(
        invitePolicy()
      );
      const staleMembershipLeaves: Promise<void>[] = [];
      staleMembershipFirstGuest.subscribe((event) => {
        if (
          event.kind === 'membership-changed' &&
          event.change === 'joined' &&
          event.identity.participantId === GUEST_IDS[1]
        ) {
          staleMembershipLeaves.push(
            staleMembershipFirstGuest.leave('owner-left')
          );
        }
      });
      const staleMembershipEvents = recordEvents(staleMembershipFirstGuest);
      await staleMembershipSecondGuest.join(
        await joinInput(staleMembershipSecondInvite, GUEST_IDS[1])
      );
      await Promise.all(staleMembershipLeaves);
      const staleMembershipTerminalIndex =
        staleMembershipEvents.events.findIndex(
          (event) =>
            event.kind === 'connection-state-changed' &&
            event.state === 'terminal' &&
            event.reason === 'owner-left'
        );
      expect(staleMembershipTerminalIndex).toBeGreaterThanOrEqual(0);
      expect(
        staleMembershipEvents.events.slice(staleMembershipTerminalIndex + 1)
      ).toEqual([]);
      staleMembershipEvents.unsubscribe();
      await staleMembershipHost.dispose();
      await staleMembershipFirstGuest.dispose();
      await staleMembershipSecondGuest.dispose();

      const hostEndHarness = createHarness();
      const hostEndHost = hostEndHarness.createTransport();
      const hostEndFirstGuest = hostEndHarness.createTransport();
      const hostEndJoiningGuest = hostEndHarness.createTransport();
      const hostEndFirstInvite = await hostEndHost.host(invitePolicy());
      await hostEndFirstGuest.join(
        await joinInput(hostEndFirstInvite, GUEST_IDS[0])
      );
      const hostEndSecondInvite = await hostEndHost.host(invitePolicy());
      const hostEndDisposals: Promise<void>[] = [];
      hostEndHost.subscribe((event) => {
        if (
          event.kind === 'membership-changed' &&
          event.change === 'joined' &&
          event.identity.participantId === GUEST_IDS[1]
        ) {
          hostEndDisposals.push(hostEndHost.dispose());
        }
      });
      const hostEndFirstGuestEvents = recordEvents(hostEndFirstGuest);
      const hostEndJoiningGuestEvents = recordEvents(hostEndJoiningGuest);
      await expectTransportError(
        hostEndJoiningGuest.join(
          await joinInput(hostEndSecondInvite, GUEST_IDS[1])
        ),
        'CONNECTION_INTERRUPTED'
      );
      await Promise.all(hostEndDisposals);
      expect(changesForSecondGuest(hostEndFirstGuestEvents.events)).toEqual([]);
      expect(changesForSecondGuest(hostEndJoiningGuestEvents.events)).toEqual(
        []
      );
      expect(hostEndFirstGuestEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'host-ended',
      });
      expect(hostEndJoiningGuestEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'host-ended',
      });
      hostEndFirstGuestEvents.unsubscribe();
      hostEndJoiningGuestEvents.unsubscribe();
      await hostEndHost.dispose();
      await hostEndFirstGuest.dispose();
      await hostEndJoiningGuest.dispose();
    });

    it('Invite Rotation cleanup内のHost disposeを新Authorizationより優先する', async () => {
      const harness = createHarness();
      const host = harness.createTransport();
      const hostDisposals: Promise<void>[] = [];
      let disposeTriggered = false;
      await host.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          dispose() {
            authorization.dispose();
            if (!disposeTriggered) {
              disposeTriggered = true;
              hostDisposals.push(host.dispose());
            }
          },
        }))
      );
      let candidateDisposeCount = 0;
      await expectTransportError(
        host.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            dispose() {
              candidateDisposeCount += 1;
              authorization.dispose();
            },
          }))
        ),
        'DISPOSED'
      );
      await Promise.all(hostDisposals);
      expect(candidateDisposeCount).toBe(1);
      await host.dispose();

      const pendingHarness = createHarness();
      const pendingHost = pendingHarness.createTransport();
      const pendingGuest = pendingHarness.createTransport();
      const pendingReady = deferred();
      const pendingReadyEntered = deferred();
      const pendingInvite = await pendingHost.host(
        invitePolicy(async () => {
          pendingReadyEntered.resolve();
          await pendingReady.promise;
        })
      );
      const pendingJoin = pendingGuest.join(
        await joinInput(pendingInvite, GUEST_IDS[0])
      );
      const pendingJoinError = expectTransportError(
        pendingJoin,
        'CONNECTION_INTERRUPTED'
      );
      await pendingReadyEntered.promise;
      const pendingHostDisposals: Promise<void>[] = [];
      pendingGuest.subscribe((event) => {
        if (
          event.kind === 'connection-state-changed' &&
          event.state === 'terminal' &&
          event.reason === 'connection-interrupted'
        ) {
          pendingHostDisposals.push(pendingHost.dispose());
        }
      });
      let pendingCandidateDisposeCount = 0;
      await expectTransportError(
        pendingHost.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            dispose() {
              pendingCandidateDisposeCount += 1;
              authorization.dispose();
            },
          }))
        ),
        'DISPOSED'
      );
      pendingReady.resolve();
      await pendingJoinError;
      await Promise.all(pendingHostDisposals);
      expect(pendingCandidateDisposeCount).toBe(1);
      await pendingHost.dispose();
      await pendingGuest.dispose();

      const conditionHarness = createHarness();
      const conditionHost = conditionHarness.createTransport();
      const conditionGuest = conditionHarness.createTransport();
      let conditionTriggered = false;
      const conditionInvite = await conditionHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          dispose() {
            authorization.dispose();
            if (!conditionTriggered) {
              conditionTriggered = true;
              conditionHarness.interrupt(conditionHost, 'network-changed');
            }
          },
        }))
      );
      const conditionEvents = recordEvents(conditionHost);
      let conditionCandidateDisposeCount = 0;
      await expectTransportError(
        conditionHost.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            dispose() {
              conditionCandidateDisposeCount += 1;
              authorization.dispose();
            },
          }))
        ),
        'CONNECTION_INTERRUPTED'
      );
      expect(conditionCandidateDisposeCount).toBe(1);
      expect(conditionEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'connection-interrupted',
      });
      await expectTransportError(
        conditionGuest.join(await joinInput(conditionInvite, GUEST_IDS[0])),
        'HOST_NOT_FOUND'
      );
      conditionEvents.unsubscribe();
      await conditionHost.dispose();
      await conditionGuest.dispose();

      const nestedHarness = createHarness();
      const nestedHost = nestedHarness.createTransport();
      const nestedAttempts: Promise<LoungeInvite>[] = [];
      let nestedRotationStarted = false;
      let nestedCandidateDisposeCount = 0;
      await nestedHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          dispose() {
            authorization.dispose();
            if (!nestedRotationStarted) {
              nestedRotationStarted = true;
              nestedAttempts.push(
                nestedHost.host(
                  invitePolicy(undefined, 6, (nestedAuthorization) => ({
                    ...nestedAuthorization,
                    dispose() {
                      nestedCandidateDisposeCount += 1;
                      nestedAuthorization.dispose();
                    },
                  }))
                )
              );
            }
          },
        }))
      );
      let outerCandidateDisposeCount = 0;
      await expectTransportError(
        nestedHost.host(
          invitePolicy(undefined, 6, (authorization) => ({
            ...authorization,
            dispose() {
              outerCandidateDisposeCount += 1;
              authorization.dispose();
            },
          }))
        ),
        'CONNECTION_INTERRUPTED'
      );
      expect(nestedAttempts).toHaveLength(1);
      await Promise.all(
        nestedAttempts.map((attempt) =>
          expectTransportError(attempt, 'CONNECTION_INTERRUPTED')
        )
      );
      expect(outerCandidateDisposeCount).toBe(1);
      expect(nestedCandidateDisposeCount).toBe(1);
      await nestedHost.dispose();
    });

    it('不正Envelope、Listener隔離、配送中の退出、cleanup失敗を別契約にする', async () => {
      const harness = createHarness();
      const pair = await connectedPair(harness);
      await expectTransportError(
        pair.host.send(JSON.parse('null')),
        'INVALID_ENVELOPE'
      );
      await expectTransportError(
        pair.host.send(
          JSON.parse(
            JSON.stringify({
              delivery: { kind: 'broadcast' },
              payload: 'strict-envelope',
              unexpectedField: true,
            })
          )
        ),
        'INVALID_ENVELOPE'
      );
      await expectTransportError(
        pair.host.send(
          JSON.parse(
            JSON.stringify({
              delivery: { kind: 'target', participantId: 'invalid-target' },
              payload: 'invalid-target-envelope',
            })
          )
        ),
        'INVALID_ENVELOPE'
      );
      let accessorReads = 0;
      const accessorEnvelope = JSON.parse('{}');
      Object.defineProperties(accessorEnvelope, {
        delivery: {
          enumerable: true,
          value: { kind: 'broadcast' },
        },
        payload: {
          enumerable: true,
          get() {
            accessorReads += 1;
            return accessorReads === 1 ? 'small' : 'x'.repeat(100_000);
          },
        },
      });
      await expectTransportError(
        pair.host.send(accessorEnvelope),
        'INVALID_ENVELOPE'
      );
      expect(accessorReads).toBe(0);
      expect(accessorEnvelope.payload).toBe('small');
      expect(accessorReads).toBe(1);
      const unsubscribe = pair.guest.subscribe(() => {
        throw new Error('listener-secret-must-not-reflect');
      });
      const receivingEvents = recordEvents(pair.guest);
      await pair.host.send({
        delivery: { kind: 'broadcast' },
        payload: 'listener-isolated',
      });
      expect(receivedPayloads(receivingEvents.events)).toEqual([
        'listener-isolated',
      ]);
      unsubscribe();
      receivingEvents.unsubscribe();

      const proxyEvents = recordEvents(pair.guest);
      const proxyDisposals: Promise<void>[] = [];
      const proxyEnvelope: NearbyOutboundEnvelope = {
        delivery: { kind: 'broadcast' },
        payload: 'must-not-queue-after-dispose',
      };
      const reentrantEnvelope = new Proxy(proxyEnvelope, {
        ownKeys(target) {
          proxyDisposals.push(pair.host.dispose());
          return Reflect.ownKeys(target);
        },
      });
      await expectTransportError(pair.host.send(reentrantEnvelope), 'DISPOSED');
      await Promise.all(proxyDisposals);
      expect(receivedPayloads(proxyEvents.events)).toEqual([]);
      proxyEvents.unsubscribe();
      await pair.host.dispose();
      await pair.guest.dispose();

      const broadcastHarness = createHarness();
      const broadcastGroup = await connectedTriple(broadcastHarness);
      const broadcastHostDisposals: Promise<void>[] = [];
      broadcastGroup.firstGuest.subscribe((event) => {
        if (
          event.kind === 'envelope-received' &&
          event.envelope.payload === 'interrupt-broadcast'
        ) {
          broadcastHostDisposals.push(broadcastGroup.host.dispose());
        }
      });
      const remainingBroadcastEvents = recordEvents(broadcastGroup.secondGuest);
      await expectTransportError(
        broadcastGroup.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'interrupt-broadcast',
        }),
        'DELIVERY_FAILED'
      );
      await Promise.all(broadcastHostDisposals);
      expect(receivedPayloads(remainingBroadcastEvents.events)).toEqual([]);
      expect(remainingBroadcastEvents.events).toContainEqual({
        kind: 'connection-state-changed',
        state: 'terminal',
        reason: 'host-ended',
      });
      remainingBroadcastEvents.unsubscribe();
      await broadcastGroup.host.dispose();
      await broadcastGroup.firstGuest.dispose();
      await broadcastGroup.secondGuest.dispose();

      const deliveryHarness = createHarness();
      const {
        host: deliveryHost,
        firstGuest: departingGuest,
        secondGuest: remainingGuest,
      } = await connectedTriple(deliveryHarness);
      const delivery = deliveryHost.send({
        delivery: { kind: 'target', participantId: GUEST_IDS[0] },
        payload: 'delivery-secret-must-not-reflect',
      });
      await departingGuest.leave('owner-left');
      const deliveryMessage = await expectTransportError(
        delivery,
        'DELIVERY_FAILED'
      );
      expect(deliveryMessage).not.toContain('secret');
      await deliveryHost.dispose();
      await departingGuest.dispose();
      await remainingGuest.dispose();

      const cleanupHarness = createHarness();
      const cleanupHost = cleanupHarness.createTransport();
      await cleanupHost.host(
        invitePolicy(undefined, 6, (authorization) => ({
          ...authorization,
          dispose() {
            authorization.dispose();
            throw new Error('native-cleanup-detail');
          },
        }))
      );
      await expectTransportError(
        cleanupHost.dispose(),
        'CONNECTION_INTERRUPTED'
      );
      await cleanupHost.dispose();
    });

    it('Listenerを16件に制限しdispose後は登録、Queue、配送先を残さない', async () => {
      const harness = createHarness();
      const pair = await connectedPair(harness);
      const unsubscribers = subscribeListeners(pair.guest, 16);
      harness.interrupt(pair.guest, 'app-background');
      const rejectedListener = () => undefined;
      rejectedListener();
      expect(() => pair.guest.subscribe(rejectedListener)).toThrow(
        NearbyTransportError
      );

      for (const unsubscribe of unsubscribers) {
        unsubscribe();
        unsubscribe();
      }
      await pair.host.dispose();
      await pair.guest.dispose();
      await expectTransportError(
        pair.host.send({
          delivery: { kind: 'broadcast' },
          payload: 'after-dispose',
        }),
        'DISPOSED'
      );
    });
  });
}

export function runNearbyTransportDiagnosticsContract(
  adapterName: string,
  createHarness: CreateNearbyTransportDiagnosticsHarness
): void {
  describe(`NearbyTransport Diagnostics: ${adapterName}`, () => {
    it('Reference固有のEndpoint、Listener、Queue診断値をdisposeで0へ戻す', async () => {
      const harness = createHarness();
      const pair = await connectedPair(harness);
      const unsubscribers = subscribeListeners(pair.guest, 16);
      const queued = Array.from({ length: 8 }, (_, index) =>
        pair.host.send({
          delivery: { kind: 'broadcast' },
          payload: `diagnostic-${index}`,
        })
      );
      const queuedResults = Promise.allSettled(queued);

      expect(harness.activeEndpointCount()).toBe(2);
      expect(harness.activeListenerCount(pair.guest)).toBe(16);
      expect(harness.queuedEnvelopeCount(pair.host)).toBe(8);

      for (const unsubscribe of unsubscribers) unsubscribe();
      await pair.host.dispose();
      await pair.guest.dispose();
      await queuedResults;

      expect(harness.activeEndpointCount()).toBe(0);
      expect(harness.activeListenerCount(pair.guest)).toBe(0);
      expect(harness.queuedEnvelopeCount(pair.host)).toBe(0);
    });
  });
}
