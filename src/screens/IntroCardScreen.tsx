import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import RealQrView from '../components/RealQrView';
import type { IntroCard } from '../domain/intro-card';
import { encodeIntroCardUrl } from '../protocol/intro-card-url';
import { encodeQr } from '../qr/encoder';
import { colors, spacing } from '../ui/theme';
import IntroCardPreview from './IntroCardPreview';

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
 * 自己紹介カードピボット Step 1（Issue 79）のカード表示画面。QR の中身は Issue 84 の
 * Pivot で vCard 直埋めから、フラグメント埋め込み自己紹介ページ URL
 * （`encodeIntroCardUrl`、`site/c/index.html` が復元して表示する）へ変更した。相手は
 * QR をカメラで読むとブラウザで自己紹介を読み、連絡先への追加は相手がページ内で
 * 選べる（読んだら即座に連絡先へ追加されることはない）。保存済みの `IntroCard` から
 * 毎回 URL を再生成して実 QR を描く（`IntroCardEditScreen` の保存時点で
 * `encodeIntroCardUrl` を通した card だけがここへ渡るため、1,367 byte 超過は
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
  const encodedQr = useMemo(() => encodeQr(encodeIntroCardUrl(card)), [card]);

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
      <IntroCardPreview
        email={card.email}
        links={card.links}
        name={card.name}
        organization={card.organization}
        phone={card.phone}
        selfIntro={card.selfIntro}
        title={card.title}
      />
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
});
