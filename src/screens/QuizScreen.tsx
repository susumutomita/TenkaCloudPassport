import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import {
  allQuizQuestions,
  QUIZ_QUESTION_COUNT,
  type QuizQuestion,
  type QuizQuestionId,
  quizQuestionById,
} from '../domain/quiz-catalog';
import {
  isQuizComplete,
  isQuizQuestionCleared,
  quizClearedCount,
  scoreQuizAnswer,
} from '../domain/quiz-progress';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';

export interface QuizScreenProps {
  readonly clearedIds: ReadonlySet<QuizQuestionId>;
  readonly locale?: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
  /** 正解した設問だけを呼び出し側（`PassportApp.tsx`）へ通知し、進捗の永続化を委ねる。 */
  readonly onAnswerCorrect: (id: QuizQuestionId) => void;
  readonly onBack: () => void;
}

type ChoiceIndex = 0 | 1 | 2 | 3;

function asChoiceIndex(index: number): ChoiceIndex {
  return index as ChoiceIndex;
}

interface QuestionListProps {
  readonly clearedIds: ReadonlySet<QuizQuestionId>;
  readonly locale: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
  readonly onSelectQuestion: (id: QuizQuestionId) => void;
  readonly onBack: () => void;
}

/**
 * クイズの一覧画面。16 問をカタログ登録順（bitIndex 昇順）に並べ、クリア状況を
 * 枠 + テキスト（`t.clearedStatusLabel` / `t.notClearedStatusLabel`）で示す
 * （色だけに依存しない、既存 Screen の四択セレクタと同じ流儀）。
 */
