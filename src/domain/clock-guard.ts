/**
 * Lounge（`lounge.ts`）と Lounge Room（`lounge-room.ts`）はどちらも「壁時計と単調増加
 * 時計の両方で 20 分期限を判定し、壁時計が巻き戻っても単調増加時計の経過を優先する」
 * という同じ TTL 判定規則を持つ。判定ロジックだけをここへ集約し、各モジュールは
 * 自分の状態型と、自分の Error クラスによる型付き例外はそのまま保つ。
 */
export interface ClockSnapshot {
  readonly wallClockMs: number;
  readonly monotonicMs: number;
}

export function isValidClock(clock: ClockSnapshot): boolean {
  return (
    Number.isFinite(clock.wallClockMs) && Number.isFinite(clock.monotonicMs)
  );
}

export function hasElapsedTtl(
  startedAtMonotonicMs: number,
  expiresAtWallClockMs: number,
  clock: ClockSnapshot,
  ttlMs: number
): boolean {
  const monotonicElapsed = Math.max(
    0,
    clock.monotonicMs - startedAtMonotonicMs
  );
  return clock.wallClockMs >= expiresAtWallClockMs || monotonicElapsed >= ttlMs;
}
