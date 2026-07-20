import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../ui/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ActionButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly variant?: ButtonVariant;
  readonly accessibilityHint?: string;
}

export default function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  accessibilityHint,
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  const pressedStyle = isPrimary ? styles.primaryPressed : styles.pressed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !disabled ? pressedStyle : undefined,
        disabled ? styles.disabled : undefined,
      ]}
    >
      <Text
        style={[
          styles.label,
          !isPrimary ? styles.darkLabel : undefined,
          disabled ? styles.disabledLabel : undefined,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.white,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.white,
    borderColor: colors.danger,
  },
  primaryPressed: {
    backgroundColor: colors.primaryPressed,
    borderColor: colors.primaryPressed,
  },
  pressed: {
    opacity: 0.78,
  },
  // ink 塗りのまま薄くすると文字が読めない灰色地になるため、disabled は
  // surface 地 + disabled 文字へ落とす（docs/design/2026-07-20-ink-summit-redesign.md
  // のエッジケース）。
  disabled: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
  },
  label: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  darkLabel: {
    color: colors.ink,
  },
  disabledLabel: {
    color: colors.disabled,
  },
});
