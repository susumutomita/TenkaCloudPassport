import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ConversationAgentResultState } from '../app/conversation-agent-flow';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import SettingsLinkFooter from '../components/SettingsLinkFooter';
import type { ParticipantId } from '../domain/session-identifiers';
import { colors, primaryEmphasisBorder, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェント（Step A、2 者間）の画面。相手の
 * 自己紹介ページ URL を QR 再スキャン・手動貼り付け・サンプルカードのいずれかで
 * 取り込み、共通点・最初の質問を表示する。相手カードはこの画面（Screen）と
 * それを保持する `ConversationSession`（`PassportApp.tsx` の state）以外の
 * どこにも渡らず、ディスクへは一切書き込まれない（`docs/adr/0036-on-device-conversation-agent.md`）。
 */

export interface ConversationAgentPeerView {
  readonly participantId: ParticipantId;
  readonly name: string;
}

export interface ConversationAgentScreenProps {
  readonly hasSelfIntroCard: boolean;
  readonly peers: readonly ConversationAgentPeerView[];
  readonly pasteInput: string;
  readonly errorMessage: string | null;
  readonly result: ConversationAgentResultState;
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
  t,
  onChangePasteInput,
  onSubmitPasteInput,
  onScanPeer,
  onUseSampleCard,
}: {
  readonly pasteInput: string;
  readonly errorMessage: string | null;
  readonly t: (typeof MESSAGES)[Locale]['conversationAgent'];
  readonly onChangePasteInput: (value: string) => void;
  readonly onSubmitPasteInput: () => void;
  readonly onScanPeer: () => void;
  readonly onUseSampleCard: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.peerSectionTitle}</Text>
      <Text style={styles.hint}>{t.noPeerNotice}</Text>
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
  result,
  t,
}: {
  readonly result: ConversationAgentResultState;
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
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="summary"
      style={styles.notice}
    >
      <Text style={styles.noticeTitle}>{t.bridgeReasonTitle}</Text>
      <Text style={styles.noticeText}>{result.reason}</Text>
      <Text style={styles.noticeTitle}>{t.bridgeOpenerTitle}</Text>
      <Text style={styles.noticeText}>{result.opener}</Text>
    </View>
  );
}

export default function ConversationAgentScreen({
  hasSelfIntroCard,
  peers,
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
  const peer = peers[0];

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
      {peer ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.peerSectionTitle}</Text>
          <View style={styles.peerRow}>
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
          <ResultSection result={result} t={t} />
        </View>
      ) : (
        <IntakeSection
          errorMessage={errorMessage}
          onChangePasteInput={onChangePasteInput}
          onScanPeer={onScanPeer}
          onSubmitPasteInput={onSubmitPasteInput}
          onUseSampleCard={onUseSampleCard}
          pasteInput={pasteInput}
          t={t}
        />
      )}
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
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
