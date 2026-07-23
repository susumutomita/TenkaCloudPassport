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
  readonly onOpenDiagnostics: () => void;
  readonly onOpenPilotMeasurement: () => void;
  /** Issue 110: クラウド基礎クイズ画面（`QuizScreen.tsx`）を開く。 */
  readonly onOpenQuiz: () => void;
  /** Issue 104 / ADR-0036: 端末内会話エージェント画面を開く。 */
  readonly onOpenConversationAgent: () => void;
  /**
   * major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カードが未作成の
   * ときは会話エージェントの入口を disabled にし、理由を案内する
   * （session が作れず intake 導線が no-op になる画面を開かせない）。
   */
  readonly hasIntroCard: boolean;
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

interface LocalModelCandidateCardProps {
  readonly candidate: NonNullable<LocalModelManagementView['candidate']>;
  readonly availableStorageBytes: number | null;
  readonly busy: boolean;
  readonly importInProgress: boolean;
  readonly t: (typeof MESSAGES)[Locale]['settings'];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onCancelRunning: () => void;
}

function LocalModelCandidateCard({
  candidate,
  availableStorageBytes,
  busy,
  importInProgress,
  t,
  onConfirm,
  onCancel,
  onCancelRunning,
}: LocalModelCandidateCardProps) {
  return (
    <View style={styles.modelCard}>
      <Text style={styles.modelTitle}>
        {t.candidateSummary(candidate.name, readableBytes(candidate.sizeBytes))}
      </Text>
      {availableStorageBytes !== null ? (
        <Text style={styles.body}>
          {t.candidateAvailableStorage(readableBytes(availableStorageBytes))}
        </Text>
      ) : null}
      <Text style={styles.body}>{t.candidateWarning}</Text>
      {importInProgress ? (
        <ActionButton
          label={t.cancelRunningImportButton}
          onPress={onCancelRunning}
          variant="danger"
        />
      ) : (
        <>
          <ActionButton
            disabled={busy}
            label={t.confirmImportButton}
            onPress={onConfirm}
          />
          <ActionButton
            disabled={busy}
            label={t.cancelImportButton}
            onPress={onCancel}
            variant="secondary"
          />
        </>
      )}
    </View>
  );
}

interface OnDeviceAiSectionProps {
  readonly modelManagement: LocalModelManagementView;
  readonly t: (typeof MESSAGES)[Locale]['settings'];
}

/** ダウンロード中の進捗表示 + 中止導線だけを切り出した子 Component。 */
function OnDeviceAiDownloadingCard({
  modelManagement,
  source,
  t,
}: {
  readonly modelManagement: LocalModelManagementView;
  readonly source: NonNullable<LocalModelManagementView['trustedModelSource']>;
  readonly t: (typeof MESSAGES)[Locale]['settings'];
}) {
  const progress = modelManagement.onDeviceAiDownloadProgress;
  const percent =
    source.sizeBytes > 0
      ? Math.min(
          100,
          Math.round(((progress?.bytesWritten ?? 0) / source.sizeBytes) * 100)
        )
      : 0;
  return (
    <>
      <Text accessibilityLiveRegion="polite" style={styles.body}>
        {t.onDeviceAiDownloadStatus(
          readableBytes(progress?.bytesWritten ?? 0),
          readableBytes(source.sizeBytes),
          percent
        )}
      </Text>
      <ActionButton
        label={t.onDeviceAiDownloadCancelButton}
        onPress={modelManagement.cancelOnDeviceAiDownload}
        variant="danger"
      />
    </>
  );
}

/**
 * Follow-up F-FDRGS4: Document Picker を知らない通常ユーザー向けの、
 * Qwen2.5-1.5B 信頼済みダウンロードの単一導線。状態（未取得 / 同意待ち /
 * ダウンロード中 / 仕上げ処理中 / 取得済み）は新しい state を持たず、既存
 * Manifest から導出した `onDeviceAiStatus` と、Hook 側の単一 tag
 * `onDeviceAiFlow`（code-reviewer 指摘・simplify: 「同意待ち」「ダウンロード中」を
 * 独立した 2 boolean にすると二重否定の分岐が必要になっていた）だけで出し分ける。
 * caution/blocked の詳細は下の `LocalModelCard` がそのまま表示する。
 */
