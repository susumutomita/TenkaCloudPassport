import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import { type ClueId, clueById } from '../domain/clue-catalog';
import type { ActiveLounge } from '../domain/lounge';
import { colors, spacing } from '../ui/theme';

interface ActiveLoungeScreenProps {
  readonly lounge: ActiveLounge;
  readonly onEvaluate: () => void;
  readonly onExit: () => void;
  readonly onHostEnd: () => void;
  readonly errorMessage: string | null;
}

function PassportSummary({
  title,
  values,
}: {
  readonly title: string;
  readonly values: readonly ClueId[];
}) {
  return (
    <View style={styles.passport}>
      <Text style={styles.passportTitle}>{title}</Text>
      {values.map((value) => (
        <Text key={value} style={styles.clue}>
          {clueById(value).label}
        </Text>
      ))}
    </View>
  );
}

export default function ActiveLoungeScreen({
  lounge,
  onEvaluate,
  onExit,
  onHostEnd,
  errorMessage,
}: ActiveLoungeScreenProps) {
  return (
    <AppScreen
      eyebrow="Step 3 / Lounge"
      title="確認済みの手掛かりだけで判定する。"
      description="Rules Provider は端末外へ通信せず、共通項目がなければ推測せずに no-signal を返します。"
    >
      <View style={styles.grid}>
        <PassportSummary
          title="この端末"
          values={lounge.ownerPassport.clues.map((clue) => clue.value)}
        />
        <PassportSummary
          title="Encounter"
          values={lounge.encounteredPassport.clues.map((clue) => clue.value)}
        />
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>使い捨て Lounge</Text>
        <Text style={styles.noticeText}>
          20 分満了、退出、Host 終了の最早契機で、現在のデータを破棄します。
        </Text>
      </View>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      <ActionButton label="Rules Provider で判定" onPress={onEvaluate} />
      <ActionButton label="退出して破棄" onPress={onExit} variant="secondary" />
      <ActionButton
        label="Host として終了"
        onPress={onHostEnd}
        variant="danger"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.sm,
  },
  passport: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  passportTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  clue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noticeTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
