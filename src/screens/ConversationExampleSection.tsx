import { StyleSheet, Text, View } from 'react-native';
import type { ConversationExampleResultView } from '../app/conversation-agent-flow';
import { CONVERSATION_EXAMPLE_TIMEOUT_MS } from '../app/conversation-example-flow';
import { CONVERSATION_EXAMPLE_MESSAGES } from '../app/i18n/conversation-example-messages';
import type { Locale } from '../app/i18n/locale';
import ActionButton from '../components/ActionButton';
import type {
  ConversationExampleSpeaker,
  ConversationExampleTurn,
} from '../domain/conversation-example';
import { colors, spacing } from '../ui/theme';

interface ConversationExampleSectionProps {
  readonly locale: Locale;
  readonly peerName?: string | undefined;
  readonly view: ConversationExampleResultView;
}

interface SpeakerLabels {
  readonly ownerLabel: string;
  readonly peerLabel: string;
}

function ConversationBubble({
  index,
  turn,
  ownerLabel,
  peerLabel,
  accessibilityLabel,
}: {
  readonly index: number;
  readonly turn: ConversationExampleTurn;
  readonly ownerLabel: string;
  readonly peerLabel: string;
  readonly accessibilityLabel: (
    index: number,
    speaker: string,
    text: string
  ) => string;
}) {
  const owner = turn.speaker === 'owner';
  const speaker = owner ? ownerLabel : peerLabel;
  return (
    <View
      accessibilityLabel={accessibilityLabel(index + 1, speaker, turn.text)}
      accessible
      style={[
        styles.bubbleRow,
        owner ? styles.ownerBubbleRow : styles.peerBubbleRow,
      ]}
    >
      <Text accessible={false} style={styles.speakerLabel}>
        {speaker}
      </Text>
      <View
        style={[styles.bubble, owner ? styles.ownerBubble : styles.peerBubble]}
      >
        <Text accessible={false} style={styles.bubbleText}>
          {turn.text}
        </Text>
      </View>
    </View>
  );
}

/**
 * Issue 169: ターン毎生成へ移行し、次に話す側がまだ確定していない間、
 * LINE の入力中表示に相当する吹き出しを出す。視覚は「…」だけのため、
 * 誰が入力中かは Accessibility Label で明示する。
 */
function TypingIndicatorBubble({
  speaker,
  labels,
  accessibilityLabel,
}: {
  readonly speaker: ConversationExampleSpeaker;
  readonly labels: SpeakerLabels;
  readonly accessibilityLabel: (speaker: string) => string;
}) {
  const owner = speaker === 'owner';
  const speakerName = owner ? labels.ownerLabel : labels.peerLabel;
  return (
    <View
      accessibilityLabel={accessibilityLabel(speakerName)}
      accessible
      style={[
        styles.bubbleRow,
        owner ? styles.ownerBubbleRow : styles.peerBubbleRow,
      ]}
    >
      <Text accessible={false} style={styles.speakerLabel}>
        {speakerName}
      </Text>
      <View
        style={[
          styles.bubble,
          owner ? styles.ownerBubble : styles.peerBubble,
          styles.typingBubble,
        ]}
      >
        <Text accessible={false} style={styles.bubbleText}>
          …
        </Text>
      </View>
    </View>
  );
}

function conversationTurnKey(
  turns: readonly ConversationExampleTurn[],
  index: number
): string {
  return turns
    .slice(0, index + 1)
    .map((turn) => `${turn.speaker}:${turn.text}`)
    .join('|');
}

function ConversationTurnList({
  turns,
  labels,
  bubbleAccessibilityLabel,
}: {
  readonly turns: readonly ConversationExampleTurn[];
  readonly labels: SpeakerLabels;
  readonly bubbleAccessibilityLabel: (
    index: number,
    speaker: string,
    text: string
  ) => string;
}) {
  return (
    <>
      {turns.map((turn, index) => (
        <ConversationBubble
          accessibilityLabel={bubbleAccessibilityLabel}
          index={index}
          key={conversationTurnKey(turns, index)}
          ownerLabel={labels.ownerLabel}
          peerLabel={labels.peerLabel}
          turn={turn}
        />
      ))}
    </>
  );
}

function resolvedPeerLabels(
  peerName: string | undefined,
  t: (typeof CONVERSATION_EXAMPLE_MESSAGES)[Locale]
): SpeakerLabels {
  // Issue 155（owner フィードバック）: 相手の生の名前を吹き出しに出すと
  // 「本人が実際に言った」ように見える。話者は AI であることをラベルで明示する。
  const trimmedPeerName = peerName?.trim();
  return {
    ownerLabel: t.ownerLabel,
    peerLabel: trimmedPeerName
      ? t.peerAiLabel(trimmedPeerName)
      : t.peerFallbackLabel,
  };
}

