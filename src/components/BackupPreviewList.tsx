import { StyleSheet, Text, View } from 'react-native';
import type { BackupPreviewItem } from '../app/backup-export';
import { colors, spacing } from '../ui/theme';

interface BackupPreviewListProps {
  readonly items: readonly BackupPreviewItem[];
}

/** Export・Import どちらの Preview 画面も同じ「全項目を 1 行ずつ表示する」一覧を使う。 */
export default function BackupPreviewList({ items }: BackupPreviewListProps) {
  return (
    <View accessibilityRole="summary" style={styles.preview}>
      {items.map((item) => (
        <View key={item.key} style={styles.previewRow}>
          <Text style={styles.previewLabel}>{item.label}</Text>
          <Text style={styles.previewValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  previewRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 3,
    paddingTop: spacing.sm,
  },
  previewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  previewValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
});
