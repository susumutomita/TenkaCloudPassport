import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { expiryNotice } from '../app/expiry-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
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
  readonly locale?: Locale;
  /**
   * Issue 15: OS の Reduce Motion 設定（`src/app/reduced-motion-port.ts` が判定した値）。
   * 真のとき、Pet Emoji の拍動 Animation を静的な表示へ置換する。
   */
  readonly reduceMotion?: boolean;
  readonly onBeginInteraction: () => void;
  readonly onExit: () => void;
  readonly onHostEnd: () => void;
  /**
   * Issue 15: Active Lounge の最中でも Settings（言語切り替え）へ到達できることを
   * 示す。`PassportApp.tsx` は `stage === 'settings'` を Lounge の状態確認より先に
   * 判定するため、この画面から離れても `lounge` state は変更されない
   * （`docs/design/i18n-and-accessibility.md` の設計判断 1）。
   */
  readonly onOpenSettings: () => void;
  readonly errorMessage: string | null;
}

/**
 * Interaction 実行中の Pet を表す軽い拍動 Animation。`reduceMotion` が真のときは
 * `Animated` を一切使わず静的な `Text` を描画する（`docs/design/i18n-and-accessibility.md`
 * の Reduce Motion 節）。この repo はレンダリング用の統合テスト基盤を持たないため、
 * 挙動は `active-lounge-reduced-motion.test.ts` のソーステキスト検査で固定する。
 */
function PetEmojiGlyph({
  emoji,
  reduceMotion,
}: {
  readonly emoji: string;
  readonly reduceMotion: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return undefined;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.12,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [reduceMotion, scale]);

  if (reduceMotion) {
    return <Text style={styles.petEmojiGlyph}>{emoji} </Text>;
  }
  return (
    <Animated.Text style={[styles.petEmojiGlyph, { transform: [{ scale }] }]}>
      {emoji}{' '}
    </Animated.Text>
  );
}

function PassportSummary({
  title,
  petName,
  petEmoji,
  values,
  reduceMotion,
}: {
  readonly title: string;
  readonly petName: string;
  readonly petEmoji: string | undefined;
  readonly values: readonly ClueId[];
  readonly reduceMotion: boolean;
}) {
  return (
    <View style={styles.passport}>
      <Text style={styles.passportTitle}>{title}</Text>
      <View style={styles.petNameRow}>
        {petEmoji ? (
          <PetEmojiGlyph emoji={petEmoji} reduceMotion={reduceMotion} />
        ) : null}
        <Text style={styles.petName}>{petName}</Text>
      </View>
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
  locale = DEFAULT_LOCALE,
  reduceMotion = false,
  onBeginInteraction,
  onExit,
  onHostEnd,
  onOpenSettings,
  errorMessage,
}: ActiveLoungeScreenProps) {
  const t = MESSAGES[locale].activeLounge;
  const common = MESSAGES[locale].common;
  const notice = expiryNotice(remainingMs, locale);
  return (
    <AppScreen
      eyebrow="Step 4 / Lounge"
      title={t.title}
      description={t.description}
    >
      <View style={styles.grid}>
        <PassportSummary
          petEmoji={lounge.ownerPassport.petEmoji}
          petName={lounge.ownerPassport.petName}
          reduceMotion={reduceMotion}
          title={t.localPassportTitle}
          values={lounge.ownerPassport.clues.map((clue) => clue.value)}
        />
        <PassportSummary
          petEmoji={lounge.encounteredPassport.petEmoji}
          petName={lounge.encounteredPassport.petName}
          reduceMotion={reduceMotion}
          title={t.peerPassportTitle}
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
        {interactionStatusNotice('discovering', locale).message}
      </Text>
      {/*
        Issue 13: Provider 切替理由を内容を含まない Status として表示する。この画面は
        まだ Local Agent 接続後の実際の Provider Runner（`src/domain/provider-fallback.ts`）を
        保持しないため（Issue 17 の Known follow-up）、常に「切替なし（null）」を渡す固定表示
        であり、live な per-session readout ではない。
      */}
      <Text style={styles.providerStatus}>
        {providerSwitchNotice(null, locale).message}
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t.disposableNoticeTitle}</Text>
        <Text style={styles.noticeText}>{t.disposableNoticeText}</Text>
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
      <ActionButton
        label={t.beginInteractionButton}
        onPress={onBeginInteraction}
      />
      <ActionButton label={t.exitButton} onPress={onExit} variant="secondary" />
      <ActionButton
        label={t.hostEndButton}
        onPress={onHostEnd}
        variant="danger"
      />
      <ActionButton
        accessibilityHint={common.settingsButtonHint}
        label={common.settingsButton}
        onPress={onOpenSettings}
        variant="secondary"
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
  petNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  petEmojiGlyph: {
    fontSize: 18,
  },
  petName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
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
