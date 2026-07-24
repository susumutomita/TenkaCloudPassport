import { StyleSheet, Text, View } from 'react-native';
import type { DiagnosticErrorSignal } from '../app/diagnostic-recovery';
import { diagnosticRecovery } from '../app/diagnostic-recovery';
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
import { colors, spacing } from '../ui/theme';

interface SettingsScreenProps {
  readonly locale?: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
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
  /**
   * Issue 138（実機 blocker B）: 診断画面（開発者向け Preview・Share・個別削除）は
   * 消費者ビルドから完全に除去する一方、消費者にも「全データ削除」だけは簡潔な
   * 導線として残す。既存の `useLocalDiagnosticsFlow`（`LocalDiagnosticsScreen` が
   * 使うのと同じ Instance）の erasure 経路をそのまま再利用し、新しい削除ロジックは
   * 作らない。
   */
  readonly dataErasure: SettingsDataErasureProps;
}

export interface SettingsDataErasureProps {
  readonly busy: boolean;
  /**
   * code-reviewer 指摘（high）: `useLocalDiagnosticsFlow` の `retryRecovery`
   * （= `refresh`）は `recoveryRequired` 中、`busy` ではなく `loading` を
   * 立てる（`LocalDiagnosticsScreen.tsx` の retryRecoveryButton も
   * `disabled={loading || busy}` で両方を見ている）。ここでも同じ 2 つの
   * flag を見ないと、再試行中に連打できてしまう。
   */
  readonly loading: boolean;
  readonly recoveryRequired: boolean;
  readonly error: DiagnosticErrorSignal | null;
  readonly deleteAllConfirmationRequested: boolean;
  readonly requestDeleteAll: () => void;
  readonly cancelDeleteAll: () => void;
  readonly confirmDeleteAll: () => Promise<void>;
  /** `recoveryRequired` のときの再試行。`useLocalDiagnosticsFlow` の `refresh` が同じ役割を持つ。 */
  readonly retryRecovery: () => Promise<void>;
}

