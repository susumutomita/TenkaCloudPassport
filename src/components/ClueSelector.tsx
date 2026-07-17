import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { CLUE_IDS, type ClueId, clueById } from '../domain/clue-catalog';
import { PASSPORT_FIELD_LIMITS } from '../domain/passport';
import { colors, spacing } from '../ui/theme';

interface ClueSelectorProps {
  readonly selectedIds: readonly ClueId[];
  readonly onToggle: (id: ClueId) => void;
  readonly maximum: number;
  readonly enforceFieldLimits?: boolean;
  readonly locale?: Locale;
}

export default function ClueSelector({
  selectedIds,
  onToggle,
  maximum,
  enforceFieldLimits = false,
  locale = DEFAULT_LOCALE,
}: ClueSelectorProps) {
  const reachedMaximum = selectedIds.length >= maximum;
  const messages = MESSAGES[locale].clueSelector;
  return (
    <View style={styles.list}>
      {CLUE_IDS.map((id) => {
        const clue = clueById(id);
        const fieldLabel = messages.fieldLabels[clue.passportField];
        const selected = selectedIds.includes(id);
        const selectedInField = selectedIds.filter(
          (selectedId) =>
            clueById(selectedId).passportField === clue.passportField
        ).length;
        const reachedFieldMaximum =
          enforceFieldLimits &&
          selectedInField >= PASSPORT_FIELD_LIMITS[clue.passportField];
        const disabled = (reachedMaximum || reachedFieldMaximum) && !selected;
        return (
          <Pressable
            accessibilityLabel={messages.optionAccessibilityLabel(
              fieldLabel,
              clue.label
            )}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            key={id}
            onPress={() => onToggle(id)}
            style={({ pressed }) => [
              styles.option,
              selected ? styles.selectedOption : undefined,
              disabled ? styles.disabledOption : undefined,
              pressed ? styles.pressedOption : undefined,
            ]}
          >
            <View
              style={[styles.checkbox, selected ? styles.checked : undefined]}
            >
              {selected ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <View style={styles.optionText}>
              <Text style={styles.label}>{clue.label}</Text>
              <Text style={styles.category}>{fieldLabel}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.md,
  },
  selectedOption: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  disabledOption: {
    opacity: 0.46,
  },
  pressedOption: {
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
  optionText: {
    flex: 1,
    gap: 3,
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  category: {
    color: colors.muted,
    fontSize: 12,
  },
});
