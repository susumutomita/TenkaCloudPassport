import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { IntroCardNotice } from '../app/intro-card-notice';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import {
  INTRO_CARD_MAX_LINKS,
  INTRO_CARD_NAME_MAX_LENGTH,
  INTRO_CARD_ORGANIZATION_MAX_LENGTH,
  INTRO_CARD_SELF_INTRO_MAX_LENGTH,
  INTRO_CARD_TITLE_MAX_LENGTH,
} from '../domain/intro-card';
import { QR_ENCODER_MAX_BYTES } from '../qr/encoder';
import { colors, spacing } from '../ui/theme';

export interface IntroCardEditScreenProps {
  readonly name: string;
  readonly title: string;
  readonly organization: string;
  readonly selfIntro: string;
  readonly email: string;
  readonly phone: string;
  readonly linksText: string;
  readonly notice: IntroCardNotice;
  readonly saving: boolean;
  readonly cardUrlByteUsage: number;
  readonly locale?: Locale;
  readonly onChangeName: (value: string) => void;
  readonly onChangeTitle: (value: string) => void;
  readonly onChangeOrganization: (value: string) => void;
  readonly onChangeSelfIntro: (value: string) => void;
  readonly onChangeEmail: (value: string) => void;
  readonly onChangePhone: (value: string) => void;
  readonly onChangeLinksText: (value: string) => void;
  readonly onSave: () => void;
  readonly onOpenBackup: () => void;
  readonly onOpenSettings: () => void;
}

function nonEmptyLineCount(text: string): number {
  return text.split('\n').filter((line) => line.trim().length > 0).length;
}

function Notice({
  notice,
  locale,
}: {
  readonly notice: IntroCardNotice;
  readonly locale: Locale;
}) {
  const isError = !['empty', 'saved'].includes(notice.kind);
  const title = MESSAGES[locale].introCard.noticeTitles[notice.kind];
  return (
    <View
      accessibilityRole={isError ? 'alert' : 'summary'}
      style={[styles.notice, isError ? styles.errorNotice : undefined]}
    >
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{notice.message}</Text>
    </View>
  );
}

/**
 * 自己紹介カードピボット Step 1（Issue 79）の作成・編集画面。
 * `links` は domain 上 `readonly string[]`（最大 5 件）だが、動的な追加・削除 UI では
 * なく「1 行 1 件」の単一 TextInput にする（呼び出し側で改行区切りに変換する）。
 * 5 件の個別欄より状態管理が単純で、`intro-card-url.ts` の `links` 契約とも素直に対応する。
 */
export default function IntroCardEditScreen({
  name,
  title,
  organization,
  selfIntro,
  email,
  phone,
  linksText,
  notice,
  saving,
  cardUrlByteUsage,
  locale = DEFAULT_LOCALE,
  onChangeName,
  onChangeTitle,
  onChangeOrganization,
  onChangeSelfIntro,
  onChangeEmail,
  onChangePhone,
  onChangeLinksText,
  onSave,
  onOpenBackup,
  onOpenSettings,
}: IntroCardEditScreenProps) {
  const t = MESSAGES[locale].introCard;
  const common = MESSAGES[locale].common;
  const overBudget = cardUrlByteUsage > QR_ENCODER_MAX_BYTES;
  return (
    <AppScreen
      description={t.editDescription}
      eyebrow={t.editEyebrow}
      title={t.editTitle}
    >
      <Notice locale={locale} notice={notice} />
      <View style={styles.field}>
        <Text style={styles.label}>{t.nameLabel}</Text>
        <TextInput
          accessibilityHint={t.nameHint(INTRO_CARD_NAME_MAX_LENGTH)}
          accessibilityLabel={t.nameAccessibilityLabel}
          maxLength={INTRO_CARD_NAME_MAX_LENGTH}
          onChangeText={onChangeName}
          placeholder={t.namePlaceholder}
          style={styles.input}
          value={name}
        />
        <Text style={styles.limit}>
          {t.nameCounter(name.length, INTRO_CARD_NAME_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.titleLabel}</Text>
        <TextInput
          maxLength={INTRO_CARD_TITLE_MAX_LENGTH}
          onChangeText={onChangeTitle}
          placeholder={t.titlePlaceholder}
          style={styles.input}
          value={title}
        />
        <Text style={styles.limit}>
          {t.titleCounter(title.length, INTRO_CARD_TITLE_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.organizationLabel}</Text>
        <TextInput
          maxLength={INTRO_CARD_ORGANIZATION_MAX_LENGTH}
          onChangeText={onChangeOrganization}
          placeholder={t.organizationPlaceholder}
          style={styles.input}
          value={organization}
        />
        <Text style={styles.limit}>
          {t.organizationCounter(
            organization.length,
            INTRO_CARD_ORGANIZATION_MAX_LENGTH
          )}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.selfIntroLabel}</Text>
        <Text style={styles.limit}>{t.selfIntroHint}</Text>
        <TextInput
          maxLength={INTRO_CARD_SELF_INTRO_MAX_LENGTH}
          multiline
          onChangeText={onChangeSelfIntro}
          placeholder={t.selfIntroPlaceholder}
          style={[styles.input, styles.multilineInput]}
          value={selfIntro}
        />
        <Text style={styles.limit}>
          {t.selfIntroCounter(
            selfIntro.length,
            INTRO_CARD_SELF_INTRO_MAX_LENGTH
          )}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.emailLabel}</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={onChangeEmail}
          placeholder={t.emailPlaceholder}
          style={styles.input}
          value={email}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.phoneLabel}</Text>
        <TextInput
          keyboardType="phone-pad"
          onChangeText={onChangePhone}
          placeholder={t.phonePlaceholder}
          style={styles.input}
          value={phone}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.linksLabel}</Text>
        <Text style={styles.limit}>{t.linksHint}</Text>
        <TextInput
          multiline
          onChangeText={onChangeLinksText}
          placeholder={t.linksPlaceholder}
          style={[styles.input, styles.multilineInput]}
          value={linksText}
        />
        <Text style={styles.limit}>
          {t.linksCounter(nonEmptyLineCount(linksText), INTRO_CARD_MAX_LINKS)}
        </Text>
      </View>
      <Text style={overBudget ? styles.byteUsageOverBudget : styles.limit}>
        {overBudget
          ? t.byteUsageOverBudget(cardUrlByteUsage, QR_ENCODER_MAX_BYTES)
          : t.byteUsageLabel(cardUrlByteUsage, QR_ENCODER_MAX_BYTES)}
      </Text>
      <ActionButton
        accessibilityHint={t.saveButtonHint}
        disabled={saving}
        label={t.saveButton(saving)}
        onPress={onSave}
      />
      <ActionButton
        accessibilityHint={MESSAGES[locale].passportCreation.backupButtonHint}
        disabled={saving}
        label={MESSAGES[locale].passportCreation.backupButton}
        onPress={onOpenBackup}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={common.settingsButtonHint}
        disabled={saving}
        label={common.settingsButton}
        onPress={onOpenSettings}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorNotice: {
    backgroundColor: colors.white,
    borderColor: colors.danger,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  limit: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  byteUsageOverBudget: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
});
