import { StyleSheet, Text } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { PILOT_MINIMUM_AGGREGATION_UNIT } from '../app/pilot-measurement';
import type { PilotMeasurementFlow } from '../app/use-pilot-measurement-flow';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import JsonPreviewCard from '../components/JsonPreviewCard';
import NoticeCard from '../components/NoticeCard';
import ScreenCard from '../components/ScreenCard';
import { colors, spacing } from '../ui/theme';

interface PilotMeasurementScreenProps {
  readonly flow: PilotMeasurementFlow;
  readonly locale?: Locale;
}

export default function PilotMeasurementScreen({
  flow,
  locale = DEFAULT_LOCALE,
}: PilotMeasurementScreenProps) {
  const t = MESSAGES[locale].pilotMeasurement;
  const outcomeCount =
    flow.aggregate.outcomes.bridge + flow.aggregate.outcomes.noSignal;
  const belowMinimum = outcomeCount < PILOT_MINIMUM_AGGREGATION_UNIT;
  const notice = flow.notice ? t.notice[flow.notice] : null;
  return (
    <AppScreen
      description={t.description}
      eyebrow="Pilot Measurement"
      title={t.title}
    >
      <NoticeCard body={t.memoryOnlyText} title={t.memoryOnlyTitle} />
      <ScreenCard title={t.researchConsentTitle}>
        <Text style={styles.body}>
          {flow.researchEnabled ? t.researchEnabled : t.researchDisabled}
        </Text>
        <ActionButton
          label={
            flow.researchEnabled
              ? t.disableResearchButton
              : t.enableResearchButton
          }
          onPress={() => flow.setResearchEnabled(!flow.researchEnabled)}
          variant={flow.researchEnabled ? 'danger' : 'secondary'}
        />
      </ScreenCard>
      {belowMinimum ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {t.belowMinimum(outcomeCount, PILOT_MINIMUM_AGGREGATION_UNIT)}
        </Text>
      ) : null}
      {flow.preview ? (
        <JsonPreviewCard
          byteLengthLabel={t.byteLength(flow.preview.byteLength)}
          items={flow.preview.items}
          json={flow.preview.json}
          title={t.previewTitle}
        />
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.noticeText}>
          {notice}
        </Text>
      ) : null}
      {flow.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t.shareError}
        </Text>
      ) : null}
      <ActionButton
        disabled={flow.sharing}
        label={t.refreshButton}
        onPress={flow.refreshPreview}
        variant="secondary"
      />
      <ActionButton
        disabled={!flow.preview || flow.sharing}
        label={t.shareButton(flow.sharing)}
        onPress={() => void flow.share()}
      />
      <ActionButton
        disabled={flow.sharing}
        label={t.backButton}
        onPress={flow.close}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  status: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  noticeText: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    color: colors.ink,
    padding: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
});
