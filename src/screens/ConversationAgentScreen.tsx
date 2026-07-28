import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ConversationAgentPresentedResultState } from '../app/conversation-agent-flow';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { LocalModelManagementView } from '../app/use-local-model-management';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import SettingsLinkFooter from '../components/SettingsLinkFooter';
import type { ParticipantId } from '../domain/session-identifiers';
import { colors, primaryEmphasisBorder, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';
import ConversationExampleSection from './ConversationExampleSection';
import ModelAcquisitionSection from './ModelAcquisitionSection';

/**
 * Issue 104 / ADR-0036 + ADR-0041: 端末内会話エージェントの画面。相手の
 * 自己紹介ページ URL を QR 再スキャン・手動貼り付け・サンプルカードのいずれかで
 * 取り込み、共通点・最初の質問を表示する。Step B では
 * `MAX_BRIDGE_SELECTION_PARTICIPANTS` までの相手を一覧で保持し、全ペアを
 * 端末内で比較した結果として選ばれた 1 組を相手名とともに提示する。相手カードはこの画面（Screen）と
 * それを保持する `ConversationSession`（`PassportApp.tsx` の state）以外の
 * どこにも渡らず、ディスクへは一切書き込まれない（`docs/adr/0036-on-device-conversation-agent.md`）。
 */

export interface ConversationAgentPeerView {
  readonly participantId: ParticipantId;
  readonly name: string;
}

export interface ConversationAgentScreenProps {
  readonly hasSelfIntroCard: boolean;
  /**
   * Issue 180: provider が Rules フォールバックではなく実際に Local Agent として
   * 動いているか（`useConversationAgentFlow` が公開する `onDeviceAiActive`、
   * Provider Identity から取得した会話例 Generator capability の有無で判定する）。
   * `false`（Rules フォールバック）のときだけ、オンデバイス AI 未取得を明示し、
   * その場から取得フローへ入れる常設ノートを表示する。
   */
  readonly onDeviceAiActive: boolean;
  /** Issue 180: 常設ノートからその場で consent → DL フローへ入るための共有 State。 */
  readonly modelManagement: LocalModelManagementView;
  readonly peers: readonly ConversationAgentPeerView[];
  /** 参加者上限に未達か。`false` のとき取り込み導線を隠し、満席である旨だけを伝える。 */
  readonly canAddPeer: boolean;
  readonly pasteInput: string;
  readonly errorMessage: string | null;
  readonly result: ConversationAgentPresentedResultState;
  readonly locale?: Locale;
  readonly onChangePasteInput: (value: string) => void;
  readonly onSubmitPasteInput: () => void;
  readonly onScanPeer: () => void;
  readonly onUseSampleCard: () => void;
  readonly onRemovePeer: (participantId: ParticipantId) => void;
  readonly onStart: () => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
  readonly onOpenSettings: () => void;
  readonly onChangeLocale: (locale: Locale) => void;
}

function IntakeSection({
  pasteInput,
  errorMessage,
  hasPeers,
  t,
  onChangePasteInput,
  onSubmitPasteInput,
  onScanPeer,
  onUseSampleCard,
}: {
  readonly pasteInput: string;
  readonly errorMessage: string | null;
  /** 既に 1 名以上取り込み済みか。導入文を「未受信」から「さらに追加」へ切り替える。 */
  readonly hasPeers: boolean;
  readonly t: (typeof MESSAGES)[Locale]['conversationAgent'];
  readonly onChangePasteInput: (value: string) => void;
  readonly onSubmitPasteInput: () => void;
  readonly onScanPeer: () => void;
  readonly onUseSampleCard: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.peerSectionTitle}</Text>
      <Text style={styles.hint}>
        {hasPeers ? t.addMorePeerNotice : t.noPeerNotice}
      </Text>
      <ActionButton
        accessibilityHint={t.scanButtonHint}
        label={t.scanButton}
        onPress={onScanPeer}
      />
      <View style={styles.field}>
        <Text style={styles.label}>{t.pasteLabel}</Text>
        <Text style={styles.hint}>{t.pasteHint}</Text>
        <TextInput
          accessibilityLabel={t.pasteLabel}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangePasteInput}
          placeholder={t.pastePlaceholder}
          style={styles.input}
          value={pasteInput}
        />
        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.dangerCaption}>
            {errorMessage}
          </Text>
        ) : null}
        <ActionButton
          accessibilityHint={t.pasteSubmitButtonHint}
          disabled={pasteInput.trim().length === 0}
          label={t.pasteSubmitButton}
          onPress={onSubmitPasteInput}
          variant="secondary"
        />
      </View>
      <ActionButton
        accessibilityHint={t.sampleButtonHint}
        label={t.sampleButton}
        onPress={onUseSampleCard}
        variant="secondary"
      />
    </View>
  );
}

