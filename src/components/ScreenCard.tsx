import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../ui/theme';

interface ScreenCardProps extends PropsWithChildren {
  readonly title: string;
}

export default function ScreenCard({ children, title }: ScreenCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '800' },
});
