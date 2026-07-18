import { describe, expect, it } from 'bun:test';
import type { ClockSnapshot } from './clock-guard';
import { publicPassportWithClues as passport } from './domain-test-kit';
import {
  advanceGroupLoungeSession,
  beginNextGroupRound,
  createGroupLoungeSession,
  destroyGroupLoungeSession,
  disconnectGroupParticipant,
  type FormingGroupLounge,
  GROUP_DISCONNECT_GRACE_MS,
  GROUP_MAX_DEPARTED_PARTICIPANTS,
  GROUP_MAX_MEMBERSHIP_REVISION,
  GROUP_MAX_ROUNDS,
  GROUP_MODEL_DEADLINE_MS,
  type GroupLoungeSession,
  GroupLoungeSessionError,
  groupMembershipSnapshot,
  joinGroupParticipant,
  leaveGroupParticipant,
  markGroupParticipantReady,
  reconnectGroupParticipant,
  settleGroupRound,
} from './group-lounge-session';
import type { PublicPassport } from './passport';
import type { LoungeId, ParticipantId, RoundId } from './session-identifiers';

const LOUNGE_ID: LoungeId = `lng_${'11'.repeat(16)}`;
const ROUND_1: RoundId = `rnd_${'21'.repeat(16)}`;
const ROUND_2: RoundId = `rnd_${'22'.repeat(16)}`;
const HOST_ID: ParticipantId = `ptc_${'01'.repeat(16)}`;

function participant(
  index: number,
  ownerAlias = `Owner ${index}`
): {
  readonly participantId: ParticipantId;
  readonly publicPassport: PublicPassport;
} {
  const hexadecimal = index.toString(16).padStart(2, '0');
  return {
    participantId: `ptc_${hexadecimal.repeat(16)}`,
    publicPassport: passport(['open-source'], ['ja'], ownerAlias),
  };
}

function clock(wallClockMs: number, monotonicMs = wallClockMs): ClockSnapshot {
  return { wallClockMs, monotonicMs };
}

function createSession(at = 0): FormingGroupLounge {
  return createGroupLoungeSession({
    loungeId: LOUNGE_ID,
    host: {
      participantId: HOST_ID,
      publicPassport: passport(['open-source'], ['ja'], 'Host'),
    },
    roundId: ROUND_1,
    clock: clock(at),
  });
}

function joinParticipants(
  state: GroupLoungeSession,
  participantIndexes: readonly number[],
  at = 0
): GroupLoungeSession {
  return participantIndexes.reduce(
    (current, index) =>
      joinGroupParticipant(current, {
        participant: participant(index),
        clock: clock(at),
      }),
    state
  );
}

function readyParticipants(
  state: GroupLoungeSession,
  participantIds: readonly ParticipantId[],
  roundId = ROUND_1,
  at = 0
): GroupLoungeSession {
  return participantIds.reduce(
    (current, participantId) =>
      markGroupParticipantReady(current, {
        participantId,
        roundId,
        clock: clock(at),
      }),
    state
  );
}

