import { StyleSheet, Text, View } from 'react-native';
import { diagnosticRecovery } from '../app/diagnostic-recovery';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type {
  DiagnosticNoticeKind,
  LocalDiagnosticsFlow,
} from '../app/use-local-diagnostics-flow';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import JsonPreviewCard from '../components/JsonPreviewCard';
import ScreenCard from '../components/ScreenCard';
import { colors, spacing } from '../ui/theme';

interface LocalDiagnosticsScreenProps {
  readonly flow: LocalDiagnosticsFlow;
  readonly hasLounge: boolean;
  readonly hasProfile: boolean;
  readonly locale?: Locale;
}

interface DiagnosticSectionProps {
  readonly flow: LocalDiagnosticsFlow;
  readonly locale: Locale;
  readonly totalCount: number;
}

function localDataTotal(
  flow: LocalDiagnosticsFlow,
  hasLounge: boolean
): number {
  const preview = flow.localDataPreview;
  const storedCount = preview
    ? preview.profileCount +
      preview.settingsCount +
      preview.backupCacheCount +
      preview.modelCount
    : 0;
  return storedCount + (hasLounge ? 1 : 0);
}

function diagnosticNoticeText(
  notice: DiagnosticNoticeKind | null,
  locale: Locale
): string | null {
  if (!notice) return null;
  const t = MESSAGES[locale].diagnostics.notice;
  return {
    shared: t.shared,
    dismissed: t.dismissed,
    saved: t.saved,
    'lounge-forgotten': t.loungeForgotten,
    'passport-reset': t.passportReset,
    'model-removed': t.modelRemoved,
    'all-deleted': t.allDeleted,
  }[notice];
}

function DiagnosticSections({
  flow,
  locale,
  totalCount,
}: DiagnosticSectionProps) {
  const t = MESSAGES[locale].diagnostics;
  const { loading, error, diagnosticPreview, localDataPreview } = flow;
  const recovery = error ? diagnosticRecovery(error.code, locale) : null;
  const noticeText = diagnosticNoticeText(flow.notice, locale);
  return (
    <>
      {loading ? <Text style={styles.status}>{t.loading}</Text> : null}
      {error && recovery ? (
        <View accessibilityLiveRegion="polite" style={styles.error}>
          <Text
            style={styles.sectionTitle}
          >{`${error.code} / ${error.phase}`}</Text>
          <Text style={styles.body}>{recovery.title}</Text>
          {recovery.steps.map((step) => (
            <Text key={step} style={styles.body}>{`• ${step}`}</Text>
          ))}
        </View>
      ) : null}
      {!loading && !error && !diagnosticPreview ? (
        <Text style={styles.status}>{t.empty}</Text>
      ) : null}
      {diagnosticPreview ? (
        <JsonPreviewCard
          byteLengthLabel={t.byteLength(diagnosticPreview.byteLength)}
          items={diagnosticPreview.items}
          json={diagnosticPreview.json}
          title={t.reportSectionTitle}
        />
      ) : null}
      {localDataPreview ? (
        <ScreenCard title={t.storageSectionTitle}>
          <Text style={styles.body}>
            {t.confirmDeleteAllText(totalCount, localDataPreview.totalBytes)}
          </Text>
        </ScreenCard>
      ) : null}
      {noticeText ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {noticeText}
        </Text>
      ) : null}
    </>
  );
}

interface DiagnosticActionsProps extends DiagnosticSectionProps {
  readonly hasLounge: boolean;
  readonly hasProfile: boolean;
}

function DiagnosticActions({
  flow,
  hasLounge,
  hasProfile,
  locale,
  totalCount,
}: DiagnosticActionsProps) {
  const t = MESSAGES[locale].diagnostics;
  const {
    loading,
    diagnosticPreview,
    localDataPreview,
    busy,
    recoveryRequired,
    sharing,
    deleteAllConfirmationRequested,
  } = flow;
  const destructiveActionBlocked = busy || recoveryRequired;
  return (
    <>
      <ActionButton
        disabled={loading || busy}
        label={recoveryRequired ? t.retryRecoveryButton : t.refreshButton}
        onPress={() => void flow.refresh()}
        variant="secondary"
      />
      <ActionButton
        disabled={
          !diagnosticPreview || loading || sharing || destructiveActionBlocked
        }
        label={t.shareButton(sharing)}
        onPress={() => void flow.share()}
      />
      <ActionButton
        {...(!hasLounge ? { accessibilityHint: t.unavailableActionHint } : {})}
        disabled={!hasLounge || destructiveActionBlocked}
        label={t.endLoungeButton}
        onPress={flow.endAndForgetLounge}
        variant="danger"
      />
      <ActionButton
        {...(!hasProfile ? { accessibilityHint: t.unavailableActionHint } : {})}
        disabled={!hasProfile || destructiveActionBlocked}
        label={t.resetPassportButton}
        onPress={() => void flow.resetPassport()}
        variant="danger"
      />
      <ActionButton
        {...(!localDataPreview?.model
          ? { accessibilityHint: t.unavailableActionHint }
          : {})}
        disabled={!localDataPreview?.model || destructiveActionBlocked}
        label={t.removeModelButton}
        onPress={() => void flow.removeModel()}
        variant="danger"
      />
      <ActionButton
        disabled={
          !localDataPreview || totalCount === 0 || destructiveActionBlocked
        }
        label={t.deleteAllButton}
        onPress={flow.requestDeleteAll}
        variant="danger"
      />
      {deleteAllConfirmationRequested && localDataPreview ? (
        <View style={styles.confirmation}>
          <Text style={styles.body}>
            {t.confirmDeleteAllText(totalCount, localDataPreview.totalBytes)}
          </Text>
          <ActionButton
            disabled={destructiveActionBlocked}
            label={t.confirmDeleteAllButton}
            onPress={() => void flow.confirmDeleteAll()}
            variant="danger"
          />
          <ActionButton
            disabled={destructiveActionBlocked}
            label={t.cancelDeleteAllButton}
            onPress={flow.cancelDeleteAll}
            variant="secondary"
          />
        </View>
      ) : null}
    </>
  );
}

export default function LocalDiagnosticsScreen({
  flow,
  hasLounge,
  hasProfile,
  locale = DEFAULT_LOCALE,
}: LocalDiagnosticsScreenProps) {
  const t = MESSAGES[locale].diagnostics;
  const totalCount = localDataTotal(flow, hasLounge);
  return (
    <AppScreen
      description={t.description}
      eyebrow="Diagnostics"
      title={t.title}
    >
      <DiagnosticSections flow={flow} locale={locale} totalCount={totalCount} />
      <DiagnosticActions
        flow={flow}
        hasLounge={hasLounge}
        hasProfile={hasProfile}
        locale={locale}
        totalCount={totalCount}
      />
      <ActionButton
        disabled={flow.busy || flow.recoveryRequired}
        label={t.backButton}
        onPress={flow.close}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  status: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  confirmation: { gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    color: colors.ink,
    padding: spacing.md,
  },
});
