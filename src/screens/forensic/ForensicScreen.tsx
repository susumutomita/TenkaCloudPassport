import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ForensicPort } from '../../app/forensic/host';
import type { Locale } from '../../app/i18n/locale';
import ActionButton from '../../components/ActionButton';
import AppScreen from '../../components/AppScreen';
import type {
  Operation,
  Projection,
} from '../../domain/forensic/upstream/types';
import { createRoundId } from '../../domain/session-identifiers';
import { webCryptoRandomBytes } from '../../protocol/web-crypto-random';
import { colors, spacing } from '../../ui/theme';

function useForensic(host: ForensicPort) {
  const [view, setView] = useState<Projection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [selection, setSelection] = useState('');
  const [answer, setAnswer] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [pending, setPending] = useState<Operation | null>(null);
  const [openedEvidence, setOpenedEvidence] = useState('');
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
      setView(await host.submit(operation));
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
    answer,
    evidenceIds,
    refresh,
    send,
    submit,
    setSelection,
    setAnswer,
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
  const { view, busy, error, pending, current, refresh, send } = flow;
  return (
    <AppScreen
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
      {error && (
        <View accessibilityRole="alert">
          <Text style={styles.error}>
            {ja
              ? '保存・復元を確認できませんでした。回答や点数は未確認のまま進めません。再試行してください。'
              : 'Save or recovery could not be confirmed. Progress has not been assumed. Retry the pending operation or reload.'}
          </Text>
          <ActionButton
            label={
              pending
                ? ja
                  ? '同じ操作を再送'
                  : 'Retry same operation'
                : ja
                  ? '再読み込み'
                  : 'Reload'
            }
            disabled={busy}
            onPress={() => (pending ? void send(pending) : void refresh())}
          />
          {pending && (
            <ActionButton
              label={ja ? '保存済みの進捗を再確認' : 'Reload saved progress'}
              disabled={busy}
              variant="secondary"
              onPress={() => void refresh()}
            />
          )}
        </View>
      )}
      {!view && !error && (
        <Text accessibilityRole="progressbar">
          {ja ? '保存状態を読み込み中…' : 'Loading saved practice…'}
        </Text>
      )}
      {view && current && <PracticePanel flow={flow} locale={locale} />}
    </AppScreen>
  );
}
function PracticePanel({
  flow,
  locale,
}: {
  flow: ReturnType<typeof useForensic>;
  locale: Locale;
}) {
  const ja = locale === 'ja';
  const {
    view,
    current,
    pairs,
    locked,
    evidence,
    answer,
    evidenceIds,
    submit,
    setSelection,
    setAnswer,
    setEvidenceIds,
    setOpenedEvidence,
  } = flow;
  if (!view || !current) return null;
  return (
    <>
      <Text testID="practice-score">
        {ja ? '得点' : 'Score'}: {view.score} / {view.maxScore}
      </Text>
      <View style={styles.wrap}>
        {pairs.map(({ c, q }, index) => (
          <ActionButton
            key={`${c.id}/${q.id}`}
            label={`${index + 1}${q.solved ? ' ✓' : ''}`}
            disabled={locked}
            variant="secondary"
            onPress={() => {
              setSelection(`${c.id}/${q.id}`);
              setAnswer('');
              setEvidenceIds([]);
              setOpenedEvidence('');
            }}
          />
        ))}
      </View>
      <Text style={styles.title}>{current.c.title[locale]}</Text>
      <Text>{current.c.intro[locale]}</Text>
      <View style={styles.wrap}>
        {current.c.evidence.map((e) => (
          <ActionButton
            key={e.id}
            label={`${e.id} · ${e.name}`}
            variant="secondary"
            onPress={() => setOpenedEvidence(e.id)}
          />
        ))}
      </View>
      {evidence && (
        <View>
          <Text>{evidence.description[locale]}</Text>
          <Text selectable testID="practice-evidence" style={styles.code}>
            {evidence.content}
          </Text>
          <Text selectable>SHA-256: {evidence.sha256}</Text>
        </View>
      )}
      <Text style={styles.title}>{current.q.prompt[locale]}</Text>
      <Text>{current.q.format[locale]}</Text>
      <Text>{ja ? '引用する証拠を選択' : 'Select supporting evidence'}</Text>
      <View style={styles.wrap}>
        {current.c.evidence.map((e) => (
          <ActionButton
            key={e.id}
            label={`${evidenceIds.includes(e.id) ? '✓ ' : ''}${e.id}`}
            variant="secondary"
            disabled={
              locked ||
              current.q.solved ||
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
      <TextInput
        accessibilityLabel={ja ? '回答' : 'Answer'}
        value={answer}
        onChangeText={setAnswer}
        editable={!locked && !current.q.solved}
        multiline
        maxLength={512}
        style={styles.input}
      />
      <ActionButton
        label={ja ? '回答と証拠を送信' : 'Submit answer and evidence'}
        disabled={locked || current.q.solved || answer.length === 0}
        onPress={() => submit('answer')}
      />
      <ActionButton
        label={ja ? '次の無料ヒント' : 'Next free hint'}
        disabled={locked || current.q.unlockedHints >= 3}
        variant="secondary"
        onPress={() => submit('hint')}
      />
      {current.q.hints.map((hint, i) => (
        <Text key={String(i)}>{hint[locale]}</Text>
      ))}
      {view.lastResult && (
        <Text accessibilityLiveRegion="polite" testID="practice-result">
          {view.lastResult.message[locale]}
        </Text>
      )}
      {current.q.explanation && <Text>{current.q.explanation[locale]}</Text>}
    </>
  );
}
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { fontWeight: '700', fontSize: 18 },
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