function expectSessionError(
  action: () => void,
  code: GroupLoungeSessionError['code']
): void {
  try {
    action();
    throw new Error('GroupLoungeSessionError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(GroupLoungeSessionError);
    if (error instanceof GroupLoungeSessionError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('Group Lounge の Membership', () => {
  it('Host だけの revision 0 から始まり、Participant ID の辞書順で Snapshot を返す', () => {
    const state = joinParticipants(createSession(), [3, 2]);

    expect(groupMembershipSnapshot(state)).toEqual({
      revision: 2,
      participantIds: [
        HOST_ID,
        participant(2).participantId,
        participant(3).participantId,
      ],
    });
  });

  it('同じ Participant と Passport の Duplicate Join は revision を増やさない', () => {
    const joined = joinParticipants(createSession(), [2]);
    const duplicate = joinGroupParticipant(joined, {
      participant: participant(2),
      clock: clock(0),
    });

    expect(duplicate).toBe(joined);
    expect(groupMembershipSnapshot(duplicate)?.revision).toBe(1);
  });

  it('同じ Participant ID を異なる Passport へ使い回せない', () => {
    const joined = joinParticipants(createSession(), [2]);

    expectSessionError(
      () =>
        joinGroupParticipant(joined, {
          participant: {
            participantId: participant(2).participantId,
            publicPassport: passport(['accessibility'], ['en'], '侵入者'),
          },
          clock: clock(0),
        }),
      'PARTICIPANT_CONFLICT'
    );
  });

  it('同じ Owner Alias でも Participant ID が異なれば別 Member として扱う', () => {
    let state: GroupLoungeSession = createSession();
    state = joinGroupParticipant(state, {
      participant: participant(2, '同じ名前'),
      clock: clock(0),
    });
    state = joinGroupParticipant(state, {
      participant: participant(3, '同じ名前'),
      clock: clock(0),
    });

    expect(groupMembershipSnapshot(state)?.participantIds).toHaveLength(3);
  });

  it('6 名を超える Join を拒否する', () => {
    const full = joinParticipants(createSession(), [2, 3, 4, 5, 6]);

    expectSessionError(
      () =>
        joinGroupParticipant(full, {
          participant: participant(7),
          clock: clock(0),
        }),
      'LOUNGE_FULL'
    );
  });

  it('Join、Leave、遅延 Join の順でも退出した Identity を復活させない', () => {
    const joined = joinParticipants(createSession(), [2]);
    const left = leaveGroupParticipant(joined, {
      participantId: participant(2).participantId,
      clock: clock(1),
    });
    const delayedJoin = joinGroupParticipant(left, {
      participant: participant(2),
      clock: clock(2),
    });

    expect(delayedJoin).toBe(left);
    expect(groupMembershipSnapshot(delayedJoin)).toEqual({
      revision: 2,
      participantIds: [HOST_ID],
    });
  });

  it('Round 確定後に退出した Participant の Passport と個別 Outcome を保持しない', () => {
    const forming = joinParticipants(createSession(), [2, 3]);
    const settled = settleGroupRound(
      readyParticipants(
        forming,
        groupMembershipSnapshot(forming)?.participantIds ?? []
      ),
      { roundId: ROUND_1, clock: clock(1) }
    );
    const left = leaveGroupParticipant(settled, {
      participantId: participant(3).participantId,
      clock: clock(2),
    });

    expect(left.status).toBe('settled');
    if (left.status !== 'settled') throw new Error('settled が必要です。');
    expect(left.participants).toHaveLength(2);
    expect(left.outcomes.map((outcome) => outcome.participantId)).not.toContain(
      participant(3).participantId
    );
    expect(JSON.stringify(left.outcomes)).not.toContain(
      participant(3).participantId
    );
  });

  it('退出 Tombstone を bounded にし、Identity churn の上限超過を拒否する', () => {
    let state: GroupLoungeSession = createSession();
    for (
      let index = 2;
      index < GROUP_MAX_DEPARTED_PARTICIPANTS + 2;
      index += 1
    ) {
      state = joinGroupParticipant(state, {
        participant: participant(index),
        clock: clock(index),
      });
      state = leaveGroupParticipant(state, {
        participantId: participant(index).participantId,
        clock: clock(index),
      });
    }

    expectSessionError(
      () =>
        joinGroupParticipant(state, {
          participant: participant(250),
          clock: clock(250),
        }),
      'IDENTITY_CHURN_LIMIT'
    );
  });

  it('退出待ち Participant が複数いても Tombstone 上限を超えず Lounge を終了する', () => {
    let state: GroupLoungeSession = createSession();
    for (
      let index = 2;
      index < GROUP_MAX_DEPARTED_PARTICIPANTS + 1;
      index += 1
    ) {
      state = joinGroupParticipant(state, {
        participant: participant(index),
        clock: clock(index),
      });
      state = leaveGroupParticipant(state, {
        participantId: participant(index).participantId,
        clock: clock(index),
      });
    }
    state = joinParticipants(state, [80, 81, 82, 83, 84]);
    state = leaveGroupParticipant(state, {
      participantId: participant(80).participantId,
      clock: clock(100),
    });
    const destroyed = leaveGroupParticipant(state, {
      participantId: participant(81).participantId,
      clock: clock(101),
    });

    expect(destroyed).toEqual({
      status: 'destroyed',
      reason: 'identity-churn-limit',
    });
  });
});

describe('全員 Ready、Late Join、Fair Bridge', () => {
  it('2〜6 名の全員が Ready になるまで Round を開始せず、全員へ最大 1 件を返す', () => {
    for (let size = 2; size <= 6; size += 1) {
      const guestIndexes = Array.from(
        { length: size - 1 },
        (_, index) => index + 2
      );
      const forming = joinParticipants(createSession(), guestIndexes);
      const participantIds =
        groupMembershipSnapshot(forming)?.participantIds ?? [];
      const almostReady = readyParticipants(
        forming,
        participantIds.slice(0, -1)
      );
      expect(almostReady.status).toBe('forming');

      const evaluating = readyParticipants(
        almostReady,
        participantIds.slice(-1)
      );
      expect(evaluating.status).toBe('evaluating');
      if (evaluating.status !== 'evaluating')
        throw new Error('evaluating が必要です。');
      expect(evaluating.activeParticipantIds).toEqual(participantIds);

      const settled = settleGroupRound(evaluating, {
        roundId: ROUND_1,
        clock: clock(1),
      });
      expect(settled.status).toBe('settled');
      if (settled.status !== 'settled') throw new Error('settled が必要です。');
      expect(settled.outcomes).toHaveLength(size);
      expect(
        new Set(settled.outcomes.map((outcome) => outcome.participantId)).size
      ).toBe(size);
    }
  });

  it('Join と Ready の到着順を変えても同じ Fair Bridge へ収束する', () => {
    const forward = joinParticipants(createSession(), [2, 3, 4, 5]);
    const reverse = joinParticipants(createSession(), [5, 4, 3, 2]);
    const forwardIds = groupMembershipSnapshot(forward)?.participantIds ?? [];
    const reverseIds = [...forwardIds].reverse();

    const forwardSettled = settleGroupRound(
      readyParticipants(forward, forwardIds),
      { roundId: ROUND_1, clock: clock(1) }
    );
    const reverseSettled = settleGroupRound(
      readyParticipants(reverse, reverseIds),
      { roundId: ROUND_1, clock: clock(1) }
    );

    expect(forwardSettled).toEqual(reverseSettled);
  });

  it('進行中 Round の Late Join は Outcome に含めず、次 Round から参加させる', () => {
    const forming = joinParticipants(createSession(), [2]);
    const evaluating = readyParticipants(
      forming,
      groupMembershipSnapshot(forming)?.participantIds ?? []
    );
    const withLateJoin = joinGroupParticipant(evaluating, {
      participant: participant(3),
      clock: clock(1),
    });
    const firstSettled = settleGroupRound(withLateJoin, {
      roundId: ROUND_1,
      clock: clock(2),
    });
    if (firstSettled.status !== 'settled')
      throw new Error('settled が必要です。');
    expect(
      firstSettled.outcomes.map((outcome) => outcome.participantId)
    ).not.toContain(participant(3).participantId);

    const nextForming = beginNextGroupRound(firstSettled, {
      roundId: ROUND_2,
      clock: clock(3),
    });
    const nextEvaluating = readyParticipants(
      nextForming,
      groupMembershipSnapshot(nextForming)?.participantIds ?? [],
      ROUND_2,
      3
    );
    if (nextEvaluating.status !== 'evaluating')
      throw new Error('evaluating が必要です。');
    expect(nextEvaluating.activeParticipantIds).toContain(
      participant(3).participantId
    );
  });

  it('同じ完了、古い Round の完了、Duplicate Ready は同じ State を返して二重表示しない', () => {
    const forming = joinParticipants(createSession(), [2]);
    const [hostId, guestId] =
      groupMembershipSnapshot(forming)?.participantIds ?? [];
    if (!hostId || !guestId) throw new Error('2 名が必要です。');
    const hostReady = readyParticipants(forming, [hostId]);
    expect(readyParticipants(hostReady, [hostId])).toBe(hostReady);
    const evaluating = readyParticipants(hostReady, [guestId]);
    const settled = settleGroupRound(evaluating, {
      roundId: ROUND_1,
      clock: clock(1),
    });

    expect(
      settleGroupRound(settled, { roundId: ROUND_1, clock: clock(2) })
    ).toBe(settled);
    const next = beginNextGroupRound(settled, {
      roundId: ROUND_2,
      clock: clock(2),
    });
    expect(settleGroupRound(next, { roundId: ROUND_1, clock: clock(3) })).toBe(
      next
    );
  });

  it('Round 1 → 2 の後に Round 1 を再利用しない', () => {
    const firstForming = joinParticipants(createSession(), [2]);
    const firstSettled = settleGroupRound(
      readyParticipants(
        firstForming,
        groupMembershipSnapshot(firstForming)?.participantIds ?? []
      ),
      { roundId: ROUND_1, clock: clock(1) }
    );
    const secondForming = beginNextGroupRound(firstSettled, {
      roundId: ROUND_2,
      clock: clock(2),
    });
    const secondSettled = settleGroupRound(
      readyParticipants(
        secondForming,
        groupMembershipSnapshot(secondForming)?.participantIds ?? [],
        ROUND_2,
        2
      ),
      { roundId: ROUND_2, clock: clock(3) }
    );

    expectSessionError(
      () =>
        beginNextGroupRound(secondSettled, {
          roundId: ROUND_1,
          clock: clock(4),
        }),
      'ROUND_ID_REUSED'
    );
  });

  it('Round 上限の次は使用済み ID を捨てず Lounge を終了する', () => {
    const forming = joinParticipants(createSession(), [2]);
    const settled = settleGroupRound(
      readyParticipants(
        forming,
        groupMembershipSnapshot(forming)?.participantIds ?? []
      ),
      { roundId: ROUND_1, clock: clock(1) }
    );
    if (settled.status !== 'settled') throw new Error('settled が必要です。');
    const atLimit: GroupLoungeSession = {
      ...settled,
      usedRoundIds: Array.from(
        { length: GROUP_MAX_ROUNDS },
        (_, index): RoundId =>
          `rnd_${(index + 1).toString(16).padStart(32, '0')}`
      ),
    };

    expect(
      beginNextGroupRound(atLimit, {
        roundId: `rnd_${'ff'.repeat(16)}`,
        clock: clock(2),
      })
    ).toEqual({ status: 'destroyed', reason: 'round-limit' });
  });
});

describe('切断 Grace、Deadline、終了', () => {
  it('Grace 内の Reconnect は Membership と Ready を維持する', () => {
    const forming = joinParticipants(createSession(), [2]);
    const guestId = participant(2).participantId;
    const guestReady = readyParticipants(forming, [guestId]);
    const disconnected = disconnectGroupParticipant(guestReady, {
      participantId: guestId,
      connectionGeneration: 0,
      clock: clock(10),
    });
    const waiting = advanceGroupLoungeSession(
      disconnected,
      clock(10 + GROUP_DISCONNECT_GRACE_MS - 1)
    );
    const reconnected = reconnectGroupParticipant(waiting, {
      participantId: guestId,
      connectionGeneration: 1,
      clock: clock(10 + GROUP_DISCONNECT_GRACE_MS - 1),
    });
    const evaluating = readyParticipants(reconnected, [HOST_ID], ROUND_1, 20);

    expect(evaluating.status).toBe('evaluating');
    expect(groupMembershipSnapshot(evaluating)?.revision).toBe(1);
  });

  it('Guest の Grace 期限後は除外し、残った全員が Ready なら Round を開始する', () => {
    const forming = joinParticipants(createSession(), [2, 3]);
    const readyTwo = readyParticipants(forming, [
      HOST_ID,
      participant(2).participantId,
    ]);
    const disconnected = disconnectGroupParticipant(readyTwo, {
      participantId: participant(3).participantId,
      connectionGeneration: 0,
      clock: clock(10),
    });
    const advanced = advanceGroupLoungeSession(
      disconnected,
      clock(10 + GROUP_DISCONNECT_GRACE_MS)
    );

    expect(advanced.status).toBe('evaluating');
    expect(groupMembershipSnapshot(advanced)).toEqual({
      revision: 3,
      participantIds: [HOST_ID, participant(2).participantId],
    });
  });

  it('Grace 期限後に届いた Duplicate Disconnect は退出済み Identity を復活させない', () => {
    const joined = joinParticipants(createSession(), [2]);
    const disconnected = disconnectGroupParticipant(joined, {
      participantId: participant(2).participantId,
      connectionGeneration: 0,
      clock: clock(10),
    });
    const afterGrace = advanceGroupLoungeSession(
      disconnected,
      clock(10 + GROUP_DISCONNECT_GRACE_MS)
    );

    expect(
      disconnectGroupParticipant(afterGrace, {
        participantId: participant(2).participantId,
        connectionGeneration: 0,
        clock: clock(10 + GROUP_DISCONNECT_GRACE_MS + 1),
      })
    ).toBe(afterGrace);
  });

  it('Reconnect 後に遅延した旧世代 Disconnect を適用しない', () => {
    const joined = joinParticipants(createSession(), [2]);
    const guestId = participant(2).participantId;
    const disconnected = disconnectGroupParticipant(joined, {
      participantId: guestId,
      connectionGeneration: 0,
      clock: clock(10),
    });
    const reconnected = reconnectGroupParticipant(disconnected, {
      participantId: guestId,
      connectionGeneration: 1,
      clock: clock(11),
    });
    const delayedDisconnect = disconnectGroupParticipant(reconnected, {
      participantId: guestId,
      connectionGeneration: 0,
      clock: clock(12),
    });

    expect(delayedDisconnect).toBe(reconnected);
    const afterOldGrace = advanceGroupLoungeSession(
      delayedDisconnect,
      clock(10 + GROUP_DISCONNECT_GRACE_MS)
    );
    expect(groupMembershipSnapshot(afterOldGrace)?.participantIds).toContain(
      guestId
    );
  });

  it('Round 中に Guest が失われて 1 名だけ残っても Deadline 内に no-signal へ収束する', () => {
    const forming = joinParticipants(createSession(), [2]);
    const evaluating = readyParticipants(
      forming,
      groupMembershipSnapshot(forming)?.participantIds ?? []
    );
    const disconnected = disconnectGroupParticipant(evaluating, {
      participantId: participant(2).participantId,
      connectionGeneration: 0,
      clock: clock(10),
    });
    const afterGrace = advanceGroupLoungeSession(
      disconnected,
      clock(10 + GROUP_DISCONNECT_GRACE_MS)
    );
    const settled = advanceGroupLoungeSession(
      afterGrace,
      clock(GROUP_MODEL_DEADLINE_MS)
    );

    expect(settled.status).toBe('settled');
    if (settled.status !== 'settled') throw new Error('settled が必要です。');
    expect(settled.outcomes).toEqual([
      { participantId: HOST_ID, result: { kind: 'no-signal' } },
    ]);
  });

  it('Host の Grace 期限後は全 Data を捨てて Lounge を終了する', () => {
    const state = joinParticipants(createSession(), [2, 3]);
    const disconnected = disconnectGroupParticipant(state, {
      participantId: HOST_ID,
      connectionGeneration: 0,
      clock: clock(10),
    });
    const destroyed = advanceGroupLoungeSession(
      disconnected,
      clock(10 + GROUP_DISCONNECT_GRACE_MS)
    );

    expect(destroyed).toEqual({ status: 'destroyed', reason: 'host-lost' });
    expect(JSON.stringify(destroyed)).not.toContain('participant');
    expect(groupMembershipSnapshot(destroyed)).toBeNull();
  });

  it('1 Peer の Local Agent が応答しなくても 45 秒の境界で Rules fallback する', () => {
    const forming = joinParticipants(createSession(), [2, 3]);
    const evaluating = readyParticipants(
      forming,
      groupMembershipSnapshot(forming)?.participantIds ?? []
    );
    const beforeDeadline = advanceGroupLoungeSession(
      evaluating,
      clock(GROUP_MODEL_DEADLINE_MS - 1)
    );
    const atDeadline = advanceGroupLoungeSession(
      beforeDeadline,
      clock(GROUP_MODEL_DEADLINE_MS)
    );

    expect(beforeDeadline).toBe(evaluating);
    expect(atDeadline.status).toBe('settled');
    if (atDeadline.status !== 'settled')
      throw new Error('settled が必要です。');
    expect(atDeadline.settledBy).toBe('deadline-fallback');
  });

  it('壁時計を巻き戻しても単調増加時計で Model Deadline を延長しない', () => {
    const forming = joinParticipants(createSession(1_000), [2], 1_000);
    const evaluating = readyParticipants(
      forming,
      groupMembershipSnapshot(forming)?.participantIds ?? [],
      ROUND_1,
      1_000
    );
    const settled = advanceGroupLoungeSession(
      evaluating,
      clock(0, 1_000 + GROUP_MODEL_DEADLINE_MS)
    );

    expect(settled.status).toBe('settled');
  });

  it('Lounge 期限と明示 Background 終了は終了理由だけを残す', () => {
    const expired = advanceGroupLoungeSession(
      createSession(),
      clock(20 * 60 * 1_000)
    );
    const backgrounded = destroyGroupLoungeSession(
      createSession(),
      'app-backgrounded'
    );

    expect(expired).toEqual({ status: 'destroyed', reason: 'expired' });
    expect(backgrounded).toEqual({
      status: 'destroyed',
      reason: 'app-backgrounded',
    });
    expect(advanceGroupLoungeSession(backgrounded, clock(Number.NaN))).toBe(
      backgrounded
    );
  });
});

describe('Chaos と仮想 Soak', () => {
  it('Duplicate、Delay、Out-of-order、Drop、Reconnect を混ぜても canonical 結果へ収束する', () => {
    const canonicalForming = joinParticipants(createSession(), [2, 3]);
    const canonical = settleGroupRound(
      readyParticipants(
        canonicalForming,
        groupMembershipSnapshot(canonicalForming)?.participantIds ?? []
      ),
      { roundId: ROUND_1, clock: clock(100) }
    );

    let chaotic = joinParticipants(createSession(), [3, 2]);
    chaotic = joinGroupParticipant(chaotic, {
      participant: participant(2),
      clock: clock(1),
    });
    chaotic = markGroupParticipantReady(chaotic, {
      participantId: participant(3).participantId,
      roundId: ROUND_2,
      clock: clock(2),
    });
    chaotic = disconnectGroupParticipant(chaotic, {
      participantId: participant(2).participantId,
      connectionGeneration: 0,
      clock: clock(3),
    });
    chaotic = reconnectGroupParticipant(chaotic, {
      participantId: participant(2).participantId,
      connectionGeneration: 1,
      clock: clock(4),
    });
    chaotic = readyParticipants(
      chaotic,
      [participant(2).participantId, HOST_ID, participant(3).participantId],
      ROUND_1,
      5
    );
    chaotic = settleGroupRound(chaotic, {
      roundId: ROUND_2,
      clock: clock(6),
    });
    chaotic = settleGroupRound(chaotic, {
      roundId: ROUND_1,
      clock: clock(100),
    });

    expect(chaotic.status).toBe('settled');
    expect(canonical.status).toBe('settled');
    if (chaotic.status !== 'settled' || canonical.status !== 'settled') {
      throw new Error('settled が必要です。');
    }
    expect(chaotic.outcomes).toEqual(canonical.outcomes);
    expect(groupMembershipSnapshot(chaotic)).toEqual(
      groupMembershipSnapshot(canonical)
    );
  });

  it('30 分相当の仮想時間で 20 分 Lounge 期限と新規 Lounge Recovery を bounded に保つ', () => {
    let first = joinParticipants(createSession(), [2, 3, 4, 5, 6]);
    for (let elapsed = 0; elapsed < 20 * 60 * 1_000; elapsed += 15_000) {
      first = advanceGroupLoungeSession(first, clock(elapsed));
    }
    first = advanceGroupLoungeSession(first, clock(20 * 60 * 1_000));
    expect(first).toEqual({ status: 'destroyed', reason: 'expired' });

    let second: GroupLoungeSession = createSession(20 * 60 * 1_000);
    for (
      let elapsed = 20 * 60 * 1_000;
      elapsed <= 30 * 60 * 1_000;
      elapsed += 15_000
    ) {
      second = advanceGroupLoungeSession(second, clock(elapsed));
    }
    expect(second.status).toBe('forming');
    expect(groupMembershipSnapshot(second)?.participantIds).toEqual([HOST_ID]);
  });
});

describe('型付き失敗', () => {
  it('非 finite Clock、存在しない Participant、同じ Round ID の再利用を拒否する', () => {
    expectSessionError(
      () =>
        createGroupLoungeSession({
          loungeId: LOUNGE_ID,
          host: participant(1),
          roundId: ROUND_1,
          clock: clock(Number.NaN),
        }),
      'INVALID_CLOCK'
    );
    expectSessionError(
      () =>
        markGroupParticipantReady(createSession(), {
          participantId: participant(9).participantId,
          roundId: ROUND_1,
          clock: clock(0),
        }),
      'PARTICIPANT_NOT_FOUND'
    );

    const forming = joinParticipants(createSession(), [2]);
    const settled = settleGroupRound(
      readyParticipants(
        forming,
        groupMembershipSnapshot(forming)?.participantIds ?? []
      ),
      { roundId: ROUND_1, clock: clock(1) }
    );
    expectSessionError(
      () => beginNextGroupRound(settled, { roundId: ROUND_1, clock: clock(2) }),
      'ROUND_ID_REUSED'
    );
  });

  it('無効な Session ID、切断中 Ready、未確定 Round、revision 枯渇を区別する', () => {
    const invalidRoundId: RoundId = 'rnd_';
    expectSessionError(
      () =>
        createGroupLoungeSession({
          loungeId: LOUNGE_ID,
          host: participant(1),
          roundId: invalidRoundId,
          clock: clock(0),
        }),
      'INVALID_CONFIGURATION'
    );

    const joined = joinParticipants(createSession(), [2]);
    const disconnected = disconnectGroupParticipant(joined, {
      participantId: participant(2).participantId,
      connectionGeneration: 0,
      clock: clock(1),
    });
    expectSessionError(
      () =>
        markGroupParticipantReady(disconnected, {
          participantId: participant(2).participantId,
          roundId: ROUND_1,
          clock: clock(2),
        }),
      'PARTICIPANT_DISCONNECTED'
    );
    expectSessionError(
      () =>
        beginNextGroupRound(createSession(), {
          roundId: ROUND_2,
          clock: clock(0),
        }),
      'ROUND_NOT_SETTLED'
    );

    const exhausted: GroupLoungeSession = {
      ...createSession(),
      membershipRevision: GROUP_MAX_MEMBERSHIP_REVISION,
    };
    expectSessionError(
      () =>
        joinGroupParticipant(exhausted, {
          participant: participant(2),
          clock: clock(0),
        }),
      'MEMBERSHIP_REVISION_EXHAUSTED'
    );
  });

  it('未知 Participant の Disconnect / Reconnect と Host の明示退出を処理する', () => {
    expectSessionError(
      () =>
        disconnectGroupParticipant(createSession(), {
          participantId: participant(9).participantId,
          connectionGeneration: 0,
          clock: clock(0),
        }),
      'PARTICIPANT_NOT_FOUND'
    );
    expectSessionError(
      () =>
        reconnectGroupParticipant(createSession(), {
          participantId: participant(9).participantId,
          connectionGeneration: 1,
          clock: clock(0),
        }),
      'PARTICIPANT_NOT_FOUND'
    );
    expect(
      leaveGroupParticipant(createSession(), {
        participantId: HOST_ID,
        clock: clock(0),
      })
    ).toEqual({ status: 'destroyed', reason: 'host-ended' });
  });

  it('Connection generation は範囲内の非負整数だけを受理する', () => {
    expectSessionError(
      () =>
        disconnectGroupParticipant(createSession(), {
          participantId: HOST_ID,
          connectionGeneration: Number.NaN,
          clock: clock(0),
        }),
      'INVALID_CONNECTION_GENERATION'
    );
    expectSessionError(
      () =>
        reconnectGroupParticipant(createSession(), {
          participantId: HOST_ID,
          connectionGeneration: -1,
          clock: clock(0),
        }),
      'INVALID_CONNECTION_GENERATION'
    );
  });
});
