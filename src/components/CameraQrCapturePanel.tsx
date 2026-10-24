import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { colors, spacing } from '../ui/theme';
import ActionButton from './ActionButton';

/** Shared presentation; the camera and its lifetime remain in the native overlay. */
export default function CameraQrCapturePanel({
  locale,
  onCancel,
}: {
  readonly locale: Locale;
  readonly onCancel: () => void;
}) {
  const t = MESSAGES[locale].cameraQrCapture;
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.panel}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t.title}
        </Text>
        <Text style={styles.hint}>{t.hint}</Text>
        <ActionButton
          accessibilityHint={t.cancelButtonHint}
          label={t.cancelButton}
          onPress={onCancel}
          variant="secondary"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    maxHeight: '70%',
    minHeight: 0,
    flexShrink: 1,
  },
  content: { gap: spacing.sm, padding: spacing.md },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '600' },
});