function readableBytes(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KiB`;
  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
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
 * Issue 138（実機 blocker B）: 消費者ビルドに残す唯一の Local Model 導線。生の
 * GGUF 選択・Model 一覧は開発者向けとして完全に除去したため、容量を空けたい
 * 場合の削除もここ（`onDeviceAiRemoveButton` -> `removeOnDeviceAiModel`）で担保する。
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
 * Issue 138（実機 blocker B、owner 実機 TestFlight フィードバック）: 生の GGUF
 * 選択（`selectModelButton`）・Model 一覧（`LocalModelCard`）・import candidate
 * カードは開発者向けデバッグ UI であり、消費者ビルドで露出していた。「開発者向け
 * ツールを消費者に見せない」方針のもと、`__DEV__` ゲートではなく全ビルドから
 * 完全に除去する（owner がシミュレーターで clean になったことを確認できるように
 * する）。`OnDeviceAiSection`・busy/error 表示・`cautionAssessment` 確認カード・
 * `pendingProviderOperation` 確認カードは、Qwen 有効化フロー（消費者が使う唯一の
 * Local Model 導線）と共有する機構のため維持する。
 */
function ModelManagementSection({
  modelManagement,
  t,
}: ModelManagementSectionProps) {
  return (
    <View style={styles.modelSection}>
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

interface DataErasureSectionProps {
  readonly dataErasure: SettingsDataErasureProps;
  readonly locale: Locale;
  readonly t: (typeof MESSAGES)[Locale]['settings'];
}

/**
 * Issue 138（実機 blocker B）: 消費者向けの簡潔な「全データ削除」導線。診断画面
 * 全体（JSON Preview・Share・Lounge 個別終了等）は開発者向けとして除去したが、
 * 削除だけは消費者にも必要な操作のため、既存 `useLocalDiagnosticsFlow` の
 * erasure 経路（`requestDeleteAll` / `confirmDeleteAll` / `cancelDeleteAll`）を
 * そのまま再利用する。`recoveryRequired`（前回の削除が完了しなかった状態）も
 * 診断画面と同じ Instance を共有するため、消費者導線だけが唯一の到達経路に
 * なった今、ここで再試行できるようにする。
 */
function DataErasureSection({
  dataErasure,
  locale,
  t,
}: DataErasureSectionProps) {
  if (dataErasure.recoveryRequired) {
    const recovery = dataErasure.error
      ? diagnosticRecovery(dataErasure.error.code, locale)
      : null;
    return (
      <View style={styles.modelCard}>
        <Text accessibilityRole="alert" style={styles.modelTitle}>
          {t.eraseAllDataRecoveryTitle}
        </Text>
        {recovery ? <Text style={styles.body}>{recovery.title}</Text> : null}
        <ActionButton
          disabled={dataErasure.busy || dataErasure.loading}
          label={t.eraseAllDataRetryButton}
          onPress={() => void dataErasure.retryRecovery()}
          variant="danger"
        />
      </View>
    );
  }
  if (dataErasure.deleteAllConfirmationRequested) {
    return (
      <View style={styles.modelCard}>
        <Text style={styles.body}>{t.eraseAllDataConfirmDescription}</Text>
        {dataErasure.error ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {diagnosticRecovery(dataErasure.error.code, locale).title}
          </Text>
        ) : null}
        <ActionButton
          disabled={dataErasure.busy}
          label={t.eraseAllDataConfirmButton}
          onPress={() => void dataErasure.confirmDeleteAll()}
          variant="danger"
        />
        <ActionButton
          disabled={dataErasure.busy}
          label={t.eraseAllDataCancelButton}
          onPress={dataErasure.cancelDeleteAll}
          variant="secondary"
        />
      </View>
    );
  }
  return (
    <ActionButton
      accessibilityHint={t.eraseAllDataButtonHint}
      disabled={dataErasure.busy}
      label={t.eraseAllDataButton}
      onPress={dataErasure.requestDeleteAll}
      variant="danger"
    />
  );
}

/**
 * Issue 15: 表示言語を切り替える最小の Settings 画面。`onChangeLocale` は `PassportApp.tsx`
 * が保持する `locale` state だけを更新し、進行中の Lounge / Room / Pet Interaction /
 * 保存済み Local Profile のいずれにも触れない（`docs/design/i18n-and-accessibility.md`
 * の設計判断 1）。
 *
 * Issue 138（実機 blocker A、過剰 disable の是正 / code-reviewer 指摘）: クイズ・
 * 会話 Agent・戻るは `modelManagement.busy`（Local Model 操作中）では
 * disabled にしない（モデル DL 中でも他の消費者操作はできるべき、DL 完了後
 * フリーズの再発防止）。一方 `dataErasure.busy`（全データ削除の確定処理中）は
 * 別軸の flag として、これら 3 ボタンを短時間だけ disabled にする。全データ削除は
 * `resetAllLocalMemory` を介して Quiz 進捗・Passport 等の in-memory state を
 * 無条件に消去し `stage` を巻き戻すため、削除確定中に別画面へ移動できてしまうと
 * 予期しないタイミングで現在位置が上書きされる（`LocalDiagnosticsScreen.tsx` が
 * 自身の戻るボタンを同じ理由で busy 中 disabled にしているのと同じ配慮）。
 */
export default function SettingsScreen({
  locale = DEFAULT_LOCALE,
  onChangeLocale,
  onOpenQuiz,
  onOpenConversationAgent,
  hasIntroCard,
  onBack,
  modelManagement,
  dataErasure,
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
        accessibilityHint={t.quizButtonHint}
        disabled={dataErasure.busy}
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
        disabled={dataErasure.busy || !hasIntroCard}
        label={t.conversationAgentButton}
        onPress={onOpenConversationAgent}
        variant="secondary"
      />
      <DataErasureSection dataErasure={dataErasure} locale={locale} t={t} />
      <ActionButton
        disabled={dataErasure.busy}
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
