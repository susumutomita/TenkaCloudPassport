import { StyleSheet, Text, View } from 'react-native';
import type { DistributionCapability } from '../app/distribution-capability';
import { distributionCapabilityNotice } from '../app/distribution-capability-notice';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
} from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import { colors, spacing } from '../ui/theme';

interface SettingsScreenProps {
  readonly distributionCapability: DistributionCapability;
  readonly locale?: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
  readonly onOpenDiagnostics: () => void;
  readonly onOpenPilotMeasurement: () => void;
  readonly onBack: () => void;
}

/**
 * Issue 15: 表示言語を切り替える最小の Settings 画面。`onChangeLocale` は `PassportApp.tsx`
 * が保持する `locale` state だけを更新し、進行中の Lounge / Room / Pet Interaction /
 * 保存済み Local Profile のいずれにも触れない（`docs/design/i18n-and-accessibility.md`
 * の設計判断 1）。
 */
export default function SettingsScreen({
  distributionCapability,
  locale = DEFAULT_LOCALE,
  onChangeLocale,
  onOpenDiagnostics,
  onOpenPilotMeasurement,
  onBack,
}: SettingsScreenProps) {
  const t = MESSAGES[locale].settings;
  const capabilityNotice = distributionCapabilityNotice(
    distributionCapability,
    locale
  );
  return (
    <AppScreen description={t.description} eyebrow="Settings" title={t.title}>
      <Text style={styles.sectionTitle}>{t.distributionSectionTitle}</Text>
      <View style={styles.capabilityCard}>
        <Text style={styles.capabilityText}>{capabilityNotice.runtime}</Text>
        <Text style={styles.capabilityText}>{capabilityNotice.tier}</Text>
        <Text style={styles.capabilityText}>
          {capabilityNotice.rulesProvider}
        </Text>
        <Text style={styles.capabilityText}>{capabilityNotice.localModel}</Text>
        <Text style={styles.capabilityText}>
          {capabilityNotice.nearbyTransport}
        </Text>
      </View>
      <Text style={styles.sectionTitle}>{t.languageSectionTitle}</Text>
      <View style={styles.options}>
        {LOCALES.map((option) => {
          const selected = option === locale;
          return (
            <ActionButton
              accessibilityHint={t.languageOptionHint}
              key={option}
              label={t.languageOptionAccessibilityLabel(
                LOCALE_LABELS[option],
                selected
              )}
              onPress={() => onChangeLocale(option)}
              variant={selected ? 'primary' : 'secondary'}
            />
          );
        })}
      </View>
      <ActionButton
        accessibilityHint={t.diagnosticsButtonHint}
        label={t.diagnosticsButton}
        onPress={onOpenDiagnostics}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.pilotMeasurementButtonHint}
        label={t.pilotMeasurementButton}
        onPress={onOpenPilotMeasurement}
        variant="secondary"
      />
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  capabilityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  capabilityText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  options: {
    gap: spacing.sm,
  },
});
