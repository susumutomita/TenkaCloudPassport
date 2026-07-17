import { Pressable, StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import type { ClueId } from '../domain/clue-catalog';
import { colors, spacing } from '../ui/theme';

interface EncounterSetupScreenProps {
  readonly privateClueCount: number;
  readonly selectedIds: readonly ClueId[];
  readonly confirmed: boolean;
  readonly onToggle: (id: ClueId) => void;
  readonly onToggleConfirmed: () => void;
  readonly onStart: () => void;
  readonly onBack: () => void;
  readonly errorMessage: string | null;
}

export default function EncounterSetupScreen({
  privateClueCount,
  selectedIds,
  confirmed,
  onToggle,
  onToggleConfirmed,
  onStart,
  onBack,
  errorMessage,
}: EncounterSetupScreenProps) {
  return (
    <AppScreen
      eyebrow="Step 2 / Encounter"
      title="相手が公開した手掛かりを受け取る。"
      description="実在する相手がこの場で公開した項目だけを選んでください。組み込みの Peer や接触履歴は使いません。"
    >
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>この端末の Passport</Text>
        <Text style={styles.summaryValue}>
          {privateClueCount} 件を公開準備済み
        </Text>
      </View>
      <View style={styles.counterRow}>
        <Text style={styles.sectionTitle}>相手の公開項目</Text>
        <Text style={styles.counter}>{selectedIds.length} / 3</Text>
      </View>
      <ClueSelector maximum={3} onToggle={onToggle} selectedIds={selectedIds} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={onToggleConfirmed}
        style={({ pressed }) => [
          styles.confirmation,
          confirmed ? styles.confirmed : undefined,
          pressed ? styles.pressed : undefined,
        ]}
      >
        <View style={[styles.checkbox, confirmed ? styles.checked : undefined]}>
          {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.confirmationText}>
          相手が現在の Lounge で公開した内容だと確認しました。
        </Text>
      </Pressable>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      <ActionButton
        disabled={selectedIds.length === 0 || !confirmed}
        label="単一端末 Lounge を開始"
        onPress={onStart}
      />
      <ActionButton
        label="Passport を作り直す"
        onPress={onBack}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
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
  confirmation: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  confirmed: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  confirmationText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
