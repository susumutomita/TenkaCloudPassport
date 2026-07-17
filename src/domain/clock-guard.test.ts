import { describe, expect, it } from 'bun:test';
import { hasElapsedTtl, isValidClock } from './clock-guard';

describe('Clock Guard の共通 TTL 判定', () => {
  it('有限な壁時計と単調増加時計を有効とする', () => {
    expect(isValidClock({ wallClockMs: 1_000, monotonicMs: 2_000 })).toBe(true);
  });

  it('壁時計が非有限なら無効とする', () => {
    expect(isValidClock({ wallClockMs: Number.NaN, monotonicMs: 2_000 })).toBe(
      false
    );
  });

  it('単調増加時計が非有限なら無効とする', () => {
    expect(
      isValidClock({
        wallClockMs: 1_000,
        monotonicMs: Number.POSITIVE_INFINITY,
      })
    ).toBe(false);
  });

  it('壁時計が期限へ達すると経過済みとする', () => {
    expect(
      hasElapsedTtl(0, 1_000, { wallClockMs: 1_000, monotonicMs: 500 }, 1_000)
    ).toBe(true);
  });

  it('壁時計が戻っても単調増加時計の経過で期限切れとする', () => {
    expect(
      hasElapsedTtl(0, 10_000, { wallClockMs: 0, monotonicMs: 1_000 }, 1_000)
    ).toBe(true);
  });

  it('単調増加時計が開始値より小さい場合は経過を 0 として扱う', () => {
    expect(
      hasElapsedTtl(5_000, 10_000, { wallClockMs: 100, monotonicMs: 0 }, 1_000)
    ).toBe(false);
  });

  it('どちらの時計も期限未満なら経過済みとしない', () => {
    expect(
      hasElapsedTtl(0, 10_000, { wallClockMs: 100, monotonicMs: 100 }, 1_000)
    ).toBe(false);
  });
});
