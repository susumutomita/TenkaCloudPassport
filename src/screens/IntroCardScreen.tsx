import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import RealQrView from '../components/RealQrView';
import type { IntroCard } from '../domain/intro-card';
import { encodeVCard } from '../protocol/vcard';
import { encodeQr } from '../qr/encoder';
import { colors, spacing } from '../ui/theme';

export interface IntroCardScreenProps {
  readonly card: IntroCard;
  /**
   * カード削除の失敗だけをこの画面で表示する（Issue 79 レビュー指摘：削除失敗時に
   * stage を変えないため、`IntroCardEditScreen` の Notice 欄では表示されない）。
   * 保存成功・空状態等の他の Notice はこの画面の関心事ではないため含めない。
   */
  readonly deleteError: string | null;
  readonly locale?: Locale;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onOpenBackup: () => void;
  readonly onOpenSettings: () => void;
}

/**
 * 自己紹介カードピボット Step 1（Issue 79）のカード表示画面。保存済みの
 * `IntroCard` から毎回 vCard を再生成して実 QR を描く（`IntroCardEditScreen` の
 * 保存時点で `encodeVCard` を通した card だけがここへ渡るため、1,024 byte 超過は
 * 発生しない前提で `useMemo` の中で直接呼ぶ）。
 */
export default function IntroCardScreen({
  card,
  deleteError,
  locale = DEFAULT_LOCALE,
  onEdit,
  onDelete,
  onOpenBackup,
  onOpenSettings,
}: IntroCardScreenProps) {
  const t = MESSAGES[locale].introCard;
  const common = MESSAGES[locale].common;
  const encodedQr = useMemo(() => encodeQr(encodeVCard(card)), [card]);
  const subtitle = [card.title, card.organization]
    .filter((value): value is string => Boolean(value))
    .join(' / ');

  return (
    <AppScreen
      description={t.cardDescription}
      eyebrow={t.cardEyebrow}
      title={t.cardTitle}
    >
      {deleteError ? (
        <View accessibilityRole="alert" style={styles.errorNotice}>
          <Text style={styles.errorNoticeTitle}>
            {t.noticeTitles['delete-error']}
          </Text>
          <Text style={styles.errorNoticeText}>{deleteError}</Text>
        </View>
      ) : null}
      <View accessibilityLabel={t.qrAccessibilityLabel} style={styles.qrWrap}>
        <RealQrView matrix={encodedQr.matrix} />
      </View>
      <Text style={styles.qrExplanation}>{t.qrExplanation}</Text>
      <View style={styles.summary}>
        <Text style={styles.name}>{card.name}</Text>
        {subtitle.length > 0 ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : null}
        {card.selfIntro ? (
          <Text style={styles.selfIntro}>{card.selfIntro}</Text>
        ) : null}
        {card.email ? <Text style={styles.contact}>{card.email}</Text> : null}
        {card.phone ? <Text style={styles.contact}>{card.phone}</Text> : null}
        {(card.links ?? []).map((link) => (
          <Text key={link} style={styles.contact}>
            {link}
          </Text>
        ))}
      </View>
      <ActionButton
        accessibilityHint={t.editButtonHint}
        label={t.editButton}
        onPress={onEdit}
      />
      <ActionButton
        accessibilityHint={MESSAGES[locale].passportCreation.backupButtonHint}
        label={MESSAGES[locale].passportCreation.backupButton}
        onPress={onOpenBackup}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={common.settingsButtonHint}
        label={common.settingsButton}
        onPress={onOpenSettings}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.deleteButtonHint}
        label={t.deleteButton}
        onPress={onDelete}
        variant="danger"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  errorNotice: {
    backgroundColor: colors.white,
    borderColor: colors.danger,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorNoticeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  errorNoticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  qrWrap: {
    alignSelf: 'center',
  },
  qrExplanation: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  summary: {
    gap: spacing.xs,
  },
  name: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
  },
  selfIntro: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 23,
    marginTop: spacing.sm,
  },
  contact: {
    color: colors.muted,
    fontSize: 14,
  },
});
