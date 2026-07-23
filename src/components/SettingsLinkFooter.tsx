import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';

export interface SettingsLinkFooterProps {
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
}

/**
 * Issue 130（Codex 指摘 blocker）: #127 が外した Settings 導線を、クイズ・診断・
 * 端末内会話エージェント（Issue 104）への唯一の入口として複数の画面
 * （`IntroCardScreen` / `IntroCardEditScreen` / `ConversationAgentScreen`）が
 * 共通で持つ、控えめなテキストリンク。3 画面がそれぞれ同じ `Pressable` +
 * Style を複製していた（jscpd 重複検出の指摘）ため、ここへ集約する。
 */
export default function SettingsLinkFooter({
  label,
  hint,
  onPress,
}: SettingsLinkFooterProps) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.settingsLink}
    >
      <Text style={styles.settingsLinkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  settingsLink: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
  },
  settingsLinkText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
