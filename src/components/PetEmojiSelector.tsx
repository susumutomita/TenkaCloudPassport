import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { PET_EMOJIS, type PetEmoji } from '../domain/passport';
import { colors, spacing } from '../ui/theme';

interface PetEmojiSelectorProps {
  readonly selected: PetEmoji;
  readonly onSelect: (emoji: PetEmoji) => void;
  readonly locale?: Locale;
}

export default function PetEmojiSelector({
  selected,
  onSelect,
  locale = DEFAULT_LOCALE,
}: PetEmojiSelectorProps) {
  const messages = MESSAGES[locale].petEmojiSelector;
  return (
    <View accessibilityRole="radiogroup" style={styles.list}>
      {PET_EMOJIS.map((emoji) => {
        const isSelected = emoji === selected;
        return (
          <Pressable
            accessibilityLabel={messages.optionAccessibilityLabel(emoji)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            key={emoji}
            onPress={() => onSelect(emoji)}
            style={({ pressed }) => [
              styles.option,
              isSelected ? styles.selected : undefined,
              pressed ? styles.pressed : undefined,
            ]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  selected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.72,
  },
  emoji: {
    fontSize: 25,
  },
});
