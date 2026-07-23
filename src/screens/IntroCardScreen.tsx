import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import RealQrView from '../components/RealQrView';
import type { IntroCard } from '../domain/intro-card';
import { encodeIntroCardUrl } from '../protocol/intro-card-url';
import { encodeQr } from '../qr/encoder';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';
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
  readonly onChangeLocale: (locale: Locale) => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
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
  onChangeLocale,
  onEdit,
  onDelete,
}: IntroCardScreenProps) {
  const t = MESSAGES[locale].introCard;
  const encodedQr = useMemo(() => encodeQr(encodeIntroCardUrl(card)), [card]);

  return (
    <AppScreen
      description={t.cardDescription}
      eyebrow={t.cardEyebrow}
      locale={locale}
      onChangeLocale={onChangeLocale}
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
      {/* Issue 118（owner 実機フィードバック）: 「見せるカード（QR 表示画面）の
          下に削除があるのが分かりにくい」。破壊的操作である削除を、編集と並ぶ
          目立つボタンから、編集の下にある控えめな下線付きテキストリンクへ
          移す。主導線は「編集」に集中させ、削除は二次的な位置づけにする
          （タップ領域自体は WCAG 2.5.5 相当の 44pt を維持する）。 */}
      <Pressable
        accessibilityHint={t.deleteButtonHint}
        accessibilityLabel={t.deleteButton}
        accessibilityRole="button"
        onPress={onDelete}
        style={styles.deleteLink}
      >
        <Text style={styles.deleteLinkText}>{t.deleteButton}</Text>
      </Pressable>
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
  deleteLink: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
  },
  deleteLinkText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
