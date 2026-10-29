import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
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
import {
  CaseNavigation,
  casebookColors,
  caseTitle,
  QuestionNavigation,
} from './CaseNavigation';
import TapAnswer, { Choice } from './TapAnswer';
import { type AnswerValues, questionTitle, tapAnswer } from './tap-answer';

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
  const evidence =
    current?.c.evidence.find((e) => e.id === openedEvidence) ??
    current?.c.evidence[0];
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
      compact
      maxWidth={1120}
      eyebrow={
        ja ? '調査室 · 端末内の練習' : 'Forensic casebook · on-device practice'
      }
      title={ja ? '証拠から、結論へ。' : 'From evidence to conclusion.'}
      description={
        ja
          ? '4つの架空の事件を、端末内で調査します。'
          : 'Investigate four fictional cases on this device.'
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
function usePracticeNavigation(flow: Flow) {
  const [picker, setPicker] = useState(false);
  const [pane, setPane] = useState<'records' | 'answer'>('records');
  const dimensions = useWindowDimensions();
  const wide = dimensions.width >= 850 && dimensions.fontScale < 1.6;
  const index = flow.pairs.findIndex(
    ({ c, q }) => c.id === flow.current?.c.id && q.id === flow.current?.q.id
  );
  const key = flow.current ? `${flow.current.c.id}/${flow.current.q.id}` : '';
  function select(c: string, q: string) {
    if (`${c}/${q}` !== key) {
      flow.setCelebration(0);
      flow.setSelection(`${c}/${q}`);
      flow.setAnswer('');
      flow.setAnswerValues({});
      flow.setEvidenceIds([]);
      flow.setOpenedEvidence('');
      setPane('records');
    }
    setPicker(false);
  }
  function showPane(value: 'records' | 'answer') {
    if (value === 'records') flow.setCelebration(0);
    setPane(value);
  }
  return {
    picker,
    pane,
    wide,
    index,
    next: flow.pairs[index + 1],
    select,
    showPane,
    togglePicker: () => {
      flow.setCelebration(0);
      setPicker(!picker);
    },
  };
}
type Navigation = ReturnType<typeof usePracticeNavigation>;
type WorkspaceProps = PanelProps & { nav: Navigation };
function PracticePanel({ flow, locale }: PanelProps) {
  const nav = usePracticeNavigation(flow);
  if (!flow.view || !flow.current) return null;
  return (
    <View style={styles.casebook}>
      <PracticeOverview flow={flow} locale={locale} nav={nav} />
      {nav.picker ? (
        <QuestionNavigation
          cases={flow.view.cases}
          currentCase={flow.current.c.id}
          currentQuestion={flow.current.q.id}
          locale={locale}
          disabled={flow.locked}
          onSelect={nav.select}
        />
      ) : (
        <PracticeWorkspace flow={flow} locale={locale} nav={nav} />
      )}
      <Text style={styles.caption}>
        {locale === 'ja'
          ? '練習の得点は本戦へ送信されません。'
          : 'Practice points are not sent to a competition.'}
      </Text>
    </View>
  );
}
function PracticeOverview({ flow, locale, nav }: WorkspaceProps) {
  const { view, current } = flow;
  if (!view || !current) return null;
  const ja = locale === 'ja';
  const labels = {
    open: ja ? '問題一覧から選ぶ' : 'Choose a question',
    close: ja ? '問題に戻る' : 'Back to question',
  };
  return (
    <>
      <View style={styles.overview}>
        <Text style={styles.caption}>
          {ja ? '事件を選ぶ' : 'Choose a case'}
        </Text>
        <Text testID="practice-score" style={styles.score}>
          {ja ? '得点' : 'Score'}: {view.score} / {view.maxScore}
        </Text>
      </View>
      <CaseNavigation
        cases={view.cases}
        selected={current.c.id}
        locale={locale}
        disabled={flow.locked}
        onSelect={(c) => {
          const q = c.questions[0];
          if (q) nav.select(c.id, q.id);
        }}
      />
      <ActionButton
        label={nav.picker ? labels.close : labels.open}
        disabled={flow.locked}
        variant="secondary"
        onPress={nav.togglePicker}
      />
    </>
  );
}
function CurrentQuestion({ flow, locale, nav }: WorkspaceProps) {
  const { current } = flow;
  if (!current) return null;
  const ja = locale === 'ja';
  const solved = ja ? ' · 解決済み' : ' · Solved';
  return (
    <View style={styles.questionHeading}>
      <Text style={styles.caption}>{caseTitle(current.c.title[locale])}</Text>
      <Text
        accessibilityRole="header"
        testID="practice-question-title"
        style={styles.questionTitle}
      >
        {ja ? '問題' : 'Question'} {nav.index + 1} / {flow.pairs.length} ·{' '}
        {questionTitle(current.q.id, locale)}
        {current.q.solved ? solved : ''}
      </Text>
      <Text selectable testID="practice-prompt" style={styles.prompt}>
        {current.q.prompt[locale]}
      </Text>
    </View>
  );
}
function PaneNavigation({ locale, nav }: WorkspaceProps) {
  const labels =
    locale === 'ja'
      ? ['記録を読む', '結論と根拠']
      : ['Read the records', 'Conclusion and evidence'];
  return (
    <View style={styles.panes}>
      {(['records', 'answer'] as const).map((pane, index) => (
        <Pressable
          key={pane}
          accessibilityRole="button"
          accessibilityState={{ selected: nav.pane === pane }}
          aria-selected={nav.pane === pane}
          onPress={() => nav.showPane(pane)}
          style={[styles.pane, nav.pane === pane && styles.activePane]}
        >
          <Text
            style={[
              styles.paneLabel,
              nav.pane === pane && styles.activePaneLabel,
            ]}
          >
            {labels[index]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function PracticeWorkspace(props: WorkspaceProps) {
  const { flow, locale, nav } = props;
  return (
    <>
      <CurrentQuestion {...props} />
      {!nav.wide && <PaneNavigation {...props} />}
      <View style={[styles.workspace, nav.wide && styles.wideWorkspace]}>
        {(nav.wide || nav.pane === 'records') && (
          <View style={[styles.card, nav.wide && styles.wideCard]}>
            <EvidenceReader
              flow={flow}
              locale={locale}
              {...(!nav.wide ? { onAnswer: () => nav.showPane('answer') } : {})}
            />
          </View>
        )}
        {(nav.wide || nav.pane === 'answer') && <PracticeAnswer {...props} />}
      </View>
    </>
  );
}
function PracticeAnswer({ flow, locale, nav }: WorkspaceProps) {
  const { current } = flow;
  if (!current) return null;
  const next = nav.next;
  const ja = locale === 'ja';
  return (
    <View
      style={[styles.card, nav.wide && styles.wideCard]}
      testID="practice-answer-panel"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {ja ? 'あなたの結論' : 'Your conclusion'}
      </Text>
      <AnswerPanel
        flow={flow}
        locale={locale}
        onInteraction={() => nav.showPane('answer')}
      />
      <PracticeFeedback flow={flow} locale={locale} />
      {current.q.solved && next && (
        <ActionButton
          label={ja ? '次の問題へ' : 'Next question'}
          disabled={flow.locked}
          onPress={() => nav.select(next.c.id, next.q.id)}
        />
      )}
      <HintsAndExplanation flow={flow} locale={locale} />
    </View>
  );
}
function EvidenceReader({
  flow,
  locale,
  onAnswer,
}: PanelProps & { onAnswer?: () => void }) {
  const [details, setDetails] = useState(false);
  const [fileInfo, setFileInfo] = useState(false);
  const { current, evidence, setOpenedEvidence } = flow;
  if (!current) return null;
  const ja = locale === 'ja';
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        {ja ? '記録を読む' : 'Read the records'}
      </Text>
      <View testID="practice-files" style={styles.files}>
        {current.c.evidence.map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityLabel={`${e.id} · ${e.name}`}
            accessibilityState={{ selected: evidence?.id === e.id }}
            aria-selected={evidence?.id === e.id}
            onPress={() => {
              setOpenedEvidence(e.id);
              setFileInfo(false);
            }}
            style={[styles.file, evidence?.id === e.id && styles.activeFile]}
          >
            <Text style={styles.fileName}>
              {e.id} · {e.name}
            </Text>
            {evidence?.id === e.id && (
              <Text style={styles.fileStatus}>{ja ? '表示中' : 'Open'}</Text>
            )}
          </Pressable>
        ))}
      </View>
      {evidence && (
        <>
          <Text selectable style={styles.caption}>
            {evidence.description[locale]}
          </Text>
          <ScrollView
            nestedScrollEnabled
            style={styles.record}
            testID="practice-record-scroll"
            accessibilityLabel={evidence.name}
          >
            <Text selectable testID="practice-evidence" style={styles.code}>
              {evidence.content}
            </Text>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: fileInfo }}
            onPress={() => setFileInfo(!fileInfo)}
            style={styles.detailsButton}
          >
            <Text style={styles.link}>
              {ja ? 'ファイル情報' : 'File details'}
            </Text>
          </Pressable>
          {fileInfo && (
            <Text selectable style={styles.caption}>
              SHA-256: {evidence.sha256}
            </Text>
          )}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: details }}
        onPress={() => setDetails(!details)}
        style={styles.detailsButton}
      >
        <Text style={styles.link}>{ja ? '事件の背景' : 'Case briefing'}</Text>
      </Pressable>
      {details && <Text selectable>{current.c.intro[locale]}</Text>}
      {onAnswer && (
        <ActionButton
          label={ja ? '結論と根拠へ' : 'Continue to conclusion'}
          onPress={onAnswer}
        />
      )}
    </>
  );
}
function AnswerPanel({
  flow,
  locale,
  onInteraction,
}: PanelProps & { onInteraction(): void }) {
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
          onValues={(value) => {
            onInteraction();
            flow.setAnswerValues(value);
          }}
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
            onChangeText={(value) => {
              onInteraction();
              setAnswer(value);
            }}
            editable={!disabled}
            multiline
            maxLength={512}
            style={styles.input}
          />
        </>
      )}
      <Text>
        {ja
          ? 'この答えを支える証拠（最大4つ）'
          : 'Evidence supporting this answer (up to four)'}
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
            onPress={() => {
              onInteraction();
              setEvidenceIds((old) =>
                old.includes(e.id)
                  ? old.filter((id) => id !== e.id)
                  : [...old, e.id]
              );
            }}
          />
        ))}
      </View>
      <ActionButton
        label={ja ? '答えを確かめる' : 'Check answer'}
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
        label={ja ? '次のヒント' : 'Next hint'}
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
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
    flexShrink: 1,
    color: '#e3eeeb',
    padding: 14,
  },
  casebook: { gap: 14, minWidth: 0 },
  overview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  caption: { color: casebookColors.muted, fontSize: 13, lineHeight: 21 },
  score: {
    color: casebookColors.teal,
    fontWeight: '700',
    backgroundColor: casebookColors.selected,
    padding: 8,
    borderRadius: 8,
  },
  questionHeading: { gap: 8 },
  questionTitle: {
    fontSize: 20,
    lineHeight: 28,
    color: casebookColors.ink,
    fontWeight: '700',
  },
  prompt: { color: casebookColors.ink, fontSize: 16, lineHeight: 25 },
  panes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pane: {
    flexGrow: 1,
    flexBasis: 130,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: casebookColors.line,
    borderRadius: 10,
    padding: 10,
  },
  activePane: {
    backgroundColor: casebookColors.ink,
    borderColor: casebookColors.ink,
  },
  paneLabel: { color: casebookColors.ink, fontSize: 15, fontWeight: '700' },
  activePaneLabel: { color: '#ffffff' },
  workspace: { gap: 16, minWidth: 0 },
  wideWorkspace: { flexDirection: 'row', alignItems: 'flex-start' },
  wideCard: { flexBasis: 0 },
  card: {
    flexGrow: 1,
    minWidth: 0,
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: casebookColors.line,
    backgroundColor: casebookColors.paper,
  },
  files: { gap: 6, flexDirection: 'row', flexWrap: 'wrap' },
  file: {
    minHeight: 48,
    minWidth: 0,
    flexGrow: 1,
    flexBasis: 140,
    gap: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: casebookColors.line,
    borderRadius: 8,
  },
  activeFile: {
    backgroundColor: casebookColors.selected,
    borderColor: casebookColors.teal,
  },
  fileName: { fontSize: 12, color: casebookColors.ink, fontWeight: '600' },
  fileStatus: { fontSize: 11, color: casebookColors.teal },
  record: { maxHeight: 280, borderRadius: 10, backgroundColor: '#122b34' },
  detailsButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: casebookColors.teal, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger },
});
