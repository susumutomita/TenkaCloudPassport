import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import type { DestroyedLounge } from '../domain/lounge';
import { colors, spacing } from '../ui/theme';

interface DestroyedLoungeScreenProps {
  readonly lounge: DestroyedLounge;
  readonly locale?: Locale;
  readonly onRestart: () => void;
}

export default function DestroyedLoungeScreen({
  lounge,
  locale = DEFAULT_LOCALE,
  onRestart,
}: DestroyedLoungeScreenProps) {
  const t = MESSAGES[locale].destroyedLounge;
  return (
    <AppScreen
      eyebrow="Lounge Destroyed"
      title={t.title}
      description={t.description}
    >
      <View style={styles.receipt}>
        <Text style={styles.receiptLabel}>{t.reasonLabel}</Text>
        <Text style={styles.receiptValue}>{t.reasons[lounge.reason]}</Text>
      </View>
      <ActionButton label={t.restartButton} onPress={onRestart} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  receipt: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  receiptLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  receiptValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
});