function ResultSection({
  locale,
  result,
  t,
}: {
  readonly locale: Locale;
  readonly result: ConversationAgentPresentedResultState;
  readonly t: (typeof MESSAGES)[Locale]['conversationAgent'];
}) {
  if (result.kind === 'idle') return null;
  if (result.kind === 'running') {
    return (
      <View accessibilityRole="summary" style={styles.notice}>
        <Text style={styles.noticeText}>{t.runningNotice}</Text>
      </View>
    );
  }
  if (result.kind === 'error') {
    return (
      <View accessibilityRole="alert" style={styles.noticeError}>
        <Text style={styles.noticeText}>{result.message}</Text>
      </View>
    );
  }
  if (result.kind === 'no-signal') {
    return (
      <View accessibilityRole="summary" style={styles.notice}>
        <Text style={styles.noticeTitle}>{t.noSignalTitle}</Text>
        <Text style={styles.noticeText}>{t.noSignalMessage}</Text>
      </View>
    );
  }
  return (
    <>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="summary"
        style={styles.notice}
      >
        {result.partnerNames.length > 0 ? (
          <>
            <Text style={styles.noticeTitle}>{t.bridgePartnerTitle}</Text>
            <Text style={styles.noticeText}>
              {result.partnerNames.join(', ')}
            </Text>
          </>
        ) : null}
        <Text style={styles.noticeTitle}>{t.bridgeReasonTitle}</Text>
        <Text style={styles.noticeText}>{result.reason}</Text>
        <Text style={styles.noticeTitle}>{t.bridgeOpenerTitle}</Text>
        <Text style={styles.noticeText}>{result.opener}</Text>
      </View>
      <ConversationExampleSection
        locale={locale}
        peerName={result.partnerNames[0]}
        view={result.conversationExample}
      />
    </>
  );
}

