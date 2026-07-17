import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import { colors, spacing } from '../ui/theme';

export default function ProfileLoadingScreen() {
  return (
    <AppScreen
      eyebrow="Local Profile"
      title="端末内の保存状態を確認しています。"
      description="明示保存済みの Local Profile だけを読み込みます。Draft や Lounge の履歴は復元しません。"
    >
      <View accessibilityRole="progressbar" style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.text}>読込中です。</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  text: {
    color: colors.ink,
    fontSize: 15,
  },
});
