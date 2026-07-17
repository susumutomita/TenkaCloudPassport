/**
 * Issue 15: WCAG 2.5.5 相当の 44 pt 以上の Touch Target を、Screen / Component 間で
 * 共有する 1 つの定数として固定する。各 `Pressable` の `style` はこの定数以上の
 * `minHeight`（または正方形なら `height`）を持つことを
 * `src/screens/touch-target.test.ts` がソーステキストで機械検証する。
 */
export const MIN_TOUCH_TARGET = 44;
