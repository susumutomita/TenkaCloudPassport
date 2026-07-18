import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../ui/theme';
import ScreenCard from './ScreenCard';

interface JsonPreviewItem {
  readonly key: string;
  readonly value: string;
}

interface JsonPreviewCardProps {
  readonly byteLengthLabel: string;
  readonly items: readonly JsonPreviewItem[];
  readonly json: string;
  readonly title: string;
}

export default function JsonPreviewCard({
  byteLengthLabel,
  items,
  json,
  title,
}: JsonPreviewCardProps) {
  return (
    <ScreenCard title={title}>
      {items.map((item) => (
        <View key={item.key} style={styles.item}>
          <Text style={styles.itemKey}>{item.key}</Text>
          <Text selectable style={styles.itemValue}>
            {item.value}
          </Text>
        </View>
      ))}
      <Text style={styles.body}>{byteLengthLabel}</Text>
      <Text selectable style={styles.json}>
        {json}
      </Text>
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xs },
  itemKey: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  itemValue: { color: colors.ink, fontSize: 15 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  json: {
    color: colors.ink,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
