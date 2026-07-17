import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import type { ClueId } from '../domain/clue-catalog';
import { colors, spacing } from '../ui/theme';

interface PassportCreationScreenProps {
  readonly selectedIds: readonly ClueId[];
  readonly onToggle: (id: ClueId) => void;
  readonly onCreate: () => void;
  readonly errorMessage: string | null;
}

export default function PassportCreationScreen({
  selectedIds,
  onToggle,
  onCreate,
  errorMessage,
}: PassportCreationScreenProps) {
  return (
    <AppScreen
      eyebrow="Step 1 / Passport"
      title="話してよいことだけを選ぶ。"
      description="版管理済みカタログから、この Encounter で公開する手掛かりを 1〜3 件選んでください。自由記述や連絡先は保存しません。"
    >
      <View style={styles.counterRow}>
        <Text style={styles.sectionTitle}>公開する手掛かり</Text>
        <Text style={styles.counter}>{selectedIds.length} / 3</Text>
      </View>
      <ClueSelector maximum={3} onToggle={onToggle} selectedIds={selectedIds} />
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      <ActionButton
        disabled={selectedIds.length === 0}
        label="公開内容を確認して Passport を作成"
        onPress={onCreate}
      />
      <Text style={styles.privacyNote}>
        Passport は現在の Lounge のメモリだけで使い、履歴へ保存しません。
      </Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  counterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  counter: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
  privacyNote: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
