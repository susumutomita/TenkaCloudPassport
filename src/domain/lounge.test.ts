import { describe, expect, it } from 'bun:test';
import {
  advanceLounge,
  completeLounge,
  endHostedLounge,
  evaluateLounge,
  LOUNGE_TTL_MS,
  type LoungeState,
  LoungeTransitionError,
  leaveLounge,
  startLounge,
} from './lounge';
import {
  createLocalPrivateProfile,
  type PublicPassport,
  projectPublicPassport,
} from './passport';
import { RULES_PROVIDER } from './rules-provider';

function passport(clueIds: readonly string[]): PublicPassport {
  const profile = createLocalPrivateProfile({
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
  });
  return projectPublicPassport(profile, {
    clueIds,
    ownerConfirmed: true,
  });
}

function activeLounge(
  ownerClues: readonly string[] = ['regional-event-operations'],
  encounteredClues: readonly string[] = ['regional-event-operations']
): LoungeState {
  return startLounge({
    ownerPassport: passport(ownerClues),
    encounteredPassport: passport(encounteredClues),
    clock: { wallClockMs: 1_000_000, monotonicMs: 5_000 },
  });
}

function expectTransitionError(
  action: () => void,
  code: LoungeTransitionError['code']
): void {
  try {
    action();
    throw new Error('LoungeTransitionError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LoungeTransitionError);
    if (error instanceof LoungeTransitionError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('Lounge 状態機械', () => {
  it('開始時に壁時計と単調増加時計の 20 分期限を設定する', () => {
    const state = activeLounge();

    expect(state.status).toBe('active');
    if (state.status === 'active') {
      expect(state.expiresAtWallClockMs).toBe(1_000_000 + LOUNGE_TTL_MS);
      expect(state.startedAtMonotonicMs).toBe(5_000);
    }
  });

  it('無効な時計では Lounge を開始しない', () => {
    expectTransitionError(
      () =>
        startLounge({
          ownerPassport: passport(['regional-event-operations']),
          encounteredPassport: passport(['open-source']),
          clock: { wallClockMs: Number.NaN, monotonicMs: 0 },
        }),
      'INVALID_CLOCK'
    );
  });

  it('Rules 判定後は Bridge だけを保持して Pet を retired にする', () => {
    const state = evaluateLounge(activeLounge(), RULES_PROVIDER, {
      wallClockMs: 1_000_100,
      monotonicMs: 5_100,
    });

    expect(state.status).toBe('retired');
    expect('ownerPassport' in state).toBe(false);
    expect('encounteredPassport' in state).toBe(false);
    if (state.status === 'retired') {
      expect(state.outcome.kind).toBe('bridge');
    }
  });

  it('根拠がない場合も no-signal で retired にする', () => {
    const state = evaluateLounge(
      activeLounge(['regional-event-operations'], ['accessibility']),
      RULES_PROVIDER,
      { wallClockMs: 1_000_100, monotonicMs: 5_100 }
    );

    expect(state.status).toBe('retired');
    if (state.status === 'retired') {
      expect(state.outcome).toEqual({ kind: 'no-signal' });
    }
  });

  it('retired 後の再判定を拒否する', () => {
    const retired = evaluateLounge(activeLounge(), RULES_PROVIDER, {
      wallClockMs: 1_000_100,
      monotonicMs: 5_100,
    });

    expectTransitionError(
      () =>
        evaluateLounge(retired, RULES_PROVIDER, {
          wallClockMs: 1_000_200,
          monotonicMs: 5_200,
        }),
      'PET_RETIRED'
    );
  });

  it('満了前の期限確認では状態を維持する', () => {
    const active = activeLounge();
    const advanced = advanceLounge(active, {
      wallClockMs: 1_000_100,
      monotonicMs: 5_100,
    });

    expect(advanced).toBe(active);
  });

  it('壁時計が 20 分期限へ達した時点で完全破棄する', () => {
    const state = advanceLounge(activeLounge(), {
      wallClockMs: 1_000_000 + LOUNGE_TTL_MS,
      monotonicMs: 5_100,
    });

    expect(state).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('壁時計が戻っても単調増加時計の 20 分経過で完全破棄する', () => {
    const state = advanceLounge(activeLounge(), {
      wallClockMs: 900_000,
      monotonicMs: 5_000 + LOUNGE_TTL_MS,
    });

    expect(state).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('単調増加時計が開始値より小さい場合は期限を延長せず現在状態を維持する', () => {
    const active = activeLounge();
    const state = advanceLounge(active, {
      wallClockMs: 1_000_100,
      monotonicMs: 4_000,
    });

    expect(state).toBe(active);
  });

  it('判定操作が期限と同時なら結果を作らず完全破棄する', () => {
    const state = evaluateLounge(activeLounge(), RULES_PROVIDER, {
      wallClockMs: 1_000_000 + LOUNGE_TTL_MS,
      monotonicMs: 5_100,
    });

    expect(state).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('Owner の退出で active データを完全破棄する', () => {
    const state = leaveLounge(activeLounge());

    expect(state).toEqual({ status: 'destroyed', reason: 'owner-exit' });
  });

  it('Host 終了で retired の結果も完全破棄する', () => {
    const retired = evaluateLounge(activeLounge(), RULES_PROVIDER, {
      wallClockMs: 1_000_100,
      monotonicMs: 5_100,
    });
    const state = endHostedLounge(retired);

    expect(state).toEqual({ status: 'destroyed', reason: 'host-ended' });
  });

  it('結果画面の終了で Lounge を完全破棄する', () => {
    const retired = evaluateLounge(activeLounge(), RULES_PROVIDER, {
      wallClockMs: 1_000_100,
      monotonicMs: 5_100,
    });
    const state = completeLounge(retired);

    expect(state).toEqual({ status: 'destroyed', reason: 'completed' });
  });

  it('結果画面の終了を繰り返しても同じ破棄済み状態を維持する', () => {
    const retired = evaluateLounge(activeLounge(), RULES_PROVIDER, {
      wallClockMs: 1_000_100,
      monotonicMs: 5_100,
    });
    const completed = completeLounge(retired);

    expect(completeLounge(completed)).toBe(completed);
    expect(endHostedLounge(completed)).toBe(completed);
  });

  it('破棄処理を繰り返しても最初の終端状態を維持する', () => {
    const destroyed = leaveLounge(activeLounge());
    const repeated = endHostedLounge(destroyed);

    expect(repeated).toBe(destroyed);
  });

  it('破棄後の判定を拒否する', () => {
    const destroyed = leaveLounge(activeLounge());

    expectTransitionError(
      () =>
        evaluateLounge(destroyed, RULES_PROVIDER, {
          wallClockMs: 1_000_100,
          monotonicMs: 5_100,
        }),
      'LOUNGE_DESTROYED'
    );
  });

  it('破棄後の期限確認は同じ終端状態を返す', () => {
    const destroyed = leaveLounge(activeLounge());
    const advanced = advanceLounge(destroyed, {
      wallClockMs: 1_000_000 + LOUNGE_TTL_MS,
      monotonicMs: 5_000 + LOUNGE_TTL_MS,
    });

    expect(advanced).toBe(destroyed);
  });

  it('active のまま結果完了しようとすると拒否する', () => {
    expectTransitionError(
      () => completeLounge(activeLounge()),
      'OUTCOME_NOT_AVAILABLE'
    );
  });
});
