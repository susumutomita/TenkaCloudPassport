import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import {
  LANGUAGE_CATALOG,
  LANGUAGE_CODES,
  type LanguageCode,
} from '../domain/clue-catalog';
import { colors, spacing } from '../ui/theme';

interface LanguageSelectorProps {
  readonly selectedCodes: readonly LanguageCode[];
  readonly onToggle: (code: LanguageCode) => void;
  readonly locale?: Locale;
}

export default function LanguageSelector({
  selectedCodes,
  onToggle,
  locale = DEFAULT_LOCALE,
}: LanguageSelectorProps) {
  const messages = MESSAGES[locale].languageSelector;
  return (
    <View style={styles.list}>
      {LANGUAGE_CODES.map((code) => {
        const selected = selectedCodes.includes(code);
        return (
          <Pressable
            accessibilityLabel={messages.optionAccessibilityLabel(
              LANGUAGE_CATALOG[code].label
            )}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            key={code}
            onPress={() => onToggle(code)}
            style={({ pressed }) => [
              styles.option,
              selected ? styles.selected : undefined,
              pressed ? styles.pressed : undefined,
            ]}
          >
            <Text style={styles.label}>{LANGUAGE_CATALOG[code].label}</Text>
            <Text style={styles.state}>
              {selected ? messages.stateOn : messages.stateOff}
            </Text>
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
    justifyContent: 'space-between',
    minHeight: 52,
    padding: spacing.md,
  },
  selected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  state: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
});
