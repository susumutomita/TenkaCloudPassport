import { useReducer, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
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

interface OwnerQuestionScreenProps {
  readonly question: OwnerQuestion;
  readonly remainingMs: number;
  readonly errorMessage: string | null;
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
  onAnswer,
  onExit,
  onHostEnd,
}: OwnerQuestionScreenProps) {
  const [stage, dispatchStage] = useReducer(
    reduceOwnerQuestionAnswerStage,
    INITIAL_OWNER_QUESTION_ANSWER_STAGE
  );
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const disclosure = ownerQuestionDisclosure();
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
        error instanceof Error ? error.message : 'メモを確認してください。'
      );
    }
  }

  return (
    <AppScreen
      description="この Lounge に限って使ってよいかを、あなた自身が決めます。回答しない権利があります。"
      eyebrow="Step 4 / Owner Question"
      title="Pet があなたに 1 問だけ確認します。"
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
      <Text style={styles.question}>{question.displayText}</Text>
      <Text style={styles.countdown}>
        残り {formatRemainingSeconds(remainingMs)} 秒で自動的に終了します。
      </Text>
      <View style={styles.field}>
        <Text nativeID="owner-answer-note-label" style={styles.label}>
          メモ（任意、相手には送りません）
        </Text>
        <TextInput
          accessibilityHint={`${OWNER_ANSWER_NOTE_MAX_LENGTH} 文字以内。入力しなくても回答できます。`}
          accessibilityLabel="Owner Question への任意のメモ"
          editable={stage === 'answering'}
          maxLength={OWNER_ANSWER_NOTE_MAX_LENGTH}
          onChangeText={changeNote}
          placeholder="空のままでも回答できます"
          style={styles.input}
          value={note}
        />
        <Text style={styles.limit}>
          {note.length} / {OWNER_ANSWER_NOTE_MAX_LENGTH}
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
            accessibilityHint="この手掛かりを今回の Lounge で使ってよいと答えます。最終確認の画面へ進みます。"
            disabled={submitted}
            label="答える"
            onPress={() => dispatchStage({ type: 'choose-share' })}
          />
          <ActionButton
            accessibilityHint="判断できない場合の回答です。この手掛かりは今回使いません。"
            disabled={submitted}
            label="分からない"
            onPress={() => answerOnce('no')}
            variant="secondary"
          />
          <ActionButton
            accessibilityHint="この質問には答えません。この手掛かりは今回使いません。"
            disabled={submitted}
            label="パス"
            onPress={() => answerOnce('decline')}
            variant="secondary"
          />
        </>
      ) : (
        <View accessibilityRole="summary" style={styles.confirm}>
          <Text style={styles.confirmTitle}>最終確認</Text>
          <Text style={styles.confirmText}>
            この手掛かりを今回の Lounge の相手にも見える Bridge として使います。
          </Text>
          {trimmedNote ? (
            <Text style={styles.confirmNote}>あなたのメモ: {trimmedNote}</Text>
          ) : null}
          <ActionButton
            accessibilityHint="この回答を確定し、相手にも見える Bridge の判定に使います。"
            disabled={submitted}
            label="確定して共有する"
            onPress={() => answerOnce('yes')}
          />
          <ActionButton
            accessibilityHint="確定せずに選び直します。"
            disabled={submitted}
            label="やめる"
            onPress={() => dispatchStage({ type: 'cancel-share' })}
            variant="secondary"
          />
        </View>
      )}
      <ActionButton
        accessibilityHint="この Lounge から退出し、この端末のデータを破棄します。"
        label="退出して破棄"
        onPress={onExit}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint="Host としてこの Lounge を終了し、全参加者のデータを破棄します。"
        label="Host として終了"
        onPress={onHostEnd}
        variant="danger"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  disclosureText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  question: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  countdown: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
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