function ParticipantsSection({
  peers,
  t,
  onRemovePeer,
}: {
  readonly peers: readonly ConversationAgentPeerView[];
  readonly t: (typeof MESSAGES)[Locale]['conversationAgent'];
  readonly onRemovePeer: (participantId: ParticipantId) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.participantsSectionTitle}</Text>
      {peers.map((peer) => (
        <View key={peer.participantId} style={styles.peerRow}>
          <Text style={styles.label}>{t.peerLabel(peer.name)}</Text>
          <Pressable
            accessibilityHint={t.removePeerButtonHint}
            accessibilityLabel={t.removePeerButtonLabel(peer.name)}
            accessibilityRole="button"
            onPress={() => onRemovePeer(peer.participantId)}
            style={styles.removeButton}
          >
            <Text style={styles.removeButtonGlyph}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export default function ConversationAgentScreen({
  hasSelfIntroCard,
  onDeviceAiActive,
  modelManagement,
  peers,
  canAddPeer,
  pasteInput,
  errorMessage,
  result,
  locale = DEFAULT_LOCALE,
  onChangePasteInput,
  onSubmitPasteInput,
  onScanPeer,
  onUseSampleCard,
  onRemovePeer,
  onStart,
  onReset,
  onBack,
  onOpenSettings,
  onChangeLocale,
}: ConversationAgentScreenProps) {
  const t = MESSAGES[locale].conversationAgent;
  const hasPeers = peers.length > 0;

  return (
    <AppScreen
      description={t.description}
      eyebrow={t.eyebrow}
      locale={locale}
      onChangeLocale={onChangeLocale}
      title={t.title}
    >
      {hasSelfIntroCard ? null : (
        <View accessibilityRole="alert" style={styles.noticeError}>
          <Text style={styles.noticeText}>{t.selfCardMissingNotice}</Text>
        </View>
      )}
      {hasSelfIntroCard ? (
        <>
          {/*
            Issue 180: provider が Rules フォールバックのとき（`onDeviceAiActive`
            が false のとき）だけ、常設ノートで現在の動作モードとその場のモデル
            取得導線を示す。取得済み・有効化済み（`onDeviceAiActive` が true）に
            なった時点でこのノート自体を mount しない（`ModelAcquisitionSection`
            は Settings と共有する状態機械だが、ここでは「未取得の説明」だけが
            目的のため、有効化後は表示する理由が無い）。
          */}
          {onDeviceAiActive ? null : (
            <ModelAcquisitionSection
              locale={locale}
              modelManagement={modelManagement}
              notAcquiredCopy={{
                buttonHint: t.onDeviceAiNoticeButtonHint,
                buttonLabel: t.onDeviceAiNoticeButton,
                description: () => t.onDeviceAiNoticeBody,
              }}
            />
          )}
          {hasPeers ? (
            <ParticipantsSection
              onRemovePeer={onRemovePeer}
              peers={peers}
              t={t}
            />
          ) : null}
          {canAddPeer ? (
            <IntakeSection
              errorMessage={errorMessage}
              hasPeers={hasPeers}
              onChangePasteInput={onChangePasteInput}
              onScanPeer={onScanPeer}
              onSubmitPasteInput={onSubmitPasteInput}
              onUseSampleCard={onUseSampleCard}
              pasteInput={pasteInput}
              t={t}
            />
          ) : (
            <View accessibilityRole="summary" style={styles.notice}>
              <Text style={styles.noticeText}>{t.sessionFullNotice}</Text>
            </View>
          )}
          {hasPeers ? (
            <View style={styles.section}>
              <ActionButton
                accessibilityHint={t.startButtonHint}
                disabled={result.kind === 'running'}
                label={t.startButton}
                onPress={onStart}
              />
              <ActionButton
                accessibilityHint={t.resetButtonHint}
                label={t.resetButton}
                onPress={onReset}
                variant="secondary"
              />
              <ResultSection locale={locale} result={result} t={t} />
            </View>
          ) : null}
        </>
      ) : (
        // major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カード未作成
        // （`hasSelfIntroCard === false`）のときは session が無く、scan/paste/
        // sample はすべて hook 側で no-op になる。無効な取り込み導線を有効に
        // 見せず、戻って作成する CTA だけを表示する。
        <ActionButton
          accessibilityHint={t.selfCardMissingCtaButtonHint}
          label={t.selfCardMissingCtaButton}
          onPress={onBack}
          variant="secondary"
        />
      )}
      {hasSelfIntroCard ? (
        // code-reviewer 指摘（minor、Issue 104 PR #132）: 自己紹介カード未作成
        // 時は上記の CTA（`t.selfCardMissingCtaButton`）が既に同じ `onBack` を
        // 呼ぶ戻る導線を提供している。ここでも常に表示すると同じ操作の
        // ボタンが 2 つ並んでしまうため、CTA と排他にする。
        <ActionButton
          label={t.backButton}
          onPress={onBack}
          variant="secondary"
        />
      ) : null}
      <SettingsLinkFooter
        hint={t.settingsButtonHint}
        label={t.settingsButton}
        onPress={onOpenSettings}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dangerCaption: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  peerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
  },
  removeButtonGlyph: {
    color: colors.danger,
    fontSize: 22,
    fontWeight: '700',
  },
  notice: {
    ...primaryEmphasisBorder,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noticeError: {
    backgroundColor: colors.white,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
});
