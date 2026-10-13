import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { practiceText } from '../../app/learning/presentation';
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
      <Text>{practiceText(lesson.summary)}</Text>
      <Text>教材の版 v{catalog.version}</Text>
      <LessonDetails lesson={lesson} />
      {progress?.completed ? (
        <View accessibilityRole="alert" style={styles.success}>
          <Text style={styles.heading}>
            ✓ この練習の回答を記録しました / Practice recorded
          </Text>
          <Text>
            次はヒントなしで類題を組み立て、手元で実装・テストしましょう。この記録は自己評価で、実装の検証済みを意味しません。
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
      <Text style={styles.body}>{practiceText(step.prompt)}</Text>
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
  const [revealedHints, setRevealedHints] = useState(0);
  const [showReference, setShowReference] = useState(false);
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
      <ReasoningDraft />
      {hints.length ? (
        <ActionButton
          label={`次のヒントを開く / Next hint (${revealedHints}/${hints.length})`}
          disabled={busy || revealedHints >= hints.length}
          onPress={() => setRevealedHints((value) => value + 1)}
          variant="secondary"
        />
      ) : null}
      <>
        {hints.slice(0, revealedHints).map((hint) => (
          <Text key={hint.id}>{hint.text}</Text>
        ))}
        {step.reference ? (
          <ActionButton
            label={
              showReference
                ? '参考解答を閉じる / Hide reference'
                : '参考解答を開く / Show reference'
            }
            disabled={busy}
            variant="secondary"
            onPress={() => setShowReference(!showReference)}
          />
        ) : null}
        {showReference && step.reference ? (
          <Text selectable style={styles.code}>
            {step.reference}
          </Text>
        ) : null}
      </>
      {step.check ? <Text>{step.check}</Text> : null}
      <ActionButton
        label="自分で説明できた（自己評価・実装未検証） / Self: ready"
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
function ReasoningDraft() {
  const [draft, setDraft] = useState('');
  return (
    <View style={styles.success}>
      <Text style={styles.heading}>
        自分で組み立てる / Build your reasoning
      </Text>
      <Text>
        何を状態として持つ？ 1回の操作でどう変わる？
        小さい例を手で動かし、計算量と反例を考えてみましょう。
      </Text>
      <TextInput
        accessibilityLabel="状態・遷移・トレースのメモ / Reasoning notes"
        multiline
        maxLength={10_000}
        value={draft}
        onChangeText={setDraft}
        placeholder="状態：
遷移：
小さい例のトレース：
計算量・反例："
        style={styles.code}
      />
      <Text>
        このメモは保存しません。問題を移動すると消えます。実装・テストは手元の環境で行ってください。
      </Text>
    </View>
  );
}
function safeSourceURL(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
function LessonDetails({ lesson }: { readonly lesson: Lesson }) {
  const [expanded, setExpanded] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const sources =
    lesson.sources?.filter((source) => safeSourceURL(source.url)) ?? [];
  async function openSource(url: string) {
    setLinkError(false);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError(true);
    }
  }
  return (
    <>
      <ActionButton
        label={
          expanded ? '教材情報・参考資料を閉じる' : '教材情報・参考資料を開く'
        }
        variant="secondary"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <View style={styles.success}>
          <Text>
            独自の練習教材です。参考資料は公式過去問や出題元を意味しません。
          </Text>
          <Text>
            作者：
            {lesson.authors
              .map((author) => `${author.name} (${author.type ?? 'author'})`)
              .join(', ')}
          </Text>
          {sources.map((source) => (
            <ActionButton
              key={source.url}
              label={`参考資料：${source.title}`}
              variant="secondary"
              onPress={() => void openSource(source.url)}
            />
          ))}
          {sources.length === 0 ? (
            <Text>この教材には参考資料のリンクがまだありません。</Text>
          ) : null}
          {linkError ? (
            <Text accessibilityRole="alert">
              参考資料を開けませんでした。通信・ブラウザを確認してください。
            </Text>
          ) : null}
        </View>
      ) : null}
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
    correct: '✓ 選択問題の正解 / Correct choice',
    incorrect: 'もう一度考えてみましょう / Try again',
    'self-ready':
      '自己評価を記録・実装は未検証 / Self-assessed; implementation not verified',
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
