import { useReducer, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import {
  INITIAL_OWNER_QUESTION_ANSWER_STAGE,
  reduceOwnerQuestionAnswerStage,
} from '../app/owner-question-answer-flow';
import { ownerQuestionDisclosure } from '../app/owner-question-disclosure';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import type { OwnerAnswerValue } from '../domain/match-evidence';
import {
  OWNER_ANSWER_NOTE_MAX_LENGTH,
  type OwnerQuestion,
  validateOwnerAnswerNote,
} from '../domain/owner-question';
import { colors, spacing } from '../ui/theme';
import { monoFontFamily } from '../ui/typography';

interface OwnerQuestionScreenProps {
  readonly question: OwnerQuestion;
  readonly remainingMs: number;
  readonly errorMessage: string | null;
  readonly locale?: Locale;
  readonly onAnswer: (value: OwnerAnswerValue) => void;
  readonly onExit: () => void;
  readonly onHostEnd: () => void;
}

function formatRemainingSeconds(remainingMs: number): string {
  return String(Math.max(0, Math.ceil(remainingMs / 1_000)));
}

export default function OwnerQuestionScreen({
  question,
  remainingMs,
  errorMessage,
  locale = DEFAULT_LOCALE,
  onAnswer,
  onExit,
  onHostEnd,
}: OwnerQuestionScreenProps) {
  const t = MESSAGES[locale].ownerQuestion;
  const [stage, dispatchStage] = useReducer(
    reduceOwnerQuestionAnswerStage,
    INITIAL_OWNER_QUESTION_ANSWER_STAGE
  );
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const disclosure = ownerQuestionDisclosure(locale);
  // note state は changeNote が検証済みの値だけを書き込むため、ここでの
  // validateOwnerAnswerNote は表示用の前後空白除去だけを行い、例外は発生しない。
  const trimmedNote = validateOwnerAnswerNote(note);
  // Question Budget は 1 Lounge 最大 1 問という Domain の状態機械（`clarifying` は
  // 1 度しか到達できない）で構造的に守られているが、この画面自体でも「確定して
  // 共有する」「分からない」「パス」の連打で `onAnswer` を二重に呼ばない防御を持つ。
  const [submitted, setSubmitted] = useState(false);

  function answerOnce(value: OwnerAnswerValue): void {
    if (submitted) return;
    setSubmitted(true);
    onAnswer(value);
  }

  /**
   * `validateOwnerAnswerNote` は前後の空白を取り除いた値を返す。これをそのまま
   * `note` state へ書き戻すと、入力途中で単語の間に空白を打つたびに直前の空白が
   * 消え、単語同士がくっついてしまう（例: 「hello 」まで打った直後に末尾の
   * 空白が削られ、続けて「world」を打つと「helloworld」になる）。ここでは
   * 生の入力値をそのまま `note` へ保持し、`validateOwnerAnswerNote` は
   * 140 文字超過（`maxLength` を経由しない貼り付け等）を検出する目的だけに使う。
   */
  function changeNote(value: string): void {
    try {
      validateOwnerAnswerNote(value);
      setNote(value);
      setNoteError(null);
    } catch (error: unknown) {
      setNoteError(
        error instanceof Error ? error.message : t.noteInvalidFallback
      );
    }
  }

  return (
    <AppScreen
      description={t.description}
      eyebrow="Step 4 / Owner Question"
      title={t.title}
    >
      <View accessibilityRole="summary" style={styles.disclosure}>
        <Text style={styles.disclosureText}>
          {disclosure.sharedWithMessage}
        </Text>
        <Text style={styles.disclosureText}>
          {disclosure.deletedWhenMessage}
        </Text>
        <Text style={styles.disclosureText}>
          {disclosure.notSavedToPassportMessage}
        </Text>
      </View>
      <View accessibilityRole="summary" style={styles.countdownBadge}>
        <View style={styles.countdownDot} />
        <Text style={styles.countdown}>
          {t.countdown(formatRemainingSeconds(remainingMs))}
        </Text>
      </View>
      <View style={styles.questionCard}>
        <Text style={styles.question}>{question.displayText}</Text>
      </View>
      <View style={styles.field}>
        <Text nativeID="owner-answer-note-label" style={styles.label}>
          {t.noteLabel}
        </Text>
        <TextInput
          accessibilityHint={t.noteHint(OWNER_ANSWER_NOTE_MAX_LENGTH)}
          accessibilityLabel={t.noteAccessibilityLabel}
          editable={stage === 'answering'}
          maxLength={OWNER_ANSWER_NOTE_MAX_LENGTH}
          onChangeText={changeNote}
          placeholder={t.notePlaceholder}
          style={styles.input}
          value={note}
        />
        <Text style={styles.limit}>
          {t.noteCounter(note.length, OWNER_ANSWER_NOTE_MAX_LENGTH)}
        </Text>
        {noteError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {noteError}
          </Text>
        ) : null}
      </View>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      {stage === 'answering' ? (
        <>
          <ActionButton
            accessibilityHint={t.answerButtonHint}
            disabled={submitted}
            label={t.answerButton}
            onPress={() => dispatchStage({ type: 'choose-share' })}
          />
          <ActionButton
            accessibilityHint={t.noButtonHint}
            disabled={submitted}
            label={t.noButton}
            onPress={() => answerOnce('no')}
            variant="secondary"
          />
          <ActionButton
            accessibilityHint={t.declineButtonHint}
            disabled={submitted}
            label={t.declineButton}
            onPress={() => answerOnce('decline')}
            variant="secondary"
          />
        </>
      ) : (
        <View accessibilityRole="summary" style={styles.confirm}>
          <Text style={styles.confirmTitle}>{t.confirmTitle}</Text>
          <Text style={styles.confirmText}>{t.confirmText}</Text>
          {trimmedNote ? (
            <Text style={styles.confirmNote}>
              {t.confirmNotePrefix}
              {trimmedNote}
            </Text>
          ) : null}
          <ActionButton
            accessibilityHint={t.confirmShareButtonHint}
            disabled={submitted}
            label={t.confirmShareButton}
            onPress={() => answerOnce('yes')}
          />
          <ActionButton
            accessibilityHint={t.cancelShareButtonHint}
            disabled={submitted}
            label={t.cancelShareButton}
            onPress={() => dispatchStage({ type: 'cancel-share' })}
            variant="secondary"
          />
        </View>
      )}
      <ActionButton
        accessibilityHint={t.exitButtonHint}
        label={t.exitButton}
        onPress={onExit}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.hostEndButtonHint}
        label={t.hostEndButton}
        onPress={onHostEnd}
        variant="danger"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    gap: spacing.xs,
    padding: spacing.md,
  },
  disclosureText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  countdownBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  countdownDot: {
    backgroundColor: colors.warning,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  countdown: {
    color: colors.warningText,
    fontFamily: monoFontFamily,
    fontSize: 12,
    fontWeight: '500',
  },
  questionCard: {
    backgroundColor: colors.white,
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  question: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
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
  limit: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  confirm: {
    backgroundColor: colors.white,
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  confirmTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  confirmText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmNote: {
    color: colors.muted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