function ConversationExampleBody({
  locale,
  peerName,
  view,
}: ConversationExampleSectionProps) {
  const t = CONVERSATION_EXAMPLE_MESSAGES[locale];
  const { state } = view;
  if (state.kind === 'hidden') return null;
  if (state.kind === 'available') {
    return (
      <ActionButton
        accessibilityHint={t.generateButtonHint}
        label={t.generateButton}
        onPress={view.onGenerate}
      />
    );
  }
  const labels = resolvedPeerLabels(peerName, t);
  if (state.kind === 'generating') {
    return (
      <>
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: CONVERSATION_EXAMPLE_TIMEOUT_MS / 1_000,
            now: Math.min(
              state.elapsedSeconds,
              CONVERSATION_EXAMPLE_TIMEOUT_MS / 1_000
            ),
            text: t.generatingStatus(state.elapsedSeconds),
          }}
          style={styles.progressNotice}
        >
          <Text style={styles.progressText}>
            {t.generatingStatus(state.elapsedSeconds)}
          </Text>
        </View>
        <View accessibilityLiveRegion="polite" style={styles.conversation}>
          <ConversationTurnList
            bubbleAccessibilityLabel={t.bubbleAccessibilityLabel}
            labels={labels}
            turns={state.turns}
          />
          {state.nextSpeaker !== null && (
            <TypingIndicatorBubble
              accessibilityLabel={t.typingIndicatorLabel}
              labels={labels}
              speaker={state.nextSpeaker}
            />
          )}
        </View>
        <ActionButton
          accessibilityHint={t.cancelButtonHint}
          label={t.cancelButton}
          onPress={view.onCancel}
          variant="secondary"
        />
      </>
    );
  }
  if (state.kind === 'failed') {
    return (
      <>
        <Text accessibilityRole="alert" style={styles.failureText}>
          {t.failedNotice}
        </Text>
        <ActionButton
          accessibilityHint={t.retryButtonHint}
          label={t.retryButton}
          onPress={view.onGenerate}
          variant="secondary"
        />
      </>
    );
  }
  if (state.kind === 'ended-early') {
    return (
      <>
        <View accessibilityLiveRegion="polite" style={styles.conversation}>
          <ConversationTurnList
            bubbleAccessibilityLabel={t.bubbleAccessibilityLabel}
            labels={labels}
            turns={state.turns}
          />
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.progressText}>
          {t.endedEarlyNotice}
        </Text>
        <ActionButton
          accessibilityHint={t.regenerateButtonHint}
          label={t.regenerateButton}
          onPress={view.onGenerate}
          variant="secondary"
        />
      </>
    );
  }
  return (
    <>
      <View accessibilityLiveRegion="polite" style={styles.conversation}>
        <ConversationTurnList
          bubbleAccessibilityLabel={t.bubbleAccessibilityLabel}
          labels={labels}
          turns={state.example.turns}
        />
      </View>
      <ActionButton
        accessibilityHint={t.regenerateButtonHint}
        label={t.regenerateButton}
        onPress={view.onGenerate}
        variant="secondary"
      />
    </>
  );
}

/**
 * Bridge の根拠表示を置き換えず、その直下にだけ出す短命な AI 会話例 Section。
 * hidden 以外では Disclosure を操作より前に常時表示し、閉じる導線を持たない。
 */
export default function ConversationExampleSection(
  props: ConversationExampleSectionProps
) {
  if (props.view.state.kind === 'hidden') return null;
  const t = CONVERSATION_EXAMPLE_MESSAGES[props.locale];
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t.sectionTitle}
      </Text>
      <View accessibilityRole="summary" style={styles.disclosureBanner}>
        <Text accessibilityRole="header" style={styles.disclosureText}>
          {t.disclosureBanner}
        </Text>
      </View>
      <Text style={styles.privacyNotice}>{t.privacyNotice}</Text>
      <ConversationExampleBody {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  disclosureBanner: {
    backgroundColor: colors.surface,
    borderColor: colors.warning,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.sm,
  },
  disclosureText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  privacyNotice: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  progressNotice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.sm,
  },
  progressText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  failureText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  conversation: {
    gap: spacing.sm,
  },
  bubbleRow: {
    maxWidth: '86%',
  },
  ownerBubbleRow: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  peerBubbleRow: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  speakerLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ownerBubble: {
    backgroundColor: colors.accent,
  },
  peerBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  typingBubble: {
    opacity: 0.6,
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
});
