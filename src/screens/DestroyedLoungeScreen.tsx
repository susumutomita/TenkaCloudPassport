import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import type {
  DestroyedLounge,
  LoungeDestructionReason,
} from '../domain/lounge';
import { colors, spacing } from '../ui/theme';

const REASON_LABELS: Record<LoungeDestructionReason, string> = {
  completed: '結果画面を閉じました。',
  'owner-exit': 'Owner が退出しました。',
  'host-ended': 'Host が Lounge を終了しました。',
  expired: '開始から 20 分が満了しました。',
};

interface DestroyedLoungeScreenProps {
  readonly lounge: DestroyedLounge;
  readonly onRestart: () => void;
}

export default function DestroyedLoungeScreen({
  lounge,
  onRestart,
}: DestroyedLoungeScreenProps) {
  return (
    <AppScreen
      eyebrow="Lounge Destroyed"
      title="この Encounter のデータを破棄しました。"
      description="Passport、相手の手掛かり、判定入力、Bridge または no-signal は履歴へ保存していません。"
    >
      <View style={styles.receipt}>
        <Text style={styles.receiptLabel}>終了理由</Text>
        <Text style={styles.receiptValue}>{REASON_LABELS[lounge.reason]}</Text>
      </View>
      <ActionButton
        label="保存済み Profile で新しい Encounter"
        onPress={onRestart}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  receipt: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  receiptLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  receiptValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
});
