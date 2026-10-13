import { StyleSheet } from 'react-native';
import { colors, spacing } from '../ui/theme';

/** Settings data-erasure styles; no model acquisition UI. */
export const dataErasureCardOverride = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    gap: spacing.sm,
  },
}).card;

export const dataErasureCardStyles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
  },
});
