import type { PropsWithChildren } from 'react';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../ui/theme';

interface CardProps extends PropsWithChildren {
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityRole?: AccessibilityRole;
}

/**
 * Issue 72 D: 白地 + borderSubtle のカード意匠が 5 箇所インラインでコピペされていたため
 * 抽出したプリミティブ。title は持たない（見出しが要る画面は Text を children に渡す）。
 * `style` prop は既定スタイルの後ろにマージするため、利用側で radius 16 等へ上書きできる。
 * `accessibilityRole` は `View` へそのまま渡す。利用側が意味的なグルーピング
 * （`"summary"` 等）を持たせるために、Card をラップする素の View を増やさずに済む。
 */
export default function Card({
  children,
  style,
  accessibilityRole,
}: CardProps) {
  return (
    <View accessibilityRole={accessibilityRole} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
});
