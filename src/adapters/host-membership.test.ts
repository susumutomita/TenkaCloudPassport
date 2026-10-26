import { describe, expect, it } from 'bun:test';
import { RULES_PROVIDER_CAPABILITY } from '../domain/capability';
import { createLoungeInvite } from '../domain/lounge-invite';
import type { ParticipantId } from '../domain/session-identifiers';
import {
  createNearbyJoinDescriptor,
  type NearbyTransportConnectionState,
  NearbyTransportError,
} from '../ports/nearby-transport';
import { validateNearbyHostBinding } from '../ports/nearby-transport-validation';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';
import { EndpointLifecycle } from './endpoint-lifecycle';
import { HostMembership } from './host-membership';

const HOST = 'ptc_11111111111111111111111111111111';
const FIRST = 'ptc_22222222222222222222222222222222';
const SECOND = 'ptc_33333333333333333333333333333333';
class Endpoint extends EndpointLifecycle<HostMembership<Endpoint>> {
  joinInFlight = false;
}

function endpoint(state: NearbyTransportConnectionState = 'idle'): Endpoint {
  const value = new Endpoint(() => undefined);
  value.setPhase(state);
  return value;
}

function departures() {
  const events: string[] = [];
  return {
    events,
    effects: {
      unregister: () => {
        events.push('unregister');
      },
      broadcast: () => {
        events.push('broadcast');
      },
      terminal: () => {
        events.push('terminal');
      },
      refresh: () => {
        events.push('refresh');
      },
    },
  };
}

function fixture(capacity = 3) {
  const host = endpoint('hosting');
  const binding = validateNearbyHostBinding({
    hostDiscoveryHint: 'loopback-ref://membership',
    transportFingerprint: `sha256_${'12'.repeat(32)}`,
  });
  const invite = createLoungeInvite({
    loungeId: 'lng_11111111111111111111111111111111',
    joinSecret: `jsc_${'12'.repeat(32)}`,
    ...binding,
    issuedAtEpochMs: 1_000,
    expiresAtEpochMs: 100_000,
    capacity,
    requiredCapabilities: [RULES_PROVIDER_CAPABILITY],
  });
  const identity = (
    participantId: ParticipantId = FIRST
  ): AuthenticatedTransportIdentity => ({
    kind: 'authenticated',
    loungeId: invite.loungeId,
    participantId,
  });
  const membership = new HostMembership(
    host,
    binding,
    HOST,
    invite.loungeId,
    capacity,
    createNearbyJoinDescriptor(invite),
    {
      authorizeJoin: async () => identity(),
      waitUntilReady: async () => undefined,
      dispose: () => undefined,
    }
  );
  host.attachHost(membership, identity(HOST));
  return { membership, host, identity };
}

