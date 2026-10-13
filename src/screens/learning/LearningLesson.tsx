import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../../components/ActionButton';
import {
  type Attempt,
  type Catalog,
  type LearningState,
  type Lesson,
  lessonKey,
  type Step,
} from '../../domain/learning/model';
import { currentProgress } from '../../domain/learning/transitions';
import { colors, spacing } from '../../ui/theme';
import { monoFontFamily } from '../../ui/typography';

interface Props {
  readonly state: LearningState;
  readonly catalog: Catalog;
  readonly lesson: Lesson;
  readonly busy: boolean;
  readonly onAnswer: (choice: string | null, selfReady?: boolean) => void;
  readonly onNext: () => void;
  readonly onRestart: () => void;
  readonly onBack: () => void;
}
export function LearningLesson(props: Props) {
  const { state, catalog, lesson, busy, onRestart, onBack } = props;
  const progress = currentProgress(state, catalog, lesson);
  const step = lesson.steps[progress?.index ?? 0];
  const attempt = state.attempts
    .filter(
      (item) =>
        item.key === lessonKey(catalog, lesson) &&
        item.session === progress?.session &&
        item.stepID === step?.id
    )
    .at(-1);
  return (
    <>
      <Text style={styles.heading}>{lesson.title}</Text>
      <Text>{lesson.summary}</Text>
      <Text>
        {catalog.catalogID} · v{catalog.version}
      </Text>
      <Text>
        作者 / Authors:{' '}
        {lesson.authors
          .map(
            (author) =>
              `${author.name}${author.type ? ` (${author.type})` : ''}`
          )
          .join(', ')}
      </Text>
      {progress?.completed ? (
        <View accessibilityRole="alert" style={styles.success}>
          <Text style={styles.heading}>
            ✓ この練習を完了しました / Practice complete
          </Text>
          <Text>
            次はヒントを見ずに考え方を説明してみましょう。自己評価は能力の証明ではありません。
          </Text>
          <ActionButton
            label="もう一度練習 / Practice again"
            disabled={busy}
            onPress={onRestart}
          />
        </View>
      ) : null}
      {step && !progress?.completed ? (
        <StepBody
          key={`${progress?.session}-${step.id}`}
          step={step}
          attempt={attempt}
          index={progress?.index ?? 0}
          count={lesson.steps.length}
          busy={busy}
          onAnswer={props.onAnswer}
          onNext={props.onNext}
        />
      ) : null}
      <ActionButton
        label="教材一覧へ / Back to lessons"
        disabled={busy}
        onPress={onBack}
        variant="secondary"
      />
    </>
  );
}
function StepBody({
  step,
  attempt,
  index,
  count,
  busy,
  onAnswer,
  onNext,
}: {
  readonly step: Step;
  readonly attempt: Attempt | undefined;
  readonly index: number;
  readonly count: number;
  readonly busy: boolean;
  readonly onAnswer: Props['onAnswer'];
  readonly onNext: () => void;
}) {
  const accepted = attempt && attempt.result !== 'incorrect';
  return (
    <>
      <Text style={styles.heading}>
        {index + 1}/{count} · {step.phase}
      </Text>
      {step.title ? <Text style={styles.heading}>{step.title}</Text> : null}
      <Text style={styles.body}>{step.prompt}</Text>
      {step.code ? (
        <Text selectable style={styles.code}>
          {step.code}
        </Text>
      ) : null}
      {step.choices.map((choice) => (
        <ActionButton
          key={choice.id}
          label={choice.text}
          disabled={busy}
          onPress={() => onAnswer(choice.id)}
          variant="secondary"
        />
      ))}
      {step.choices.length === 0 ? (
        <SelfAssessment step={step} busy={busy} onAnswer={onAnswer} />
      ) : null}
      {attempt ? <Feedback attempt={attempt} step={step} /> : null}
      <ActionButton
        label="次へ / Next"
        disabled={busy || !accepted}
        onPress={onNext}
      />
    </>
  );
}
function SelfAssessment({
  step,
  busy,
  onAnswer,
}: {
  readonly step: Step;
  readonly busy: boolean;
  readonly onAnswer: Props['onAnswer'];
}) {
  const [showHelp, setShowHelp] = useState(false);
  const hints =
    step.hints?.map((text, ordinal) => ({
      id: `${step.id}-hint-${ordinal}`,
      text,
    })) ?? [];
  return (
    <>
      <Text>
        口頭または手元で説明してください。説明文は保存しません。下の操作は自己申告で、採点ではありません。
        / Self-assessment only.
      </Text>
      <ActionButton
        label="ヒント・参考解答を開く / Reveal guidance"
        disabled={busy}
        onPress={() => setShowHelp((value) => !value)}
        variant="secondary"
      />
      {showHelp ? (
        <>
          {hints.map((hint) => (
            <Text key={hint.id}>{hint.text}</Text>
          ))}
          {step.reference ? (
            <Text selectable style={styles.code}>
              {step.reference}
            </Text>
          ) : null}
        </>
      ) : null}
      {step.check ? <Text>{step.check}</Text> : null}
      <ActionButton
        label="自分で説明できた（自己評価） / Self: ready"
        disabled={busy}
        onPress={() => onAnswer(null, true)}
      />
      <ActionButton
        label="復習したい（自己評価） / Self: review"
        disabled={busy}
        onPress={() => onAnswer(null, false)}
        variant="secondary"
      />
    </>
  );
}
function Feedback({
  attempt,
  step,
}: {
  readonly attempt: Attempt;
  readonly step: Step;
}) {
  const titles = {
    correct: '✓ 正解！ / Correct!',
    incorrect: 'もう一度考えてみましょう / Try again',
    'self-ready': '自己評価を記録しました / Self-assessment recorded',
    'self-review': '復習に追加しました / Added to review',
  };
  return (
    <View
      accessibilityRole="alert"
      style={attempt.result === 'incorrect' ? styles.error : styles.success}
    >
      <Text style={styles.heading}>{titles[attempt.result]}</Text>
      <Text style={styles.body}>
        {step.choices.find((choice) => choice.id === attempt.choiceID)
          ?.explanation ?? step.explanation}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 21, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 17, lineHeight: 26 },
  code: {
    color: colors.ink,
    backgroundColor: colors.surface,
    padding: spacing.md,
    fontFamily: monoFontFamily,
    fontSize: 15,
  },
  success: {
    borderColor: colors.successText,
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  error: {
    borderColor: colors.danger,
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