function QuestionList({
  clearedIds,
  locale,
  onChangeLocale,
  onSelectQuestion,
  onBack,
}: QuestionListProps) {
  const t = MESSAGES[locale].quiz;
  const questions = allQuizQuestions();
  return (
    <AppScreen
      description={t.listDescription}
      eyebrow={t.eyebrow}
      locale={locale}
      onChangeLocale={onChangeLocale}
      title={t.listTitle}
    >
      <Text style={styles.clearedCount}>
        {t.clearedCount(quizClearedCount(clearedIds), QUIZ_QUESTION_COUNT)}
      </Text>
      {isQuizComplete(clearedIds) ? (
        <Text style={styles.allClearedNotice}>{t.allClearedNotice}</Text>
      ) : null}
      <View style={styles.list}>
        {questions.map((question) => {
          const cleared = isQuizQuestionCleared(clearedIds, question.id);
          return (
            <Pressable
              accessibilityLabel={t.questionAccessibilityLabel(
                question.prompt[locale],
                cleared
              )}
              accessibilityRole="button"
              key={question.id}
              onPress={() => onSelectQuestion(question.id)}
              style={[
                styles.listItem,
                cleared ? styles.listItemCleared : undefined,
              ]}
            >
              <Text style={styles.listItemCategory}>
                {t.categoryLabels[question.category]}
              </Text>
              <Text style={styles.listItemPrompt}>
                {question.prompt[locale]}
              </Text>
              <Text style={styles.listItemStatus}>
                {cleared ? t.clearedStatusLabel : t.notClearedStatusLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ActionButton
        accessibilityHint={t.backButtonHint}
        label={t.backButton}
        onPress={onBack}
        variant="secondary"
      />
    </AppScreen>
  );
}

interface QuestionDetailProps {
  readonly question: QuizQuestion;
  readonly locale: Locale;
  readonly onChangeLocale: (locale: Locale) => void;
  readonly onAnswerCorrect: (id: QuizQuestionId) => void;
  readonly onBackToList: () => void;
}

/**
 * クイズの出題画面。選択 → 採点 → 正誤 + 解説の表示までを担う。
 *
 * Issue 130（Codex 指摘 minor）: 「提出」ボタンが正誤結果の View に置き換わるだけで、
 * 画面遷移（stage 変化）を伴わないため、明示的なアナウンス機構が無いとスクリーン
 * リーダー利用者が結果に気づけない。`accessibilityLiveRegion="polite"` を結果 View
 * に付け、既存の `SettingsScreen.tsx` / `LocalDiagnosticsScreen.tsx` /
 * `PilotMeasurementScreen.tsx` と同じ「動的に現れる通知は live region で知らせる」
 * 流儀に揃える（新しい機構 `AccessibilityInfo.announceForAccessibility` は導入せず、
 * 既存パターンの一貫性を優先した）。Android の TalkBack は `accessibilityLiveRegion`
 * を解釈するが、iOS の VoiceOver は同 prop を無視するため、iOS で実際にアナウンス
 * されるかどうかは実機（VoiceOver）での確認が必要（owner ゲート、この Issue の
 * scope 外）。
 */
function QuestionDetail({
  question,
  locale,
  onChangeLocale,
  onAnswerCorrect,
  onBackToList,
}: QuestionDetailProps) {
  const t = MESSAGES[locale].quiz;
  const [selectedChoiceIndex, setSelectedChoiceIndex] =
    useState<ChoiceIndex | null>(null);
  const [answered, setAnswered] = useState(false);

  function handleSubmit(): void {
    if (selectedChoiceIndex === null) return;
    const outcome = scoreQuizAnswer(question, selectedChoiceIndex);
    setAnswered(true);
    if (outcome.correct) onAnswerCorrect(question.id);
  }

  const outcome =
    answered && selectedChoiceIndex !== null
      ? scoreQuizAnswer(question, selectedChoiceIndex)
      : null;

  return (
    <AppScreen
      description={t.categoryLabels[question.category]}
      eyebrow={t.questionEyebrow}
      locale={locale}
      onChangeLocale={onChangeLocale}
      title={question.prompt[locale]}
    >
      <View style={styles.list}>
        {question.choices.map((choice, index) => {
          const choiceIndex = asChoiceIndex(index);
          const selected = selectedChoiceIndex === choiceIndex;
          return (
            <Pressable
              accessibilityLabel={t.choiceAccessibilityLabel(
                index,
                choice[locale],
                selected
              )}
              accessibilityRole="button"
              accessibilityState={{ disabled: answered, selected }}
              disabled={answered}
              key={choice.ja}
              onPress={() => setSelectedChoiceIndex(choiceIndex)}
              style={[
                styles.choice,
                selected ? styles.choiceSelected : undefined,
              ]}
            >
              <Text style={styles.choiceText}>{choice[locale]}</Text>
            </Pressable>
          );
        })}
      </View>
      {outcome ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="summary"
          style={styles.result}
        >
          <Text style={styles.resultTitle}>
            {outcome.correct ? t.correctTitle : t.incorrectTitle}
          </Text>
          <Text style={styles.explanationLabel}>{t.explanationLabel}</Text>
          <Text style={styles.explanationText}>
            {question.explanation[locale]}
          </Text>
        </View>
      ) : (
        <ActionButton
          accessibilityHint={t.submitButtonHint}
          disabled={selectedChoiceIndex === null}
          label={t.submitButton}
          onPress={handleSubmit}
        />
      )}
      <ActionButton
        accessibilityHint={t.backToListButtonHint}
        label={t.backToListButton}
        onPress={onBackToList}
        variant="secondary"
      />
    </AppScreen>
  );
}

/**
 * Issue 110: クラウド基礎クイズ画面。一覧（既定表示）と出題の 2 状態を、
 * `IntroCardStageGate` と同様にこの Component 内の `useState` だけで切り替える
 * （`PassportApp.tsx` に新しい Stage を増やさない、設計文書
 * `docs/design/2026-07-23-cloud-basics-quiz.md` 7 節）。回答の途中経過（選択中の
 * 選択肢・出題中の設問）はこの画面のローカル state に閉じ、永続化するのは
 * `onAnswerCorrect` 経由で親へ通知する「クリア済み」の事実だけである。
 */
export default function QuizScreen({
  clearedIds,
  locale = DEFAULT_LOCALE,
  onChangeLocale,
  onAnswerCorrect,
  onBack,
}: QuizScreenProps) {
  const [selectedQuestionId, setSelectedQuestionId] =
    useState<QuizQuestionId | null>(null);

  if (selectedQuestionId === null) {
    return (
      <QuestionList
        clearedIds={clearedIds}
        locale={locale}
        onBack={onBack}
        onChangeLocale={onChangeLocale}
        onSelectQuestion={setSelectedQuestionId}
      />
    );
  }

  return (
    <QuestionDetail
      locale={locale}
      onAnswerCorrect={onAnswerCorrect}
      onBackToList={() => setSelectedQuestionId(null)}
      onChangeLocale={onChangeLocale}
      question={quizQuestionById(selectedQuestionId)}
    />
  );
}

const styles = StyleSheet.create({
  clearedCount: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  allClearedNotice: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
  },
  listItem: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    padding: spacing.md,
  },
  listItemCleared: {
    borderColor: colors.success,
  },
  listItemCategory: {
    color: colors.mutedLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  listItemPrompt: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  listItemStatus: {
    color: colors.muted,
    fontSize: 13,
  },
  choice: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    padding: spacing.md,
  },
  choiceSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  choiceText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  result: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  resultTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  explanationLabel: {
    color: colors.mutedLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  explanationText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
});
