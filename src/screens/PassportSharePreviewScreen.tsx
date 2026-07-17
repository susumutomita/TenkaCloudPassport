import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type {
  PassportPreviewItem,
  PassportShareSelection,
} from '../app/passport-share';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import {
  type ClueId,
  clueById,
  LANGUAGE_CATALOG,
  type LanguageCode,
} from '../domain/clue-catalog';
import type { LocalPrivateProfile } from '../domain/passport';
import { PUBLIC_PASSPORT_MAX_CLUES } from '../domain/passport';
import { colors, spacing } from '../ui/theme';

interface PassportSharePreviewScreenProps {
  readonly profile: LocalPrivateProfile;
  readonly selection: PassportShareSelection;
  readonly previewItems: readonly PassportPreviewItem[] | null;
  readonly validationMessage: string | null;
  readonly locale?: Locale;
  readonly onTogglePetName: () => void;
  readonly onTogglePetEmoji: () => void;
  readonly onToggleOwnerAlias: () => void;
  readonly onToggleClue: (id: ClueId) => void;
  readonly onToggleLanguage: (code: LanguageCode) => void;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

interface ToggleRowProps {
  readonly label: string;
  readonly value: string;
  readonly enabled: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
  readonly accessibilityLabel: string;
  readonly stateText: string;
}

function ToggleRow({
  label,
  value,
  enabled,
  disabled = false,
  onToggle,
  accessibilityLabel,
  stateText,
}: ToggleRowProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.toggle,
        enabled ? styles.toggleEnabled : undefined,
        disabled ? styles.toggleDisabled : undefined,
        pressed ? styles.pressed : undefined,
      ]}
    >
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleValue}>{value}</Text>
      </View>
      <Text style={styles.toggleState}>{stateText}</Text>
    </Pressable>
  );
}

export default function PassportSharePreviewScreen({
  profile,
  selection,
  previewItems,
  validationMessage,
  locale = DEFAULT_LOCALE,
  onTogglePetName,
  onTogglePetEmoji,
  onToggleOwnerAlias,
  onToggleClue,
  onToggleLanguage,
  onStart,
  onBack,
}: PassportSharePreviewScreenProps) {
  const t = MESSAGES[locale].sharePreview;
  const fieldLabels = MESSAGES[locale].clueSelector.fieldLabels;
  const clueMaximumReached =
    selection.clueIds.length >= PUBLIC_PASSPORT_MAX_CLUES;
  function toggleState(enabled: boolean): string {
    return enabled ? t.toggleStateOn : t.toggleStateOff;
  }
  return (
    <AppScreen
      eyebrow="Step 3 / Share Preview"
      title={t.title}
      description={t.description}
    >
      <View accessibilityRole="summary" style={styles.warning}>
        <Text style={styles.warningTitle}>{t.warningTitle}</Text>
        <Text style={styles.warningText}>{t.warningText}</Text>
      </View>
      <Text style={styles.sectionTitle}>{t.toggleSectionTitle}</Text>
      <ToggleRow
        accessibilityLabel={t.toggleAccessibilityLabel(
          t.petNameFieldLabel,
          profile.petName,
          selection.includePetName
        )}
        enabled={selection.includePetName}
        label={t.petNameFieldLabel}
        onToggle={onTogglePetName}
        stateText={toggleState(selection.includePetName)}
        value={profile.petName}
      />
      <ToggleRow
        accessibilityLabel={t.toggleAccessibilityLabel(
          t.petEmojiFieldLabel,
          profile.petEmoji,
          selection.includePetEmoji
        )}
        enabled={selection.includePetEmoji}
        label={t.petEmojiFieldLabel}
        onToggle={onTogglePetEmoji}
        stateText={toggleState(selection.includePetEmoji)}
        value={profile.petEmoji}
      />
      {profile.ownerAlias ? (
        <ToggleRow
          accessibilityLabel={t.toggleAccessibilityLabel(
            t.ownerAliasFieldLabel,
            profile.ownerAlias,
            selection.includeOwnerAlias
          )}
          enabled={selection.includeOwnerAlias}
          label={t.ownerAliasFieldLabel}
          onToggle={onToggleOwnerAlias}
          stateText={toggleState(selection.includeOwnerAlias)}
          value={profile.ownerAlias}
        />
      ) : null}
      {profile.candidateClues.map((clue) => {
        const definition = clueById(clue.value);
        const fieldLabel = fieldLabels[definition.passportField];
        const enabled = selection.clueIds.includes(clue.value);
        return (
          <ToggleRow
            accessibilityLabel={t.toggleAccessibilityLabel(
              fieldLabel,
              definition.label,
              enabled
            )}
            disabled={
              !clue.selectedForPassport || (clueMaximumReached && !enabled)
            }
            enabled={enabled}
            key={clue.value}
            label={fieldLabel}
            onToggle={() => onToggleClue(clue.value)}
            stateText={toggleState(enabled)}
            value={definition.label}
          />
        );
      })}
      {profile.languages.map((language) => {
        const enabled = selection.languageCodes.includes(language);
        const value = LANGUAGE_CATALOG[language].label;
        return (
          <ToggleRow
            accessibilityLabel={t.toggleAccessibilityLabel(
              t.languageFieldLabel,
              value,
              enabled
            )}
            enabled={enabled}
            key={language}
            label={t.languageFieldLabel}
            onToggle={() => onToggleLanguage(language)}
            stateText={toggleState(enabled)}
            value={value}
          />
        );
      })}
      {validationMessage ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>{t.validationErrorTitle}</Text>
          <Text style={styles.errorText}>{validationMessage}</Text>
        </View>
      ) : null}
      {previewItems ? (
        <View accessibilityRole="summary" style={styles.preview}>
          <Text style={styles.previewTitle}>{t.previewTitle}</Text>
          {previewItems.map((item) => (
            <View key={item.key} style={styles.previewRow}>
              <Text style={styles.previewLabel}>{item.label}</Text>
              <Text style={styles.previewValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <ActionButton
        accessibilityHint={t.startButtonHint}
        disabled={!previewItems}
        label={t.startButton}
        onPress={onStart}
      />
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  warning: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  warningText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  toggle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 58,
    padding: spacing.md,
  },
  toggleEnabled: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  toggleDisabled: {
    opacity: 0.46,
  },
  pressed: {
    opacity: 0.72,
  },
  toggleText: {
    flex: 1,
    gap: 3,
  },
  toggleLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  toggleValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  toggleState: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
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
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
  preview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  previewTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  previewRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 3,
    paddingTop: spacing.sm,
  },
  previewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  previewValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
});
