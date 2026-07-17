import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import AppScreen from '../components/AppScreen';
import { colors, spacing } from '../ui/theme';

interface ProfileLoadingScreenProps {
  readonly locale?: Locale;
}

export default function ProfileLoadingScreen({
  locale = DEFAULT_LOCALE,
}: ProfileLoadingScreenProps) {
  const t = MESSAGES[locale].profileLoading;
  return (
    <AppScreen
      eyebrow="Local Profile"
      title={t.title}
      description={t.description}
    >
      <View accessibilityRole="progressbar" style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.text}>{t.loading}</Text>
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
