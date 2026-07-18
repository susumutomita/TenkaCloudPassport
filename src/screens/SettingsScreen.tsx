import { StyleSheet, Text, View } from 'react-native';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
} from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { LocalModelManagementView } from '../app/use-local-model-management';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import type {
  ImportedLocalModel,
  LocalModelBenchmarkReport,
  ModelResourceRiskReason,
} from '../local-agent/local-model-manifest';
import { colors, spacing } from '../ui/theme';

interface SettingsScreenProps {
  readonly locale?: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
  readonly onBack: () => void;
  readonly modelManagement?: LocalModelManagementView;
}

function readableBytes(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KiB`;
  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function riskLabel(
  model: ImportedLocalModel,
  t: (typeof MESSAGES)[Locale]['settings']
): string {
  if (model.risk.level === 'supported') return t.riskSupported;
  if (model.risk.level === 'caution') return t.riskCaution;
  return t.riskBlocked;
}

function riskReasonLabel(
  reason: ModelResourceRiskReason,
  t: (typeof MESSAGES)[Locale]['settings']
): string {
  if (reason === 'memory-ratio-supported') return t.riskReasonSupported;
  if (reason === 'memory-ratio-caution') return t.riskReasonCaution;
  if (reason === 'memory-ratio-blocked') return t.riskReasonBlocked;
  if (reason === 'thermal-pressure') return t.riskReasonThermal;
  return t.riskReasonMemoryUnavailable;
}

function riskBasis(
  model: ImportedLocalModel,
  t: (typeof MESSAGES)[Locale]['settings']
): string {
  return t.riskBasis(
    readableBytes(model.risk.estimatedWorkingSetBytes),
    model.risk.effectiveMemoryBytes === null
      ? t.riskMemoryUnavailable
      : readableBytes(model.risk.effectiveMemoryBytes),
    model.risk.ratioPermille === null
      ? t.riskMemoryUnavailable
      : `${(model.risk.ratioPermille / 10).toFixed(1)}%`,
    model.risk.reasons.map((reason) => riskReasonLabel(reason, t)).join(' / ')
  );
}

function latestMatchingReport(
  reports: readonly LocalModelBenchmarkReport[],
  matches: (report: LocalModelBenchmarkReport) => boolean
): LocalModelBenchmarkReport | null {
  for (let index = reports.length - 1; index >= 0; index -= 1) {
    const report = reports[index];
    if (report && matches(report)) return report;
  }
  return null;
}

interface LocalModelCardProps {
  readonly model: ImportedLocalModel;
  readonly reports: readonly LocalModelBenchmarkReport[];
  readonly active: boolean;
  readonly busy: boolean;
  readonly t: (typeof MESSAGES)[Locale]['settings'];
  readonly onActivate: (sha256: string) => void;
  readonly onUnload: () => void;
  readonly onDelete: (sha256: string) => void;
}

function LocalModelCard({
  model,
  reports,
  active,
  busy,
  t,
  onActivate,
  onUnload,
  onDelete,
}: LocalModelCardProps) {
  const latestImport = latestMatchingReport(
    reports,
    (report) => report.importDurationMs !== null
  );
  const latestExecution = latestMatchingReport(
    reports,
    (report) => report.importDurationMs === null
  );
  const latestResource = latestExecution ?? latestImport;
  return (
    <View style={styles.modelCard}>
      <Text style={styles.modelTitle}>
        {t.importedModelSummary(
          model.originalFileName,
          readableBytes(model.sizeBytes),
          model.metadata.architecture,
          riskLabel(model, t),
          active
        )}
      </Text>
      <Text style={styles.body}>{riskBasis(model, t)}</Text>
      {model.risk.level === 'blocked' ? (
        <Text style={styles.error}>{t.blockedDescription}</Text>
      ) : null}
      {latestResource ? (
        <Text style={styles.body}>
          {t.benchmarkSummary(
            reports.length,
            latestImport?.importDurationMs ?? null,
            latestExecution?.loadDurationMs ?? null,
            latestExecution?.firstTokenDurationMs ?? null,
            latestExecution?.completionDurationMs ?? null,
            latestResource.peakProcessMemoryBytes === null
              ? t.riskMemoryUnavailable
              : readableBytes(latestResource.peakProcessMemoryBytes),
            latestResource.thermalStateBefore,
            latestResource.thermalStateAfter,
            latestResource.batteryDeltaPermille,
            latestResource.outcome
          )}
        </Text>
      ) : null}
      {!active ? (
        <ActionButton
          disabled={busy}
          label={
            model.risk.level === 'blocked'
              ? t.reassessBlockedModelButton
              : t.activateModelButton
          }
          onPress={() => onActivate(model.sha256)}
        />
      ) : (
        <ActionButton
          disabled={busy}
          label={t.unloadModelButton}
          onPress={onUnload}
          variant="secondary"
        />
      )}
      <ActionButton
        disabled={busy}
        label={t.deleteModelButton}
        onPress={() => onDelete(model.sha256)}
        variant="danger"
      />
    </View>
  );
}

/**
 * Issue 15: 表示言語を切り替える最小の Settings 画面。`onChangeLocale` は `PassportApp.tsx`
 * が保持する `locale` state だけを更新し、進行中の Lounge / Room / Pet Interaction /
 * 保存済み Local Profile のいずれにも触れない（`docs/design/i18n-and-accessibility.md`
 * の設計判断 1）。
 */
export default function SettingsScreen({
  locale = DEFAULT_LOCALE,
  onChangeLocale,
  onBack,
  modelManagement,
}: SettingsScreenProps) {
  const t = MESSAGES[locale].settings;
  return (
    <AppScreen description={t.description} eyebrow="Settings" title={t.title}>
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
      {modelManagement?.available ? (
        <View style={styles.modelSection}>
          <Text style={styles.sectionTitle}>{t.modelSectionTitle}</Text>
          <Text style={styles.body}>{t.modelDescription}</Text>
          {modelManagement.busy ? (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {t.modelBusy}
            </Text>
          ) : null}
          {modelManagement.errorCode ? (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {t.modelError(modelManagement.errorCode)}
            </Text>
          ) : null}
          <ActionButton
            accessibilityHint={t.selectModelHint}
            disabled={modelManagement.busy}
            label={t.selectModelButton}
            onPress={modelManagement.selectCandidate}
            variant="secondary"
          />
          {modelManagement.candidate ? (
            <View style={styles.modelCard}>
              <Text style={styles.modelTitle}>
                {t.candidateSummary(
                  modelManagement.candidate.name,
                  readableBytes(modelManagement.candidate.sizeBytes)
                )}
              </Text>
              <Text style={styles.body}>{t.candidateWarning}</Text>
              {modelManagement.importInProgress ? (
                <ActionButton
                  label={t.cancelRunningImportButton}
                  onPress={modelManagement.cancelImport}
                  variant="danger"
                />
              ) : (
                <>
                  <ActionButton
                    disabled={modelManagement.busy}
                    label={t.confirmImportButton}
                    onPress={modelManagement.confirmImport}
                  />
                  <ActionButton
                    disabled={modelManagement.busy}
                    label={t.cancelImportButton}
                    onPress={modelManagement.cancelCandidate}
                    variant="secondary"
                  />
                </>
              )}
            </View>
          ) : null}
          {modelManagement.manifest?.models.map((model) => {
            const active =
              model.sha256 === modelManagement.manifest?.activeModelSha256;
            const reports =
              modelManagement.manifest?.benchmarkReports.filter(
                (report) => report.modelSha256 === model.sha256
              ) ?? [];
            return (
              <LocalModelCard
                active={active}
                busy={modelManagement.busy}
                key={model.sha256}
                model={model}
                onActivate={modelManagement.activate}
                onDelete={modelManagement.deleteModel}
                onUnload={modelManagement.unload}
                reports={reports}
                t={t}
              />
            );
          })}
          {modelManagement.cautionAssessment ? (
            <View style={styles.modelCard}>
              <Text style={styles.modelTitle}>{t.cautionTitle}</Text>
              <Text style={styles.body}>{t.cautionDescription}</Text>
              <ActionButton
                disabled={modelManagement.busy}
                label={t.confirmCautionButton}
                onPress={modelManagement.confirmCautionActivation}
                variant="danger"
              />
            </View>
          ) : null}
          {modelManagement.pendingProviderOperation ? (
            <View style={styles.modelCard}>
              <Text style={styles.modelTitle}>{t.providerOperationTitle}</Text>
              <Text style={styles.body}>{t.providerOperationDescription}</Text>
              <ActionButton
                disabled={modelManagement.busy}
                label={t.confirmProviderOperationButton}
                onPress={modelManagement.confirmProviderOperation}
                variant="danger"
              />
              <ActionButton
                disabled={modelManagement.busy}
                label={t.cancelProviderOperationButton}
                onPress={modelManagement.cancelProviderOperation}
                variant="secondary"
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  options: {
    gap: spacing.sm,
  },
  modelSection: {
    gap: spacing.md,
  },
  modelCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  modelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
  },
});