function OnDeviceAiSection({ modelManagement, t }: OnDeviceAiSectionProps) {
  const source = modelManagement.trustedModelSource;
  if (!source) return null;
  const { onDeviceAiFlow, onDeviceAiStatus } = modelManagement;

  return (
    <View style={styles.modelCard}>
      <Text style={styles.modelTitle}>{t.onDeviceAiSectionTitle}</Text>
      {onDeviceAiFlow === 'downloading' ? (
        <OnDeviceAiDownloadingCard
          modelManagement={modelManagement}
          source={source}
          t={t}
        />
      ) : null}
      {onDeviceAiFlow === 'finalizing' ? (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {t.onDeviceAiFinalizingStatus}
        </Text>
      ) : null}
      {onDeviceAiFlow === 'consent-pending' ? (
        <>
          <Text style={styles.modelTitle}>{t.onDeviceAiConsentTitle}</Text>
          <Text style={styles.body}>
            {t.onDeviceAiConsentBody(
              source.displayName,
              readableBytes(source.sizeBytes),
              source.license
            )}
          </Text>
          <ActionButton
            disabled={modelManagement.busy}
            label={t.onDeviceAiConsentStartButton}
            onPress={modelManagement.confirmEnableOnDeviceAiConsent}
          />
          <ActionButton
            disabled={modelManagement.busy}
            label={t.onDeviceAiConsentCancelButton}
            onPress={modelManagement.cancelEnableOnDeviceAiConsent}
            variant="secondary"
          />
        </>
      ) : null}
      {onDeviceAiFlow === 'idle' && onDeviceAiStatus === 'not-acquired' ? (
        <>
          <Text style={styles.body}>
            {t.onDeviceAiDescription(
              source.displayName,
              readableBytes(source.sizeBytes)
            )}
          </Text>
          <ActionButton
            accessibilityHint={t.onDeviceAiEnableButtonHint}
            disabled={
              modelManagement.busy || modelManagement.candidateSelectionBlocked
            }
            label={t.onDeviceAiEnableButton}
            onPress={modelManagement.requestEnableOnDeviceAi}
          />
        </>
      ) : null}
      {onDeviceAiFlow === 'idle' &&
      onDeviceAiStatus &&
      onDeviceAiStatus !== 'not-acquired' ? (
        <>
          <Text style={styles.body}>
            {onDeviceAiStatus === 'active'
              ? t.onDeviceAiActiveStatus
              : t.onDeviceAiImportedNotActiveStatus}
          </Text>
          <ActionButton
            disabled={modelManagement.busy}
            label={t.onDeviceAiRemoveButton}
            onPress={modelManagement.removeOnDeviceAiModel}
            variant="danger"
          />
        </>
      ) : null}
    </View>
  );
}

interface ModelManagementSectionProps {
  readonly modelManagement: LocalModelManagementView;
  readonly t: (typeof MESSAGES)[Locale]['settings'];
}

/**
 * Issue 110 の code-reviewer 指摘（Cognitive Complexity 上限超過）: `SettingsScreen`
 * 本体に導線ボタンを 1 つ足しただけで上限（15）を超えたため、既に肥大化していた
 * Local Model 管理セクション（複数の条件付き表示を含む）を、`LocalModelCard` /
 * `LocalModelCandidateCard` と同じ「子 Component へ切り出す」方針でここへ抽出する。
 * 呼び出し側は `modelManagement?.available` の真偽だけで出し分ける。
 */
function ModelManagementSection({
  modelManagement,
  t,
}: ModelManagementSectionProps) {
  return (
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
      <OnDeviceAiSection modelManagement={modelManagement} t={t} />
      <ActionButton
        accessibilityHint={t.selectModelHint}
        disabled={
          modelManagement.busy || modelManagement.candidateSelectionBlocked
        }
        label={t.selectModelButton}
        onPress={modelManagement.selectCandidate}
        variant="secondary"
      />
      {modelManagement.candidate ? (
        <LocalModelCandidateCard
          availableStorageBytes={modelManagement.candidateAvailableStorageBytes}
          busy={modelManagement.busy}
          candidate={modelManagement.candidate}
          importInProgress={modelManagement.importInProgress}
          onCancel={modelManagement.cancelCandidate}
          onCancelRunning={modelManagement.cancelImport}
          onConfirm={modelManagement.confirmImport}
          t={t}
        />
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
  onOpenDiagnostics,
  onOpenPilotMeasurement,
  onOpenQuiz,
  onOpenConversationAgent,
  hasIntroCard,
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
        <ModelManagementSection modelManagement={modelManagement} t={t} />
      ) : null}
      <ActionButton
        accessibilityHint={t.diagnosticsButtonHint}
        disabled={modelManagement?.busy ?? false}
        label={t.diagnosticsButton}
        onPress={onOpenDiagnostics}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.pilotMeasurementButtonHint}
        disabled={modelManagement?.busy ?? false}
        label={t.pilotMeasurementButton}
        onPress={onOpenPilotMeasurement}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.quizButtonHint}
        disabled={modelManagement?.busy ?? false}
        label={t.quizButton}
        onPress={onOpenQuiz}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={
          hasIntroCard
            ? t.conversationAgentButtonHint
            : t.conversationAgentButtonDisabledHint
        }
        disabled={(modelManagement?.busy ?? false) || !hasIntroCard}
        label={t.conversationAgentButton}
        onPress={onOpenConversationAgent}
        variant="secondary"
      />
      <ActionButton
        disabled={modelManagement?.busy ?? false}
        label={t.backButton}
        onPress={onBack}
        variant="secondary"
      />
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