describe('host membership ownership', () => {
  it('commits removal before callbacks, retains departing identity and tolerates reentrant departure', () => {
    const { membership, identity } = fixture();
    const first = endpoint();
    membership.reserve(first, FIRST, false);
    membership.commit(first, identity());
    const sequence: string[] = [];
    const effects = {
      unregister() {
        sequence.push('unregister');
      },
      broadcast(departing: AuthenticatedTransportIdentity) {
        sequence.push('broadcast');
        expect(membership.guests.size).toBe(0);
        expect([first.role, first.record, first.state]).toEqual([
          null,
          null,
          'terminal',
        ]);
        expect(first.identity).toEqual(departing);
        membership.depart(first, 'owner-left', effects);
      },
      terminal(departing: Endpoint) {
        sequence.push('terminal');
        expect(departing).toBe(first);
      },
      refresh() {
        sequence.push('refresh');
        expect(first.identity).toBeNull();
      },
    };
    membership.depart(first, 'owner-left', effects);
    expect(sequence).toEqual([
      'unregister',
      'broadcast',
      'terminal',
      'refresh',
    ]);
    expect(first.identity).toBeNull();
  });

  it('keeps terminal-member removal distinct from a foreign or already-disposed affiliation', () => {
    const { membership, identity } = fixture();
    const first = endpoint();
    membership.reserve(first, FIRST, false);
    membership.commit(first, identity());
    const foreign = endpoint('disposed');
    foreign.attachGuest(membership, identity());
    const departure = departures();
    membership.depart(foreign, 'owner-left', departure.effects);
    expect(departure.events).toEqual([]);
    expect(membership.guests.get(FIRST)).toBe(first);
    first.setPhase('terminal');
    membership.depart(first, 'owner-left', departure.effects);
    expect(departure.events).toEqual(['unregister', 'broadcast', 'refresh']);
    expect(membership.guests.size).toBe(0);
    expect(first.identity).toBeNull();
  });

  it('owns reservation and membership indices without exposing their mutation methods', () => {
    const { membership, identity } = fixture();
    const first = endpoint();
    const foreign = endpoint();
    membership.reserve(first, FIRST, false);
    expect(membership.pendingGuests.size).toBe(1);
    expect(membership.pendingGuests.get(FIRST)).toBe(first);
    expect(Object.isFrozen(first.pendingReservation)).toBe(true);
    expect(membership.releaseReservation(FIRST, foreign)).toBe(false);
    expect(Reflect.get(membership.pendingGuests, 'delete')).toBeUndefined();
    expect(Reflect.get(membership.guests, 'set')).toBeUndefined();
    expect(() => Object.assign(membership.guests, { size: 99 })).toThrow(
      TypeError
    );
    const input = identity();
    membership.commit(first, input);
    Object.assign(input, { participantId: SECOND });
    expect(first.identity?.participantId).toBe(FIRST);
    expect(Object.isFrozen(first.identity)).toBe(true);
    expect(membership.pendingGuests.size).toBe(0);
    expect(membership.guests.get(FIRST)).toBe(first);
    expect([...membership.guests.keys()]).toEqual([FIRST]);
    expect([...membership.guests.values()]).toEqual([first]);
    expect([...membership.guests]).toEqual([[FIRST, first]]);
    const departure = departures();
    membership.depart(foreign, 'owner-left', departure.effects);
    expect(departure.events).toEqual(['terminal']);
    expect(membership.guests.get(FIRST)).toBe(first);
    membership.depart(first, 'owner-left', departure.effects);
    expect(departure.events).toEqual([
      'terminal',
      'unregister',
      'broadcast',
      'terminal',
      'refresh',
    ]);
    expect(membership.guests.size).toBe(0);
  });

  it('retains capacity for terminal members until explicit removal', () => {
    const { membership, identity } = fixture(2);
    const first = endpoint();
    membership.reserve(first, FIRST, false);
    membership.commit(first, identity());
    first.setPhase('terminal');
    expect(() => membership.reserve(endpoint(), SECOND, false)).toThrow(
      new NearbyTransportError('CAPACITY_EXCEEDED')
    );
    expect(() => membership.clearMembers()).toThrow(
      new NearbyTransportError('INVALID_STATE')
    );
    expect(membership.guests.size).toBe(1);
    membership.depart(first, 'owner-left', departures().effects);
    membership.reserve(endpoint(), SECOND, false);
    expect(membership.pendingGuests.size).toBe(1);
  });

  it('rejects duplicate, conflicting and out-of-order admissions without changing ownership', () => {
    const { membership, identity } = fixture();
    const first = endpoint();
    membership.reserve(first, FIRST, false);
    expect(() => membership.reserve(first, SECOND, false)).toThrow(
      new NearbyTransportError('INVALID_STATE')
    );
    expect(() => membership.reserve(endpoint(), HOST, false)).toThrow(
      new NearbyTransportError('PARTICIPANT_IN_USE')
    );
    expect(() => membership.reserve(endpoint(), FIRST, false)).toThrow(
      new NearbyTransportError('PARTICIPANT_IN_USE')
    );
    expect(() => membership.commit(endpoint(), identity())).toThrow(
      new NearbyTransportError('CONNECTION_INTERRUPTED')
    );
    expect(membership.pendingGuests.get(FIRST)).toBe(first);
    expect(membership.releaseReservation(FIRST, first)).toBe(true);
    expect(() => membership.commit(first, identity())).toThrow(
      new NearbyTransportError('CONNECTION_INTERRUPTED')
    );
    expect(membership.guests.size).toBe(0);
    const connected = endpoint('connected');
    expect(() => membership.reserve(connected, SECOND, false)).toThrow(
      new NearbyTransportError('INVALID_STATE')
    );
    expect(() => membership.reserve(endpoint(), SECOND, true)).toThrow(
      new NearbyTransportError('INVALID_STATE')
    );
    expect(() =>
      membership.reserve(endpoint('reconnecting'), SECOND, true)
    ).toThrow(new NearbyTransportError('INVALID_STATE'));
  });

  it('binds reconnect identity to retained membership and releases it only explicitly', () => {
    const { membership, identity } = fixture();
    const first = endpoint();
    membership.reserve(first, FIRST, false);
    membership.commit(first, identity());
    first.joinInFlight = false;
    first.setPhase('reconnecting');
    membership.reserve(first, FIRST, true);
    expect(membership.reconnectIdentity(first, FIRST)).toEqual(identity());
    expect(() => membership.reserve(endpoint(), FIRST, false)).toThrow(
      new NearbyTransportError('PARTICIPANT_IN_USE')
    );
    expect(() => membership.reconnectIdentity(endpoint(), FIRST)).toThrow(
      new NearbyTransportError('AUTHENTICATION_MISMATCH')
    );
    expect(membership.active).toBe(true);
    expect(membership.deactivate()).toBe(true);
    expect(membership.deactivate()).toBe(false);
    expect(() => membership.reserve(endpoint(), SECOND, false)).toThrow(
      new NearbyTransportError('HOST_NOT_FOUND')
    );
    expect(() => membership.commit(first, identity())).toThrow(
      new NearbyTransportError('CONNECTION_INTERRUPTED')
    );
    expect(() => membership.reconnectIdentity(first, FIRST)).toThrow(
      new NearbyTransportError('AUTHENTICATION_MISMATCH')
    );
    membership.clearMembers();
    expect(() => membership.reconnectIdentity(first, FIRST)).toThrow(
      new NearbyTransportError('AUTHENTICATION_MISMATCH')
    );
  });
});
