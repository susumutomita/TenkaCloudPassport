import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { ProfileNotice } from '../app/profile-notice';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import LanguageSelector from '../components/LanguageSelector';
import PetEmojiSelector from '../components/PetEmojiSelector';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import {
  OWNER_ALIAS_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  type PetEmoji,
  PROFILE_MAX_CLUES,
} from '../domain/passport';
import { colors, spacing } from '../ui/theme';
import { monoFontFamily } from '../ui/typography';

interface PassportCreationScreenProps {
  readonly petName: string;
  readonly petEmoji: PetEmoji;
  readonly ownerAlias: string;
  readonly selectedIds: readonly ClueId[];
  readonly languageCodes: readonly LanguageCode[];
  readonly notice: ProfileNotice;
  readonly saving: boolean;
  readonly locale?: Locale;
  readonly onChangePetName: (value: string) => void;
  readonly onSelectPetEmoji: (emoji: PetEmoji) => void;
  readonly onChangeOwnerAlias: (value: string) => void;
  readonly onToggleClue: (id: ClueId) => void;
  readonly onToggleLanguage: (code: LanguageCode) => void;
  readonly onSave: () => void;
  readonly onOpenBackup: () => void;
  readonly onOpenSettings: () => void;
}

function Notice({
  notice,
  locale,
}: {
  readonly notice: ProfileNotice;
  readonly locale: Locale;
}) {
  const isError = !['empty', 'restored', 'lounge-discarded'].includes(
    notice.kind
  );
  const title = MESSAGES[locale].passportCreation.noticeTitles[notice.kind];
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

export default function PassportCreationScreen({
  petName,
  petEmoji,
  ownerAlias,
  selectedIds,
  languageCodes,
  notice,
  saving,
  locale = DEFAULT_LOCALE,
  onChangePetName,
  onSelectPetEmoji,
  onChangeOwnerAlias,
  onToggleClue,
  onToggleLanguage,
  onSave,
  onOpenBackup,
  onOpenSettings,
}: PassportCreationScreenProps) {
  const t = MESSAGES[locale].passportCreation;
  const common = MESSAGES[locale].common;
  return (
    <AppScreen
      eyebrow="Step 1 / Local Profile"
      title={t.title}
      description={t.description}
    >
      <Notice locale={locale} notice={notice} />
      <View style={styles.field}>
        <Text nativeID="pet-name-label" style={styles.label}>
          {t.petNameLabel}
        </Text>
        <TextInput
          accessibilityLabel={t.petNameAccessibilityLabel}
          accessibilityHint={t.petNameHint(PET_NAME_MAX_LENGTH)}
          maxLength={PET_NAME_MAX_LENGTH}
          onChangeText={onChangePetName}
          placeholder={t.petNamePlaceholder}
          style={styles.input}
          value={petName}
        />
        <Text style={styles.limit}>
          {t.petNameCounter(petName.length, PET_NAME_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.petEmojiLabel}</Text>
        <PetEmojiSelector
          locale={locale}
          onSelect={onSelectPetEmoji}
          selected={petEmoji}
        />
      </View>
      <View style={styles.field}>
        <Text nativeID="owner-alias-label" style={styles.label}>
          {t.ownerAliasLabel}
        </Text>
        <TextInput
          accessibilityLabel={t.ownerAliasAccessibilityLabel}
          accessibilityHint={t.ownerAliasHint(OWNER_ALIAS_MAX_LENGTH)}
          maxLength={OWNER_ALIAS_MAX_LENGTH}
          onChangeText={onChangeOwnerAlias}
          placeholder={t.ownerAliasPlaceholder}
          style={styles.input}
          value={ownerAlias}
        />
        <Text style={styles.limit}>
          {t.ownerAliasCounter(ownerAlias.length, OWNER_ALIAS_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.counterRow}>
        <Text style={styles.sectionTitle}>{t.cluesSectionTitle}</Text>
        <Text style={styles.counter}>
          {t.cluesCounter(selectedIds.length, PROFILE_MAX_CLUES)}
        </Text>
      </View>
      <Text style={styles.limit}>{t.cluesLimitNote}</Text>
      <ClueSelector
        enforceFieldLimits
        locale={locale}
        maximum={PROFILE_MAX_CLUES}
        onToggle={onToggleClue}
        selectedIds={selectedIds}
      />
      <View style={styles.field}>
        <Text style={styles.sectionTitle}>{t.languagesSectionTitle}</Text>
        <Text style={styles.limit}>{t.languagesNote}</Text>
        <LanguageSelector
          locale={locale}
          onToggle={onToggleLanguage}
          selectedCodes={languageCodes}
        />
      </View>
      <ActionButton
        accessibilityHint={t.saveButtonHint}
        disabled={saving}
        label={t.saveButton(saving)}
        onPress={onSave}
      />
      <ActionButton
        accessibilityHint={t.backupButtonHint}
        disabled={saving}
        label={t.backupButton}
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
  limit: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
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
    color: colors.ink,
    fontFamily: monoFontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
});
