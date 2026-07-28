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
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import Card from '../components/Card';
import { colors, spacing } from '../ui/theme';
import { modelCardOverride, modelCardStyles } from './model-card-styles';

/**
 * ADR-0057 / ADR-0058（Follow-up F-056000）: Apple Intelligence 一本化に伴い、
 * Qwen（GGUF ダウンロード型・`llama.rn`）の消費者向け UI（有効化・DL 進捗・
 * 削除・メモリ注意、旧 `ModelAcquisitionSection` 呼び出し）を Settings から
 * 撤去した。Apple Intelligence は OS 内蔵でダウンロード導線自体が無く、対応可否は
 * 起動時の Availability Gate（`native-agent-model-provider-composition.ts`）が
 * 自動判定するため、消費者が明示的に有効化する UI は不要になった。実装
 * （`use-local-model-management.ts` / `trusted-model-download.ts` /
 * `ModelAcquisitionSection.tsx` 等）は再導入口として残し、削除しない
 * （配線からのみ切断する）。
 */
interface SettingsScreenProps {
  readonly locale?: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
  /** Issue 104 / ADR-0036: 端末内会話エージェント画面を開く。 */
  readonly onOpenConversationAgent: () => void;
  /**
   * major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カードが未作成の
   * ときは会話エージェントの入口を disabled にし、理由を案内する
   * （session が作れず intake 導線が no-op になる画面を開かせない）。
   */
  readonly hasIntroCard: boolean;
  readonly onBack: () => void;
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
      <Card style={modelCardOverride}>
        <Text accessibilityRole="alert" style={modelCardStyles.modelTitle}>
          {t.eraseAllDataRecoveryTitle}
        </Text>
        {recovery ? (
          <Text style={modelCardStyles.body}>{recovery.title}</Text>
        ) : null}
        <ActionButton
          disabled={dataErasure.busy || dataErasure.loading}
          label={t.eraseAllDataRetryButton}
          onPress={() => void dataErasure.retryRecovery()}
          variant="danger"
        />
      </Card>
    );
  }
  if (dataErasure.deleteAllConfirmationRequested) {
    return (
      <Card style={modelCardOverride}>
        <Text style={modelCardStyles.body}>
          {t.eraseAllDataConfirmDescription}
        </Text>
        {dataErasure.error ? (
          <Text
            accessibilityLiveRegion="assertive"
            style={modelCardStyles.error}
          >
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
      </Card>
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
 * Issue 138（実機 blocker A、過剰 disable の是正 / code-reviewer 指摘）: 会話
 * Agent・戻るは `dataErasure.busy`（全データ削除の確定処理中）だけを disabled
 * 条件にする。全データ削除は `resetAllLocalMemory` を介して Passport 等の
 * in-memory state を無条件に消去し `stage` を巻き戻すため、削除確定中に別画面へ
 * 移動できてしまうと予期しないタイミングで現在位置が上書きされる
 * （`LocalDiagnosticsScreen.tsx` が自身の戻るボタンを同じ理由で busy 中 disabled に
 * しているのと同じ配慮）。v1.0（ADR-0038）: 旧・Local Model 操作中フラグは
 * Settings から Local Model 管理 UI 自体を除去したため参照しない。
 */
export default function SettingsScreen({
  locale = DEFAULT_LOCALE,
  onChangeLocale,
  onOpenConversationAgent,
  hasIntroCard,
  onBack,
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
});
