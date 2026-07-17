/**
 * Issue 15: Reduce Motion（OS のアニメーション削減設定）を判定する Port。
 * `AccessibilityInfo`（React Native 同梱、新規依存なし）を直接 import せず、環境依存の
 * 取得手段を `ReduceMotionEnvironment` として注入する。これにより Native module を
 * import できないテスト環境でも、実際の別実装（解決する版・拒否する版）で挙動を検証できる
 * （No Mock、`docs/design/i18n-and-accessibility.md` の Reduce Motion 節）。
 */
export interface ReducedMotionPort {
  isReduceMotionEnabled(): Promise<boolean>;
}

export interface ReduceMotionEnvironment {
  isReduceMotionEnabled(): Promise<boolean>;
}

/**
 * 取得に失敗した場合は Motion を有効（`false`、既定のアニメーション動作）のまま返す
 * fail-safe。Reduce Motion の判定失敗が Pet Animation 自体を壊さないようにする。
 */
export function createReducedMotionPort(
  environment: ReduceMotionEnvironment
): ReducedMotionPort {
  return {
    async isReduceMotionEnabled() {
      try {
        return await environment.isReduceMotionEnabled();
      } catch {
        return false;
      }
    },
  };
}
