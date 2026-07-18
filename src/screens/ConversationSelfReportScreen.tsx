import { StyleSheet, Text } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { ConversationSelfReport } from '../app/pilot-measurement';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import NoticeCard from '../components/NoticeCard';
import { colors } from '../ui/theme';

interface ConversationSelfReportScreenProps {
  readonly locale?: Locale;
  readonly onAnswer: (answer: ConversationSelfReport) => void;
  readonly onSkip: () => void;
}

export default function ConversationSelfReportScreen({
  locale = DEFAULT_LOCALE,
  onAnswer,
  onSkip,
}: ConversationSelfReportScreenProps) {
  const t = MESSAGES[locale].conversationSelfReport;
  return (
    <AppScreen
      description={t.description}
      eyebrow="Optional Research"
      title={t.title}
    >
      <NoticeCard body={t.storageNotice} title={t.optionalNotice} />
      <Text style={styles.question}>{t.question}</Text>
      <ActionButton
        accessibilityHint={t.answerHint}
        label={t.startedConversationButton}
        onPress={() => onAnswer('started-conversation')}
      />
      <ActionButton
        accessibilityHint={t.answerHint}
        label={t.notYetButton}
        onPress={() => onAnswer('not-yet')}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.declineHint}
        label={t.preferNotToAnswerButton}
        onPress={() => onAnswer('prefer-not-to-answer')}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.skipHint}
        label={t.skipButton}
        onPress={onSkip}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  question: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 30,
  },
});
