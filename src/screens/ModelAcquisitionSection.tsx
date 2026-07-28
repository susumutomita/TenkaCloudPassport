import { StyleSheet, Text, View } from 'react-native';
import type { Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { resolveModelAcquisitionViewState } from '../app/model-acquisition-view';
import type { LocalModelManagementView } from '../app/use-local-model-management';
import ActionButton from '../components/ActionButton';
import Card from '../components/Card';
import type { TrustedModelSource } from '../local-agent/trusted-model-catalog';
import { spacing } from '../ui/theme';
import { modelCardOverride, modelCardStyles } from './model-card-styles';

/**
 * Issue 180: Settings（`SettingsScreen.tsx`）と会話エージェント画面
 * （`ConversationAgentScreen.tsx`）が共有する、信頼済み Model（Qwen）取得 UI。
 * ADR-0043 が確立した「Settings から有効化・進捗・削除へ到達できる」契約
 * （consent → downloading → finalizing → verifying → active/imported-not-active、
 * および busy/error/cautionAssessment/pendingProviderOperation の全カード）を
 * そのまま JSX で複製すると jscpd（`minTokens: 50` / `minLines: 5`）に抵触するため、
 * 「未取得」状態の文言（`notAcquiredCopy`）だけを呼び出し側から受け取り、残りの
 * 状態機械は 1 か所に集約する。状態分岐そのものは実行テスト可能な純関数
 * `resolveModelAcquisitionViewState`（`model-acquisition-view.ts`）に委譲する。
 * カード系スタイルは `SettingsScreen.tsx` の `DataErasureSection` とも共有する
 * ため `model-card-styles.ts` から import する（重複した StyleSheet 定義を作らない）。
 * カードの外枠自体は `../components/Card.tsx`（Issue 72 D で抽出済みの既存
 * プリミティブ）をそのまま使い、`modelCardOverride` で背景・枠線色・gap だけを
 * 上書きする（`/simplify` 指摘: 角丸・枠線幅・padding を再定義しない）。
 *
 * caution / pendingProviderOperation カードを省略しないのが重要な設計判断: この
 * Component を会話エージェント画面が呼ぶ以上、そこから開始した DL が Resource
 * Risk や競合操作で止まっても、対応する確認・キャンセル導線が必ず出る
 * （省略すると Issue 180 が解消しようとしている「サイレント無反応」を
 * この PR 自身が作ってしまう）。
 */
export function readableBytes(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KiB`;
  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

/**
 * 呼び出し画面ごとの「未取得」文言。3 つは常に揃って渡される 1 セットのため
 * （`/simplify` 指摘）、独立した 3 props ではなく 1 つの object にまとめる。
 * `description` は `source` を受け取れるため、Settings は displayName・容量を
 * 埋め込んだ既存文言をそのまま使い続けられる。
 */
export interface ModelAcquisitionNotAcquiredCopy {
  readonly description: (source: TrustedModelSource) => string;
  readonly buttonLabel: string;
  readonly buttonHint: string;
}

export interface ModelAcquisitionSectionProps {
  readonly modelManagement: LocalModelManagementView;
  readonly locale: Locale;
  readonly notAcquiredCopy: ModelAcquisitionNotAcquiredCopy;
}

function DownloadingCard({
  modelManagement,
  source,
  t,
}: {
  readonly modelManagement: LocalModelManagementView;
  readonly source: TrustedModelSource;
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
      <Text accessibilityLiveRegion="polite" style={modelCardStyles.body}>
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

export default function ModelAcquisitionSection({
  modelManagement,
  locale,
  notAcquiredCopy,
}: ModelAcquisitionSectionProps) {
  const t = MESSAGES[locale].settings;
  const source = modelManagement.trustedModelSource;
  if (!source) return null;
  const view = resolveModelAcquisitionViewState({
    onDeviceAiFlow: modelManagement.onDeviceAiFlow,
    onDeviceAiStatus: modelManagement.onDeviceAiStatus,
  });

  return (
    <View style={styles.modelSection}>
      {modelManagement.busy ? (
        <Text accessibilityLiveRegion="polite" style={modelCardStyles.body}>
          {t.modelBusy}
        </Text>
      ) : null}
      {modelManagement.errorCode ? (
        <Text accessibilityLiveRegion="assertive" style={modelCardStyles.error}>
          {t.modelError(modelManagement.errorCode)}
        </Text>
      ) : null}
      <Card style={modelCardOverride}>
        <Text style={modelCardStyles.modelTitle}>
          {t.onDeviceAiSectionTitle}
        </Text>
        {view.kind === 'downloading' ? (
          <DownloadingCard
            modelManagement={modelManagement}
            source={source}
            t={t}
          />
        ) : null}
        {view.kind === 'finalizing' ? (
          <Text accessibilityLiveRegion="polite" style={modelCardStyles.body}>
            {t.onDeviceAiFinalizingStatus}
          </Text>
        ) : null}
        {view.kind === 'verifying' ? (
          <Text accessibilityLiveRegion="polite" style={modelCardStyles.body}>
            {t.onDeviceAiVerifyingStatus}
          </Text>
        ) : null}
        {view.kind === 'consent-pending' ? (
          <>
            <Text style={modelCardStyles.modelTitle}>
              {t.onDeviceAiConsentTitle}
            </Text>
            <Text style={modelCardStyles.body}>
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
        {view.kind === 'not-acquired' ? (
          <>
            <Text style={modelCardStyles.body}>
              {notAcquiredCopy.description(source)}
            </Text>
            <ActionButton
              accessibilityHint={notAcquiredCopy.buttonHint}
              disabled={
                modelManagement.busy ||
                modelManagement.candidateSelectionBlocked
              }
              label={notAcquiredCopy.buttonLabel}
              onPress={modelManagement.requestEnableOnDeviceAi}
            />
          </>
        ) : null}
        {view.kind === 'acquired' ? (
          <>
            <Text style={modelCardStyles.body}>
              {view.active
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
      </Card>
      {modelManagement.cautionAssessment ? (
        <Card style={modelCardOverride}>
          <Text style={modelCardStyles.modelTitle}>{t.cautionTitle}</Text>
          <Text style={modelCardStyles.body}>{t.cautionDescription}</Text>
          <ActionButton
            disabled={modelManagement.busy}
            label={t.confirmCautionButton}
            onPress={modelManagement.confirmCautionActivation}
            variant="danger"
          />
        </Card>
      ) : null}
      {modelManagement.pendingProviderOperation ? (
        <Card style={modelCardOverride}>
          <Text style={modelCardStyles.modelTitle}>
            {t.providerOperationTitle}
          </Text>
          <Text style={modelCardStyles.body}>
            {t.providerOperationDescription}
          </Text>
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
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modelSection: {
    gap: spacing.md,
  },
});
