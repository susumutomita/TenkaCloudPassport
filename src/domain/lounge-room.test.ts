import { describe, expect, it } from 'bun:test';
import { endHostedLounge, LOUNGE_TTL_MS, leaveLounge } from './lounge';
import { LOUNGE_INVITE_SCHEMA_VERSION } from './lounge-invite';
import {
  advanceLoungeRoom,
  createLoungeRoom,
  destroyLoungeRoom,
  type FormingLoungeRoom,
  inviteForRoom,
  joinLoungeRoom,
  LoungeRoomError,
  type LoungeRoomState,
  markParticipantReady,
  type ReadyLoungeRoom,
  ROOM_CAPACITY,
  startLoungeFromRoom,
} from './lounge-room';
import {
  createLocalPrivateProfile,
  type PublicPassport,
  projectPublicPassport,
} from './passport';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';
const HOST_ID = 'ptc_00000000000000000000000000000001';
const GUEST_ID = 'ptc_00000000000000000000000000000002';
const THIRD_ID = 'ptc_00000000000000000000000000000003';

const CLOCK = { wallClockMs: 1_000_000, monotonicMs: 5_000 };

function passport(
  clueIds: readonly string[] = ['open-source']
): PublicPassport {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
    languageCodes: [],
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });
}

function expectRoomError(
  action: () => void,
  code: LoungeRoomError['code']
): void {
  try {
    action();
    throw new Error('LoungeRoomError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LoungeRoomError);
    if (error instanceof LoungeRoomError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('Lounge Room の Ready gating', () => {
  it('Host 作成時に壁時計と単調増加時計の 20 分期限を設定する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });

    expect(room).toEqual({
      status: 'forming',
      loungeId: LOUNGE_ID,
      expiresAtWallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      startedAtMonotonicMs: CLOCK.monotonicMs,
      participants: [],
    });
  });

  it('無効な時計では Room を作成しない', () => {
    expectRoomError(
      () =>
        createLoungeRoom({
          loungeId: LOUNGE_ID,
          clock: { wallClockMs: Number.NaN, monotonicMs: 0 },
        }),
      'INVALID_CLOCK'
    );
  });

  it('参加者が 1 名だけでは Ready にならない', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joined = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const readied = markParticipantReady(joined, {
      participantId: HOST_ID,
      clock: CLOCK,
    });

    expect(readied.status).toBe('forming');
  });

  it('参加者が 2 名かつ双方が Ready になった時点で ready へ遷移する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joinedHost = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(['open-source']),
      clock: CLOCK,
    });
    const joinedGuest = joinLoungeRoom(joinedHost, {
      participantId: GUEST_ID,
      publicPassport: passport(['accessibility']),
      clock: CLOCK,
    });
    const hostReady = markParticipantReady(joinedGuest, {
      participantId: HOST_ID,
      clock: CLOCK,
    });

    expect(hostReady.status).toBe('forming');

    const bothReady = markParticipantReady(hostReady, {
      participantId: GUEST_ID,
      clock: CLOCK,
    });

    expect(bothReady.status).toBe('ready');
    if (bothReady.status === 'ready') {
      expect(bothReady.participants).toHaveLength(ROOM_CAPACITY);
      expect(bothReady.participants.every((p) => p.ready)).toBe(true);
    }
  });

  it(`定員 ${ROOM_CAPACITY} 名を超える参加を拒否する（満員）`, () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joinedHost = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const joinedGuest = joinLoungeRoom(joinedHost, {
      participantId: GUEST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });

    expectRoomError(
      () =>
        joinLoungeRoom(joinedGuest, {
          participantId: THIRD_ID,
          publicPassport: passport(),
          clock: CLOCK,
        }),
      'ROOM_FULL'
    );
  });

  it('期限切れの Room への参加を拒否する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const expiredClock = {
      wallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      monotonicMs: CLOCK.monotonicMs,
    };

    expectRoomError(
      () =>
        joinLoungeRoom(room, {
          participantId: HOST_ID,
          publicPassport: passport(),
          clock: expiredClock,
        }),
      'ROOM_EXPIRED'
    );
  });

  it('期限切れの Room で Ready 操作も拒否する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joined = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const expiredClock = {
      wallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      monotonicMs: CLOCK.monotonicMs,
    };

    expectRoomError(
      () =>
        markParticipantReady(joined, {
          participantId: HOST_ID,
          clock: expiredClock,
        }),
      'ROOM_EXPIRED'
    );
  });

  it('存在しない参加者の Ready 操作を拒否する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joined = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });

    expectRoomError(
      () =>
        markParticipantReady(joined, {
          participantId: GUEST_ID,
          clock: CLOCK,
        }),
      'PARTICIPANT_NOT_FOUND'
    );
  });

  it('すでに ready へ遷移した Room への参加と Ready 操作を拒否する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joinedHost = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const joinedGuest = joinLoungeRoom(joinedHost, {
      participantId: GUEST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const hostReady = markParticipantReady(joinedGuest, {
      participantId: HOST_ID,
      clock: CLOCK,
    });
    const ready = markParticipantReady(hostReady, {
      participantId: GUEST_ID,
      clock: CLOCK,
    });

    expectRoomError(
      () =>
        joinLoungeRoom(ready, {
          participantId: THIRD_ID,
          publicPassport: passport(),
          clock: CLOCK,
        }),
      'ROOM_NOT_FORMING'
    );
    expectRoomError(
      () =>
        markParticipantReady(ready, {
          participantId: HOST_ID,
          clock: CLOCK,
        }),
      'ROOM_NOT_FORMING'
    );
  });

  it('壁時計が 20 分期限へ達した時点で expired へ遷移する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const advanced = advanceLoungeRoom(room, {
      wallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      monotonicMs: CLOCK.monotonicMs + 100,
    });

    expect(advanced).toEqual({ status: 'expired', loungeId: LOUNGE_ID });
  });

  it('壁時計が戻っても単調増加時計の 20 分経過で expired へ遷移する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const advanced = advanceLoungeRoom(room, {
      wallClockMs: 0,
      monotonicMs: CLOCK.monotonicMs + LOUNGE_TTL_MS,
    });

    expect(advanced).toEqual({ status: 'expired', loungeId: LOUNGE_ID });
  });

  it('満了前の期限確認では forming 状態を維持する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const advanced = advanceLoungeRoom(room, {
      wallClockMs: CLOCK.wallClockMs + 100,
      monotonicMs: CLOCK.monotonicMs + 100,
    });

    expect(advanced).toBe(room);
  });

  it('expired 後の期限確認は同じ expired 状態を返す', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const expired = advanceLoungeRoom(room, {
      wallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      monotonicMs: CLOCK.monotonicMs,
    });
    const advancedAgain = advanceLoungeRoom(expired, {
      wallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS + 1_000,
      monotonicMs: CLOCK.monotonicMs + 1_000,
    });

    expect(advancedAgain).toBe(expired);
  });

  it('無効な時計での期限確認を拒否する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });

    expectRoomError(
      () =>
        advanceLoungeRoom(room, {
          wallClockMs: Number.NaN,
          monotonicMs: 0,
        }),
      'INVALID_CLOCK'
    );
  });

  it('ready な Room から Owner と Encounter の Public Passport を持つ Active Lounge を開始する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joinedHost = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(['open-source']),
      clock: CLOCK,
    });
    const joinedGuest = joinLoungeRoom(joinedHost, {
      participantId: GUEST_ID,
      publicPassport: passport(['accessibility']),
      clock: CLOCK,
    });
    const hostReady = markParticipantReady(joinedGuest, {
      participantId: HOST_ID,
      clock: CLOCK,
    });
    const ready = markParticipantReady(hostReady, {
      participantId: GUEST_ID,
      clock: CLOCK,
    });

    if (ready.status !== 'ready') throw new Error('ready が必要です。');
    const active = startLoungeFromRoom(ready);

    expect(active.status).toBe('active');
    expect(active.ownerPassport.clues[0]?.value).toBe('open-source');
    expect(active.encounteredPassport.clues[0]?.value).toBe('accessibility');
    expect(active.expiresAtWallClockMs).toBe(ready.expiresAtWallClockMs);
    expect(active.startedAtMonotonicMs).toBe(ready.startedAtMonotonicMs);
  });

  it('参加者数が不正な ready 状態からの開始を拒否する', () => {
    const invalidReady: ReadyLoungeRoom = {
      status: 'ready',
      loungeId: LOUNGE_ID,
      expiresAtWallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      startedAtMonotonicMs: CLOCK.monotonicMs,
      participants: [
        {
          participantId: HOST_ID,
          publicPassport: passport(),
          ready: true,
        },
      ],
    };

    expectRoomError(
      () => startLoungeFromRoom(invalidReady),
      'INVALID_PARTICIPANT_COUNT'
    );
  });

  it('expired 状態は participants フィールドを持たない', () => {
    const state: LoungeRoomState = { status: 'expired', loungeId: LOUNGE_ID };

    expect('participants' in state).toBe(false);
  });

  it('forming 状態はステータスと参加者一覧を保持する', () => {
    const state: FormingLoungeRoom = createLoungeRoom({
      loungeId: LOUNGE_ID,
      clock: CLOCK,
    });

    expect(state.status).toBe('forming');
    expect(state.participants).toEqual([]);
  });

  it('forming 状態の Room から同じ Lounge ID と期限を持つ Invite を導出する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });

    expect(inviteForRoom(room)).toEqual({
      schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
      loungeId: LOUNGE_ID,
      expiresAtEpochMs: room.expiresAtWallClockMs,
    });
  });

  it('ready 状態の Room からも同じ Lounge ID と期限を持つ Invite を導出する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joinedHost = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const joinedGuest = joinLoungeRoom(joinedHost, {
      participantId: GUEST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const hostReady = markParticipantReady(joinedGuest, {
      participantId: HOST_ID,
      clock: CLOCK,
    });
    const ready = markParticipantReady(hostReady, {
      participantId: GUEST_ID,
      clock: CLOCK,
    });
    if (ready.status !== 'ready') throw new Error('ready が必要です。');

    expect(inviteForRoom(ready)).toEqual({
      schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
      loungeId: LOUNGE_ID,
      expiresAtEpochMs: ready.expiresAtWallClockMs,
    });
  });

  it('作成直後（0 秒経過）の期限確認では forming 状態を変更しない', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const advanced = advanceLoungeRoom(room, CLOCK);

    expect(advanced).toBe(room);
  });
});

