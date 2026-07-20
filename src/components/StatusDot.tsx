import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme';

export type StatusTone = 'info' | 'success' | 'warning' | 'idle' | 'summit';

interface StatusDotProps {
  readonly tone: StatusTone;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Issue 72 A: 4 画面（ActiveLounge / HostInvite / Outcome / OwnerQuestion）に
 * コピペされ 7px / 8px にドリフトしていた状態ドットの共有原子。tone→色の写像は
 * この `styles`（`ActionButton` の `styles[variant]` と同じ既定パターン）1 箇所に
 * 閉じ、render のたびに新しいスタイルオブジェクトを作らない。ドット単独では意味を
 * 持たず、隣接する Text ラベルが意味を持つため `accessible={false}` で支援技術から
 * 隠す。
 */
export default function StatusDot({ tone, style }: StatusDotProps) {
  return <View accessible={false} style={[styles.dot, styles[tone], style]} />;
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  info: {
    backgroundColor: colors.info,
  },
  success: {
    backgroundColor: colors.success,
  },
  warning: {
    backgroundColor: colors.warning,
  },
  idle: {
    backgroundColor: colors.disabled,
  },
  summit: {
    backgroundColor: colors.accent,
  },
});
