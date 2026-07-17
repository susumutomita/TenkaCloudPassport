import { StyleSheet, Text, View } from 'react-native';
import { expiryNotice } from '../app/expiry-notice';
import { interactionStatusNotice } from '../app/interaction-status-notice';
import { providerSwitchNotice } from '../app/provider-switch-notice';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import { type ClueId, clueById } from '../domain/clue-catalog';
import type { ActiveLounge } from '../domain/lounge';
import { colors, spacing } from '../ui/theme';

interface ActiveLoungeScreenProps {
  readonly lounge: ActiveLounge;
  readonly remainingMs: number;
  readonly onBeginInteraction: () => void;
  readonly onExit: () => void;
  readonly onHostEnd: () => void;
  readonly errorMessage: string | null;
}

function PassportSummary({
  title,
  petName,
  petEmoji,
  values,
}: {
  readonly title: string;
  readonly petName: string;
  readonly petEmoji: string | undefined;
  readonly values: readonly ClueId[];
}) {
  return (
    <View style={styles.passport}>
      <Text style={styles.passportTitle}>{title}</Text>
      <Text style={styles.petName}>
        {petEmoji ? `${petEmoji} ` : ''}
        {petName}
      </Text>
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
  remainingMs,
  onBeginInteraction,
  onExit,
  onHostEnd,
  errorMessage,
}: ActiveLoungeScreenProps) {
  const notice = expiryNotice(remainingMs);
  return (
    <AppScreen
      eyebrow="Step 4 / Lounge"
      title="確認済みの手掛かりだけで判定する。"
      description="Local Agent は端末外へ通信せず、共通項目がなければ推測せずに no-signal を返します。必要な場合は Owner へ 1 問だけ確認します。"
    >
      <View style={styles.grid}>
        <PassportSummary
          petEmoji={lounge.ownerPassport.petEmoji}
          petName={lounge.ownerPassport.petName}
          title="この端末"
          values={lounge.ownerPassport.clues.map((clue) => clue.value)}
        />
        <PassportSummary
          petEmoji={lounge.encounteredPassport.petEmoji}
          petName={lounge.encounteredPassport.petName}
          title="Encounter"
          values={lounge.encounteredPassport.clues.map((clue) => clue.value)}
        />
      </View>
      {/*
        Rules Provider 判定前の Active Lounge は、bounded protocol
        （`src/domain/pet-interaction.ts`）でいう discovering フェーズに常に対応する
        固定の説明文であり、実行中の Pet Interaction Session を逐次追跡する live な
        readout ではない（そのような Session はまだこの画面に配線していない。
        Known follow-ups 参照）。逐次更新される値であるかのように読める
        accessibilityLabel は付けない。
      */}
      <Text style={styles.interactionStatus}>
        {interactionStatusNotice('discovering').message}
      </Text>
      {/*
        Issue 13: Provider 切替理由を内容を含まない Status として表示する。この画面は
        まだ Local Agent 接続後の実際の Provider Runner（`src/domain/provider-fallback.ts`）を
        保持しないため（Issue 17 の Known follow-up）、常に「切替なし（null）」を渡す固定表示
        であり、live な per-session readout ではない。
      */}
      <Text style={styles.providerStatus}>
        {providerSwitchNotice(null).message}
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>使い捨て Lounge</Text>
        <Text style={styles.noticeText}>
          20 分満了、退出、Host 終了の最早契機で、現在のデータを破棄します。
        </Text>
      </View>
      {notice.level === 'warning' ? (
        <View accessibilityRole="alert" style={styles.expiryWarning}>
          <Text style={styles.expiryWarningText}>{notice.message}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      <ActionButton label="会話の糸を探す" onPress={onBeginInteraction} />
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
  interactionStatus: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  providerStatus: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
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
  petName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing.xs,
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
  expiryWarning: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  expiryWarningText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
