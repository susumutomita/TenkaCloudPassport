import { describe, expect, it } from 'bun:test';
import { LOUNGE_TTL_MS, startLounge } from '../domain/lounge';
import {
  createLocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import { reduceLounge } from './lounge-reducer';

function activeLounge() {
  const profile = createLocalPrivateProfile({
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
  });
  const passport = projectPublicPassport(profile, {
    clueIds: ['open-source'],
    ownerConfirmed: true,
  });
  return startLounge({
    ownerPassport: passport,
    encounteredPassport: passport,
    clock: { wallClockMs: 1_000, monotonicMs: 2_000 },
  });
}

const EXPIRY_CLOCK = {
  wallClockMs: 1_000 + LOUNGE_TTL_MS,
  monotonicMs: 2_100,
};

describe('Lounge reducer の競合処理', () => {
  it('期限切れの後に判定操作が並んでも Bridge を復元しない', () => {
    const expired = reduceLounge(activeLounge(), {
      type: 'clock-tick',
      clock: EXPIRY_CLOCK,
    });
    const evaluated = reduceLounge(expired, {
      type: 'evaluate',
      clock: EXPIRY_CLOCK,
    });

    expect(evaluated).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('判定操作の後に期限切れが並んでも結果を完全破棄する', () => {
    const retired = reduceLounge(activeLounge(), {
      type: 'evaluate',
      clock: { wallClockMs: 1_100, monotonicMs: 2_100 },
    });
    const expired = reduceLounge(retired, {
      type: 'clock-tick',
      clock: EXPIRY_CLOCK,
    });

    expect(expired).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('破棄後に終了操作が重なっても最初の破棄理由を維持する', () => {
    const exited = reduceLounge(activeLounge(), { type: 'owner-exit' });
    const hostedEnd = reduceLounge(exited, { type: 'host-ended' });
    const completed = reduceLounge(hostedEnd, { type: 'complete' });

    expect(completed).toEqual({ status: 'destroyed', reason: 'owner-exit' });
  });

  it('判定済み Lounge を完了すると Bridge と Passport を完全破棄する', () => {
    const retired = reduceLounge(activeLounge(), {
      type: 'evaluate',
      clock: { wallClockMs: 1_100, monotonicMs: 2_100 },
    });
    const completed = reduceLounge(retired, { type: 'complete' });

    expect(completed).toEqual({ status: 'destroyed', reason: 'completed' });
  });
});
