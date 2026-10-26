import { describe, expect, it } from 'bun:test';
import {
  NearbyTransportError,
  type NearbyTransportTerminalReason,
} from '../ports/nearby-transport';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';
import { EndpointLifecycle } from './endpoint-lifecycle';

interface Session {
  active: boolean;
  authorization: object;
  host: EndpointLifecycle<Session>;
}
const IDENTITY: AuthenticatedTransportIdentity = {
  kind: 'authenticated',
  loungeId: 'lng_11111111111111111111111111111111',
  participantId: 'ptc_22222222222222222222222222222222',
};
function fixture() {
  const announcements: string[] = [];
  const callbacks: { guest?: () => void } = {};
  const host = new EndpointLifecycle<Session>((state) => {
    announcements.push(`host:${state}`);
  });
  const record: Session = { active: true, authorization: {}, host };
  host.attachHost(record, IDENTITY);
  host.setPhase('hosting');
  const guest = new EndpointLifecycle<Session>((state) => {
    announcements.push(`guest:${state}`);
    callbacks.guest?.();
  });
  return { host, record, guest, announcements, callbacks };
}

describe('endpoint lifetime and affiliation ownership', () => {
  it('announces only committed phases and preserves terminal reasons', () => {
    const events: {
      state: string;
      reason: NearbyTransportTerminalReason | undefined;
    }[] = [];
    const owner = new EndpointLifecycle<Session>((state, reason) => {
      events.push({ state, reason });
    });
    owner.announceCommittedState('connected');
    expect(events).toEqual([]);
    owner.setPhase('connected');
    owner.announceCommittedState('connected');
    owner.commitTerminal();
    owner.announceCommittedState('terminal', 'host-ended');
    expect(events).toEqual([
      { state: 'connected', reason: undefined },
      { state: 'terminal', reason: 'host-ended' },
    ]);
  });

  it('announces recovery before refreshing and rereads affiliation after reentrant callbacks', () => {
    const { guest, record, callbacks } = fixture();
    const order: string[] = [];
    const terminate = () => {
      order.push('terminate');
    };
    const refresh = () => {
      order.push('refresh');
    };
    guest.attachGuest(record, IDENTITY);
    guest.setPhase('connected');
    callbacks.guest = () => {
      order.push(`announced:${guest.state}`);
    };
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(order).toEqual(['announced:reconnecting', 'refresh']);
    order.length = 0;
    guest.setPhase('connected');
    callbacks.guest = () => {
      order.push('detach');
      guest.detachPreservingIdentity();
    };
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(order).toEqual(['detach']);
    order.length = 0;
    guest.attachGuest(record, IDENTITY);
    guest.setPhase('connected');
    callbacks.guest = () => {
      order.push('dispose');
      guest.advanceGeneration();
      guest.resetAffiliation();
      guest.transition('disposed');
    };
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(order).toEqual(['dispose']);
    expect(guest.state).toBe('disposed');
  });

  it('owns atomic affiliation snapshots and preserves departing identity until cleanup', () => {
    const { record, guest } = fixture();
    expect(guest.lifecycle).toBe(guest);
    expect([
      guest.state,
      guest.role,
      guest.record,
      guest.identity,
      guest.pendingReservation,
      guest.operationGeneration,
    ]).toEqual(['idle', null, null, null, null, 0]);
    const input = { ...IDENTITY };
    guest.attachGuest(record, input);
    Object.assign(input, {
      participantId: 'ptc_33333333333333333333333333333333',
    });
    expect(guest.identity).toEqual(IDENTITY);
    expect(Object.isFrozen(guest.identity)).toBe(true);
    expect([guest.role, guest.record]).toEqual(['guest', record]);
    guest.detachPreservingIdentity();
    expect([guest.role, guest.record, guest.identity]).toEqual([
      null,
      null,
      IDENTITY,
    ]);
    guest.clearIdentity();
    expect(guest.identity).toBeNull();
    guest.attachHost(record, IDENTITY);
    expect([guest.role, guest.record]).toEqual(['host', record]);
    guest.resetAffiliation();
    expect([guest.role, guest.record, guest.identity]).toEqual([
      null,
      null,
      null,
    ]);
    expect(guest.advanceGeneration()).toBe(1);
    expect(guest.advanceGeneration()).toBe(2);
    expect(guest.operationGeneration).toBe(2);
  });

  it('owns immutable reservations separately from retained member lifetime', () => {
    const { record, guest } = fixture();
    guest.reserve(record, IDENTITY.participantId);
    const reservation = guest.pendingReservation;
    if (!reservation) throw new Error('Expected admitted reservation');
    expect(guest.pendingReservation).toEqual({
      record,
      participantId: IDENTITY.participantId,
    });
    expect(() =>
      Object.assign(reservation, { participantId: 'changed' })
    ).toThrow(TypeError);
    guest.attachGuest(record, IDENTITY);
    guest.releaseReservation();
    expect(guest.pendingReservation).toBeNull();
    expect(guest.record).toBe(record);
    expect(guest.identity).toEqual(IDENTITY);
  });

  it('retains terminal and disposed transition precedence and once-only terminal commits', () => {
    const { guest } = fixture();
    expect(guest.transition('joining')).toBe(true);
    expect(guest.commitTerminal()).toBe(true);
    expect(guest.commitTerminal()).toBe(false);
    expect(guest.transition('connected')).toBe(false);
    expect(guest.state).toBe('terminal');
    expect(guest.transition('disposed')).toBe(true);
    expect(guest.commitTerminal()).toBe(false);
    expect(guest.transition('joining')).toBe(false);
    expect(guest.transition('disposed')).toBe(true);
    expect(guest.state).toBe('disposed');
  });

  it('borrows active hosts without confusing retained guest membership with host ownership', () => {
    const { record, host, guest } = fixture();
    expect(guest.activeHostedRecord()).toBeNull();
    guest.attachGuest(record, IDENTITY);
    expect(guest.activeHostedRecord()).toBeNull();
    expect(host.activeHostedRecord()).toBe(record);
    record.active = false;
    expect(host.activeHostedRecord()).toBeNull();
  });

  it('prepares hosted conditions only for the still-owned live session before preparing recipients', () => {
    const { record, host } = fixture();
    const other = fixture().record;
    let preparations = 0;
    const prepare = () => {
      preparations += 1;
      expect(host.state).toBe('reconnecting');
      return ['recipient'];
    };
    expect(host.prepareHostedCondition(other, prepare)).toEqual([]);
    record.active = false;
    expect(host.prepareHostedCondition(record, prepare)).toEqual([]);
    record.active = true;
    host.setPhase('terminal');
    expect(host.prepareHostedCondition(record, prepare)).toEqual([]);
    host.setPhase('disposed');
    expect(host.prepareHostedCondition(record, prepare)).toEqual([]);
    expect(preparations).toBe(0);
    host.setPhase('hosting');
    expect(host.prepareHostedCondition(record, prepare)).toEqual(['recipient']);
    expect(preparations).toBe(1);
  });

  it('prepares guest and host phases while respecting the host terminal-commit window', () => {
    const { record, host, guest } = fixture();
    const hostFor = (session: Session) => session.host;
    expect(guest.prepareGuestCondition(hostFor)).toBeNull();
    guest.attachGuest(record, IDENTITY);
    record.active = false;
    expect(guest.prepareGuestCondition(hostFor)).toBeNull();
    record.active = true;
    for (const phase of ['disposed', 'terminal'] as const) {
      guest.setPhase(phase);
      expect(guest.prepareGuestCondition(hostFor)).toBeNull();
      guest.setPhase('connected');
      host.setPhase(phase);
      expect(guest.prepareGuestCondition(hostFor)).toBeNull();
      expect(guest.state).toBe('reconnecting');
    }
    host.setPhase('connected');
    guest.setPhase('connected');
    expect(guest.prepareGuestCondition(hostFor)).toBe(host);
    expect([guest.state, host.state]).toEqual(['reconnecting', 'reconnecting']);
  });

  it('finishes recovery against the current generation, reservation and affiliation', () => {
    const { guest, record } = fixture();
    const events: string[] = [];
    const terminate = () => {
      events.push('terminate');
    };
    const refresh = (session: Session) => {
      expect(session).toBe(record);
      events.push('refresh');
    };
    guest.finishRecoverableCondition(1, terminate, refresh);
    expect(events).toEqual([]);
    for (const phase of ['disposed', 'terminal'] as const) {
      guest.setPhase(phase);
      guest.finishRecoverableCondition(0, terminate, refresh);
    }
    guest.setPhase('idle');
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(guest.state).toBe('idle');
    guest.reserve(record, IDENTITY.participantId);
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(events).toEqual(['terminate']);
    guest.releaseReservation();
    guest.setPhase('joining');
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(guest.state).toBe('reconnecting');
    guest.attachGuest(record, IDENTITY);
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(events).toEqual(['terminate', 'refresh']);
    record.active = false;
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(events).toEqual(['terminate', 'refresh']);
    record.active = true;
    guest.attachHost(record, IDENTITY);
    guest.finishRecoverableCondition(0, terminate, refresh);
    expect(events).toEqual(['terminate', 'refresh']);
  });

  it('checks disposed and generation before session/auth changes and preserves terminal failure reasons', () => {
    const { record, guest } = fixture();
    const reasons: NearbyTransportTerminalReason[] = [];
    const terminate = (reason: NearbyTransportTerminalReason) => {
      reasons.push(reason);
      guest.transition('terminal');
    };
    const authorization = record.authorization;
    guest.setPhase('disposed');
    record.active = false;
    expect(() => guest.assertJoinActive(record, {}, 1, terminate)).toThrow(
      new NearbyTransportError('DISPOSED')
    );
    guest.setPhase('joining');
    expect(() => guest.assertJoinActive(record, {}, 1, terminate)).toThrow(
      new NearbyTransportError('CONNECTION_INTERRUPTED')
    );
    expect(reasons).toEqual([]);
    expect(() =>
      guest.assertJoinActive(record, authorization, 0, terminate)
    ).toThrow(new NearbyTransportError('CONNECTION_INTERRUPTED'));
    expect(reasons).toEqual(['host-ended']);
    expect(() =>
      guest.assertJoinActive(record, authorization, 0, terminate)
    ).toThrow(new NearbyTransportError('CONNECTION_INTERRUPTED'));
    expect(reasons).toEqual(['host-ended']);
    record.active = true;
    guest.setPhase('joining');
    expect(() => guest.assertJoinActive(record, {}, 0, terminate)).toThrow(
      new NearbyTransportError('CONNECTION_INTERRUPTED')
    );
    expect(reasons).toEqual(['host-ended', 'connection-interrupted']);
    expect(() => guest.assertJoinActive(record, {}, 0, terminate)).toThrow(
      new NearbyTransportError('CONNECTION_INTERRUPTED')
    );
    guest.setPhase('connected');
    expect(() =>
      guest.assertJoinActive(record, authorization, 0, terminate)
    ).toThrow(new NearbyTransportError('CONNECTION_INTERRUPTED'));
    expect(reasons).toHaveLength(3);
    for (const phase of ['joining', 'reconnecting'] as const) {
      guest.setPhase(phase);
      expect(() =>
        guest.assertJoinActive(record, authorization, 0, terminate)
      ).not.toThrow();
    }
  });
});