describe('Lounge Room の Terminal Event（個人退出・Host 終了）', () => {
  it('参加者を待っている forming の Room を個人退出で破棄する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joined = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });

    expect(destroyLoungeRoom(joined, 'owner-exit')).toEqual({
      status: 'destroyed',
      reason: 'owner-exit',
    });
  });

  it('双方 Ready で ready へ遷移した Room も Host 終了で破棄する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const joinedHost = joinLoungeRoom(room, {
      participantId: HOST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const joinedGuest = joinLoungeRoom(joinedHost, {
      participantId: GUEST_ID,
      publicPassport: passport(),
      clock: CLOCK,
    });
    const hostReady = markParticipantReady(joinedGuest, {
      participantId: HOST_ID,
      clock: CLOCK,
    });
    const ready = markParticipantReady(hostReady, {
      participantId: GUEST_ID,
      clock: CLOCK,
    });

    expect(destroyLoungeRoom(ready, 'host-ended')).toEqual({
      status: 'destroyed',
      reason: 'host-ended',
    });
  });

  it('20 分満了ですでに expired だった Room では、後から届く個人退出・Host 終了より満了を優先する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const expired = advanceLoungeRoom(room, {
      wallClockMs: CLOCK.wallClockMs + LOUNGE_TTL_MS,
      monotonicMs: CLOCK.monotonicMs,
    });

    expect(destroyLoungeRoom(expired, 'owner-exit')).toEqual({
      status: 'destroyed',
      reason: 'expired',
    });
    expect(destroyLoungeRoom(expired, 'host-ended')).toEqual({
      status: 'destroyed',
      reason: 'expired',
    });
  });

  it('連続する終了 Event（Room の破棄 → Lounge 側の終了処理の重ね掛け）でも最初の終了理由を維持する', () => {
    const room = createLoungeRoom({ loungeId: LOUNGE_ID, clock: CLOCK });
    const destroyed = destroyLoungeRoom(room, 'owner-exit');

    // Room の DestroyedLounge へ、Lounge 本体の終了処理（endHostedLounge）を
    // 重ねて呼んでも同じ終端状態が維持されることを確認する（二重退出・連続終了の回帰）。
    expect(endHostedLounge(destroyed)).toEqual(destroyed);
    expect(leaveLounge(destroyed)).toEqual(destroyed);
  });
});
