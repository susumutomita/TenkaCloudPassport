import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import PetEmojiSelector from '../components/PetEmojiSelector';
import type { ClueId } from '../domain/clue-catalog';
import {
  PET_NAME_MAX_LENGTH,
  type PetEmoji,
  PUBLIC_PASSPORT_MAX_CLUES,
} from '../domain/passport';
import { colors, primaryEmphasisBorder, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';

interface EncounterSetupScreenProps {
  readonly privatePetName: string;
  readonly privateClueCount: number;
  readonly encounteredPetName: string;
  readonly encounteredPetEmoji: PetEmoji;
  readonly selectedIds: readonly ClueId[];
  readonly confirmed: boolean;
  readonly locale?: Locale;
  readonly onChangePetName: (value: string) => void;
  readonly onSelectPetEmoji: (emoji: PetEmoji) => void;
  readonly onToggle: (id: ClueId) => void;
  readonly onToggleConfirmed: () => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly errorMessage: string | null;
}

export default function EncounterSetupScreen({
  privatePetName,
  privateClueCount,
  encounteredPetName,
  encounteredPetEmoji,
  selectedIds,
  confirmed,
  locale = DEFAULT_LOCALE,
  onChangePetName,
  onSelectPetEmoji,
  onToggle,
  onToggleConfirmed,
  onContinue,
  onBack,
  errorMessage,
}: EncounterSetupScreenProps) {
  const t = MESSAGES[locale].encounterSetup;
  return (
    <AppScreen
      eyebrow="Step 2 / Encounter"
      title={t.title}
      description={t.description}
    >
      <View accessibilityRole="summary" style={styles.summary}>
        <Text style={styles.summaryLabel}>{t.localProfileSummaryLabel}</Text>
        <Text style={styles.summaryValue}>
          {t.localProfileSummaryValue(privatePetName, privateClueCount)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.sectionTitle}>{t.peerPetNameSectionTitle}</Text>
        <TextInput
          accessibilityLabel={t.peerPetNameAccessibilityLabel}
          accessibilityHint={t.peerPetNameHint(PET_NAME_MAX_LENGTH)}
          maxLength={PET_NAME_MAX_LENGTH}
          onChangeText={onChangePetName}
          placeholder={t.peerPetNamePlaceholder}
          style={styles.input}
          value={encounteredPetName}
        />
        <Text style={styles.limit}>
          {t.peerPetNameCounter(encounteredPetName.length, PET_NAME_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.sectionTitle}>{t.peerPetEmojiSectionTitle}</Text>
        <PetEmojiSelector
          locale={locale}
          onSelect={onSelectPetEmoji}
          selected={encounteredPetEmoji}
        />
      </View>
      <View style={styles.counterRow}>
        <Text style={styles.sectionTitle}>{t.peerCluesSectionTitle}</Text>
        <Text style={styles.counter}>
          {t.peerCluesCounter(selectedIds.length, PUBLIC_PASSPORT_MAX_CLUES)}
        </Text>
      </View>
      <Text style={styles.limit}>
        {t.peerCluesLimitNote(PUBLIC_PASSPORT_MAX_CLUES)}
      </Text>
      <ClueSelector
        locale={locale}
        maximum={PUBLIC_PASSPORT_MAX_CLUES}
        onToggle={onToggle}
        selectedIds={selectedIds}
      />
      <Pressable
        accessibilityLabel={t.confirmationAccessibilityLabel}
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
        <Text style={styles.confirmationText}>{t.confirmationText}</Text>
      </Pressable>
      {errorMessage ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>{t.validationErrorTitle}</Text>
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      ) : null}
      <ActionButton
        accessibilityHint={t.continueButtonHint}
        disabled={
          encounteredPetName.trim().length === 0 ||
          selectedIds.length === 0 ||
          !confirmed
        }
        label={t.continueButton}
        onPress={onContinue}
      />
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    ...primaryEmphasisBorder,
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
  field: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
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
    minHeight: MIN_TOUCH_TARGET,
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
  errorBox: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
