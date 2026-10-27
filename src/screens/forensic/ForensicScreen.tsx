import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ForensicPort } from '../../app/forensic/host';
import type { Locale } from '../../app/i18n/locale';
import ActionButton from '../../components/ActionButton';
import AppScreen from '../../components/AppScreen';
import CorrectReaction from '../../components/CorrectReaction';
import type {
  Operation,
  Projection,
} from '../../domain/forensic/upstream/types';
import { createRoundId } from '../../domain/session-identifiers';
import { webCryptoRandomBytes } from '../../protocol/web-crypto-random';
import { colors, spacing } from '../../ui/theme';
import TapAnswer, { Choice } from './TapAnswer';
import {
  type AnswerValues,
  questionSummary,
  questionTitle,
  tapAnswer,
} from './tap-answer';

function useForensic(host: ForensicPort) {
  const [view, setView] = useState<Projection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [selection, setSelection] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerValues, setAnswerValues] = useState<AnswerValues>({});
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [pending, setPending] = useState<Operation | null>(null);
  const [openedEvidence, setOpenedEvidence] = useState('');
  const [celebration, setCelebration] = useState(0);
  useEffect(() => {
    let mounted = true;
    host
      .load()
      .then((value) => {
        if (mounted) setView(value);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [host]);
  async function refresh() {
    setBusy(true);
    setError(false);
    try {
      setView(await host.load());
      setPending(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const pairs =
    view?.cases.flatMap((c) => c.questions.map((q) => ({ c, q }))) ?? [];
  const current =
    pairs.find(({ c, q }) => `${c.id}/${q.id}` === selection) ?? pairs[0];
  async function send(operation: Operation) {
    setBusy(true);
    setError(false);
    setPending(operation);
    try {
      const next = await host.submit(operation);
      setView(next);
      if (operation.kind === 'answer' && next.lastResult?.status === 'correct')
        setCelebration((count) => count + 1);
      setPending(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  function submit(kind: 'answer' | 'hint') {
    if (!view || !current) return;
    const common = {
      id: createRoundId(webCryptoRandomBytes),
      revision: view.revision,
      generation: view.generation,
      caseId: current.c.id,
      questionId: current.q.id,
    };
    if (kind === 'answer') void send({ ...common, kind, answer, evidenceIds });
    else if (current.q.unlockedHints < 3)
      void send({
        ...common,
        kind,
        rung: (current.q.unlockedHints + 1) as 1 | 2 | 3,
      });
  }
  const locked = busy || pending !== null;
  const evidence = current?.c.evidence.find((e) => e.id === openedEvidence);
  return {
    view,
    busy,
    error,
    pending,
    current,
    pairs,
    locked,
    evidence,
    celebration,
    answer,
    evidenceIds,
    refresh,
    send,
    submit,
    setSelection,
    setCelebration,
    setAnswer,
    answerValues,
    setAnswerValues,
    setEvidenceIds,
    setOpenedEvidence,
  };
}
export default function ForensicScreen({
  host,
  locale,
  onClose,
}: {
  host: ForensicPort;
  locale: Locale;
  onClose(): void;
}) {
  const ja = locale === 'ja';
  const flow = useForensic(host);
  const { view, busy, error, current } = flow;
  return (
    <AppScreen
      key={current ? `${current.c.id}/${current.q.id}` : 'loading'}
      automaticallyAdjustKeyboardInsets
      eyebrow="TenkaCloud · offline practice"
      title={ja ? 'フォレンジック調査室' : 'Forensic casebook'}
      description={
        ja
          ? '既存の4ケース・15問を端末内で採点。練習点数は本戦へ送信されません。'
          : 'The original four cases and fifteen questions, graded on this device. Practice scores are not submitted to a competition.'
      }
      footer={
        <ActionButton
          label={ja ? '学習に戻る' : 'Back to learning'}
          onPress={onClose}
          disabled={busy}
          variant="secondary"
        />
      }
    >
      <RecoveryNotice flow={flow} locale={locale} />
      {!view && !error && (
        <Text accessibilityRole="progressbar">
          {ja ? '保存状態を読み込み中…' : 'Loading saved practice…'}
        </Text>
      )}
      {view && current && <PracticePanel flow={flow} locale={locale} />}
    </AppScreen>
  );
}
function RecoveryNotice({
  flow,
  locale,
}: {
  flow: ReturnType<typeof useForensic>;
  locale: Locale;
}) {
  const ja = locale === 'ja';
  return (
    <>
      {flow.error && (
        <View accessibilityRole="alert">
          <Text style={styles.error}>
            {ja
              ? '保存・復元を確認できませんでした。回答や点数は未確認のまま進めません。再試行してください。'
              : 'Save or recovery could not be confirmed. Progress has not been assumed. Retry the pending operation or reload.'}
          </Text>
          <ActionButton
            label={
              flow.pending
                ? ja
                  ? '同じ操作を再送'
                  : 'Retry same operation'
                : ja
                  ? '再読み込み'
                  : 'Reload'
            }
            disabled={flow.busy}
            onPress={() =>
              flow.pending ? void flow.send(flow.pending) : void flow.refresh()
            }
          />
          {flow.pending && (
            <ActionButton
              label={ja ? '保存済みの進捗を再確認' : 'Reload saved progress'}
              disabled={flow.busy}
              variant="secondary"
              onPress={() => void flow.refresh()}
            />
          )}
        </View>
      )}
    </>
  );
}
type Flow = ReturnType<typeof useForensic>;
type PanelProps = { flow: Flow; locale: Locale };
function PracticePanel({ flow, locale }: PanelProps) {
  const [picker, setPicker] = useState(false);
  const { view, current, pairs, locked } = flow;
  if (!view || !current) return null;
  const ja = locale === 'ja';
  const index = pairs.findIndex(
    ({ c, q }) => c.id === current.c.id && q.id === current.q.id
  );
  const next = pairs[index + 1];
  const currentKey = `${current.c.id}/${current.q.id}`;
  function select(c: string, q: string) {
    if (`${c}/${q}` !== currentKey) {
      flow.setCelebration(0);
      flow.setSelection(`${c}/${q}`);
      flow.setAnswer('');
      flow.setAnswerValues({});
      flow.setEvidenceIds([]);
      flow.setOpenedEvidence('');
    }
    setPicker(false);
  }
  return (
    <>
      <Text testID="practice-score">
        {ja ? '得点' : 'Score'}: {view.score} / {view.maxScore}
      </Text>
      <ActionButton
        label={
          (ja
            ? (['問題一覧から選ぶ', '問題に戻る'] as const)
            : (['Choose a question', 'Back to question'] as const))[
            picker ? 1 : 0
          ]
        }
        disabled={locked}
        variant="secondary"
        onPress={() => setPicker(!picker)}
      />
      {picker ? (
        <QuestionPicker flow={flow} locale={locale} select={select} />
      ) : (
        <>
          <Text
            accessibilityRole="header"
            testID="practice-question-title"
            style={styles.title}
          >
            {ja ? '問題' : 'Question'} {index + 1} / {pairs.length} ·{' '}
            {questionTitle(current.q.id, locale)}
            {current.q.solved ? ' ✓' : ''}
          </Text>
          <Text selectable testID="practice-prompt">
            {current.q.prompt[locale]}
          </Text>
          <EvidenceReader flow={flow} locale={locale} />
          <AnswerPanel flow={flow} locale={locale} />
          <PracticeFeedback flow={flow} locale={locale} />
          {current.q.solved && next && (
            <ActionButton
              label={ja ? '次の問題へ' : 'Next question'}
              disabled={locked}
              onPress={() => select(next.c.id, next.q.id)}
            />
          )}
          <HintsAndExplanation flow={flow} locale={locale} />
        </>
      )}
    </>
  );
}
function QuestionPicker({
  flow,
  locale,
  select,
}: PanelProps & { select(c: string, q: string): void }) {
  const ja = locale === 'ja';
  return (
    <View style={styles.stack}>
      {flow.pairs.map(({ c, q }, i) => (
        <Choice
          key={`${c.id}/${q.id}`}
          label={`${ja ? '問題' : 'Question'} ${i + 1} · ${questionTitle(q.id, locale)}${q.solved ? (ja ? ' · 解答済み' : ' · Solved') : ''}\n${questionSummary(q.id, locale)}`}
          selected={flow.current?.c.id === c.id && flow.current?.q.id === q.id}
          disabled={flow.locked}
          onPress={() => select(c.id, q.id)}
        />
      ))}
    </View>
  );
}
function EvidenceReader({ flow, locale }: PanelProps) {
  const [details, setDetails] = useState(false);
  const { current, evidence, setOpenedEvidence } = flow;
  if (!current) return null;
  const ja = locale === 'ja';
  return (
    <>
      <ActionButton
        label={
          details
            ? ja
              ? 'ケースの説明を閉じる'
              : 'Hide case briefing'
            : `${ja ? 'ケース' : 'Case'}: ${current.c.title[locale]}`
        }
        variant="secondary"
        onPress={() => setDetails(!details)}
      />
      {details && <Text selectable>{current.c.intro[locale]}</Text>}
      <Text style={styles.title}>
        {ja ? '証拠を読む' : 'Read the evidence'}
      </Text>
      <View testID="practice-files" style={styles.stack}>
        {current.c.evidence.map((e) => (
          <Choice
            key={e.id}
            label={`${e.id} · ${e.name}`}
            selected={evidence?.id === e.id}
            disabled={false}
            onPress={() => setOpenedEvidence(evidence?.id === e.id ? '' : e.id)}
          />
        ))}
      </View>
      {evidence && (
        <View style={styles.stack}>
          <Text selectable>{evidence.description[locale]}</Text>
          <Text selectable testID="practice-evidence" style={styles.code}>
            {evidence.content}
          </Text>
          <Text selectable>SHA-256: {evidence.sha256}</Text>
          <ActionButton
            label={ja ? '証拠を閉じて回答へ' : 'Close evidence and answer'}
            variant="secondary"
            onPress={() => setOpenedEvidence('')}
          />
        </View>
      )}
    </>
  );
}
function AnswerPanel({ flow, locale }: PanelProps) {
  const { current, locked, answer, evidenceIds, setAnswer, setEvidenceIds } =
    flow;
  if (!current) return null;
  const model = tapAnswer(current.c, current.q.id);
  const disabled = locked || current.q.solved;
  const ja = locale === 'ja';
  return (
    <>
      {model ? (
        <TapAnswer
          values={flow.answerValues}
          onValues={flow.setAnswerValues}
          form={model}
          locale={locale}
          disabled={disabled}
          onChange={setAnswer}
        />
      ) : (
        <>
          <Text selectable>{current.q.format[locale]}</Text>
          <TextInput
            accessibilityLabel={ja ? '回答' : 'Answer'}
            value={answer}
            onChangeText={setAnswer}
            editable={!disabled}
            multiline
            maxLength={512}
            style={styles.input}
          />
        </>
      )}
      <Text>
        {ja
          ? '結論を支える最小限の証拠を選ぶ（最大4つ）'
          : 'Choose the minimum supporting evidence (up to four)'}
      </Text>
      <View testID="practice-citations" style={styles.stack}>
        {current.c.evidence.map((e) => (
          <Choice
            key={e.id}
            label={`${e.id} · ${e.name}`}
            selected={evidenceIds.includes(e.id)}
            disabled={
              disabled ||
              (!evidenceIds.includes(e.id) && evidenceIds.length >= 4)
            }
            onPress={() =>
              setEvidenceIds((old) =>
                old.includes(e.id)
                  ? old.filter((id) => id !== e.id)
                  : [...old, e.id]
              )
            }
          />
        ))}
      </View>
      <ActionButton
        label={ja ? '回答と証拠を送信' : 'Submit answer and evidence'}
        disabled={disabled || !answer}
        onPress={() => flow.submit('answer')}
      />
    </>
  );
}
function PracticeFeedback({ flow, locale }: PanelProps) {
  const { view, current } = flow;
  const result = view?.lastResult;
  if (
    !result ||
    result.caseId !== current?.c.id ||
    result.questionId !== current.q.id
  )
    return null;
  return (
    <View testID="practice-result">
      {result.status === 'correct' ? (
        <CorrectReaction
          key={view.revision}
          label={result.message[locale]}
          active={flow.celebration > 0}
        />
      ) : (
        <Text accessibilityLiveRegion="polite">{result.message[locale]}</Text>
      )}
    </View>
  );
}
function HintsAndExplanation({ flow, locale }: PanelProps) {
  const [explanation, setExplanation] = useState(false);
  const { current, locked } = flow;
  if (!current) return null;
  const ja = locale === 'ja';
  return (
    <>
      {current.q.explanation && (
        <>
          <ActionButton
            label={
              explanation
                ? ja
                  ? '解説を閉じる'
                  : 'Hide explanation'
                : ja
                  ? '解説を見る'
                  : 'Read explanation'
            }
            variant="secondary"
            onPress={() => setExplanation(!explanation)}
          />
          {explanation && (
            <Text selectable>{current.q.explanation[locale]}</Text>
          )}
        </>
      )}
      <ActionButton
        label={ja ? '次の無料ヒント' : 'Next free hint'}
        disabled={locked || current.q.unlockedHints >= 3}
        variant="secondary"
        onPress={() => flow.submit('hint')}
      />
      {current.q.hints.map((hint, i) => (
        <Text selectable key={String(i)}>
          {hint[locale]}
        </Text>
      ))}
    </>
  );
}
const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  title: { color: colors.ink, fontWeight: '700', fontSize: 18 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    minHeight: 70,
    color: colors.ink,
  },
  code: { fontFamily: 'monospace', fontSize: 12, flexShrink: 1 },
  error: { color: colors.danger },
});
