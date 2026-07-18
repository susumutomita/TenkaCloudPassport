import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../ui/theme';

interface NoticeCardProps {
  readonly body: string;
  readonly title: string;
}

export default function NoticeCard({ body, title }: NoticeCardProps) {
  return (
    <View accessibilityRole="summary" style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
