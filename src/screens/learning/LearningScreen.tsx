import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Locale } from '../../app/i18n/locale';
import type { LearningFilePort } from '../../app/learning/file-port';
import { PUBLISHED_CATALOGS } from '../../app/learning/published-catalogs';
import type { LearningStorage } from '../../app/learning/storage';
import {
  type LearningSelection,
  useLearning,
} from '../../app/learning/use-learning';
import ActionButton from '../../components/ActionButton';
import AppScreen from '../../components/AppScreen';
import {
  type Catalog,
  catalogKey,
  type LearningState,
  type Lesson,
  lessonKey,
} from '../../domain/learning/model';
import {
  advance,
  answer,
  currentProgress,
  startLesson,
} from '../../domain/learning/transitions';
import { colors, spacing } from '../../ui/theme';
import { LearningLesson } from './LearningLesson';

interface Props {
  readonly storage: LearningStorage;
  readonly files: LearningFilePort;
  readonly locale: Locale;
  readonly onClose: () => void;
}
type Tab = 'library' | 'review' | 'history' | 'files';
type Flow = ReturnType<typeof useLearning>;
export default function LearningScreen({
  storage,
  files,
  locale,
  onClose,
}: Props) {
  const flow = useLearning(storage, files);
  const ja = locale === 'ja';
  const screenKey =
    flow.selection && flow.state
      ? `${lessonKey(flow.selection.catalog, flow.selection.lesson)}-${currentProgress(flow.state, flow.selection.catalog, flow.selection.lesson)?.index ?? 0}`
      : 'home';
  return (
    <AppScreen
      key={screenKey}
      eyebrow="Learning"
      title={ja ? '考え方を組み立てる' : 'Build your reasoning'}
      footer={
        <ActionButton
          label={ja ? 'Passport に戻る' : 'Back to Passport'}
          disabled={flow.busy}
          onPress={onClose}
          variant="secondary"
        />
      }
      description={
        ja
          ? 'オフラインで練習。自由説明は自己評価です。コードは実行・自動採点しません。習得や面接合格を保証しません。'
          : 'Offline practice. Explanations are self-assessed; code is not executed or automatically graded. No mastery or interview outcome is guaranteed.'
      }
    >
      {flow.message ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {flow.message}
        </Text>
      ) : null}
      <LearningBody flow={flow} locale={locale} />
    </AppScreen>
  );
}
function LearningBody({
  flow,
  locale,
}: {
  readonly flow: Flow;
  readonly locale: Locale;
}) {
  if (!flow.state)
    return (
      <>
        <Text>読み込み待ち / Waiting for saved data</Text>
        <ActionButton
          label="再読み込み / Retry"
          disabled={flow.busy}
          onPress={() => void flow.load()}
        />
        <Text>
          破損時は、学習バックアップを確認して復元できます。カードなどの既存データには触れません。
        </Text>
        <ActionButton
          label="学習 JSON から復元 / Restore backup"
          disabled={flow.busy}
          onPress={() => void flow.pick('backup')}
        />
        <PendingChanges flow={flow} />
      </>
    );
  if (flow.selection)
    return <Study flow={flow} state={flow.state} selection={flow.selection} />;
  return <LearningHome flow={flow} state={flow.state} locale={locale} />;
}
function Study({
  flow,
  state,
  selection,
}: {
  readonly flow: Flow;
  readonly state: LearningState;
  readonly selection: LearningSelection;
}) {
  const { catalog, lesson } = selection;
  const progress = currentProgress(state, catalog, lesson);
  const step = lesson.steps[progress?.index ?? 0];
  function record(choiceID: string | null, selfReady?: boolean) {
    if (!progress || !step) return;
    const request = {
      key: progress.key,
      session: progress.session,
      stepID: step.id,
      choiceID,
      ...(selfReady === undefined ? {} : { selfReady }),
      timestamp: Date.now(),
    };
    void flow.commit((current) => answer(current, request));
  }
  function next() {
    if (progress && step)
      void flow.commit((current) =>
        advance(current, progress.key, progress.session, step.id)
      );
  }
  return (
    <LearningLesson
      state={state}
      catalog={catalog}
      lesson={lesson}
      busy={flow.busy}
      onAnswer={record}
      onNext={next}
      onRestart={() =>
        void flow.commit((current) =>
          startLesson(
            current,
            lessonKey(catalog, lesson),
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            true
          )
        )
      }
      onBack={() => flow.setSelection(null)}
    />
  );
}
function LearningHome({
  flow,
  state,
  locale,
}: {
  readonly flow: Flow;
  readonly state: LearningState;
  readonly locale: Locale;
}) {
  const [tab, setTab] = useState<Tab>('library');
  const labels =
    locale === 'ja'
      ? ['教材', '復習', '履歴', 'JSON 管理']
      : ['Lessons', 'Review', 'History', 'JSON'];
  return (
    <>
      <View style={styles.tabs}>
        {(['library', 'review', 'history', 'files'] as const).map(
          (value, index) => (
            <ActionButton
              key={value}
              label={labels[index] ?? value}
              onPress={() => {
                setTab(value);
                flow.setPending(null);
              }}
              disabled={flow.busy}
              variant={tab === value ? 'primary' : 'secondary'}
            />
          )
        )}
      </View>
      {tab === 'library' || tab === 'review' ? (
        <LearningLibrary
          state={state}
          review={tab === 'review'}
          busy={flow.busy}
          onOpen={flow.open}
        />
      ) : null}
      {tab === 'history' ? <History state={state} /> : null}
      {tab === 'files' ? <FileManagement flow={flow} /> : null}
    </>
  );
}
function RemoteCatalogs({ flow }: { readonly flow: Flow }) {
  const [url, setURL] = useState<string>(PUBLISHED_CATALOGS[0].manifestURL);
  return (
    <>
      <Text>公開教材を選択（v2026.10.1301）</Text>
      {PUBLISHED_CATALOGS.map((catalog) => (
        <ActionButton
          key={catalog.manifestURL}
          label={`取得元を選ぶ: ${catalog.title}`}
          disabled={flow.busy}
          onPress={() => setURL(catalog.manifestURL)}
        />
      ))}
      <Text>取得元 manifest URL（HTTPS・raw.githubusercontent.com）</Text>
      <TextInput
        accessibilityLabel="Catalog manifest URL"
        value={url}
        onChangeText={setURL}
        editable={!flow.busy}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.card}
      />
      <ActionButton
        label="取得元を登録・更新 / Fetch manifest"
        disabled={flow.busy || !url}
        onPress={() => void flow.retrieve(url)}
      />
      <ActionButton
        label="取得を中断 / Cancel download"
        disabled={!flow.busy}
        onPress={flow.cancelDownload}
      />
      {flow.state?.sources?.map((source) => (
        <View key={source.manifestURL} style={styles.card}>
          <Text>
            {source.title} · {source.catalogID}
          </Text>
          <ActionButton
            label="版一覧を更新 / Refresh versions"
            disabled={flow.busy}
            onPress={() => void flow.retrieve(source.manifestURL)}
          />
          {source.releases.map((release) => (
            <ActionButton
              key={release.version}
              label={`v${release.version} を取得・固定 / Download pinned version`}
              disabled={flow.busy}
              onPress={() =>
                void flow.retrieve(source.manifestURL, source, release)
              }
            />
          ))}
        </View>
      ))}
    </>
  );
}
function FileManagement({ flow }: { readonly flow: Flow }) {
  const { busy } = flow;
  return (
    <>
      <RemoteCatalogs flow={flow} />
      <Text>
        教材は ID
        と版ごとに保持します。同じ版の内容差し替えは拒否します。復元は学習履歴を置き換えます。自己紹介・QR・会話データは含みません。
        / Learning-only backup; restore replaces learning history.
      </Text>
      <ActionButton
        label="教材 JSON を追加 / Import catalog"
        disabled={busy}
        onPress={() => void flow.pick('catalog')}
      />
      <ActionButton
        label="学習 JSON を書き出す / Export backup"
        disabled={busy}
        onPress={() => void flow.exportFile()}
      />
      <ActionButton
        label="学習 JSON から復元 / Restore backup"
        disabled={busy}
        onPress={() => void flow.pick('backup')}
        variant="secondary"
      />
      {flow.state?.catalogs.map((catalog) => (
        <View key={catalogKey(catalog)} style={styles.card}>
          <Text>
            {catalog.title} · {catalog.version}
          </Text>
          <ActionButton
            label="この版の教材と履歴を削除 / Remove this catalog & history"
            disabled={busy}
            onPress={() => flow.prepareRemoval(catalog)}
            variant="danger"
          />
        </View>
      ))}
      <PendingChanges flow={flow} />
    </>
  );
}
function PendingChanges({ flow }: { readonly flow: Flow }) {
  const { pending, busy } = flow;
  return (
    <>
      {pending ? (
        <View style={styles.card}>
          <Text>
            適用前の確認 / Confirm changes: {pending.catalogs.length} catalogs ·{' '}
            {pending.progress.length} progress · {pending.attempts.length}{' '}
            attempts
          </Text>
          <ActionButton
            label="この内容を保存 / Apply"
            disabled={busy}
            onPress={() => void flow.apply()}
          />
          <ActionButton
            label="キャンセル / Cancel"
            disabled={busy}
            variant="secondary"
            onPress={() => flow.setPending(null)}
          />
        </View>
      ) : null}
    </>
  );
}
function History({ state }: { readonly state: LearningState }) {
  return (
    <>
      <Text style={styles.heading}>
        回答履歴 / Answer history · {state.attempts.length}
      </Text>
      {state.attempts.length === 0 ? (
        <Text>まだ履歴がありません。 / No attempts yet.</Text>
      ) : null}
      {state.attempts
        .slice(-100)
        .reverse()
        .map((attempt) => (
          <View key={attempt.id} style={styles.card}>
            <Text>
              {attempt.key} · {attempt.stepID}
            </Text>
            <Text>
              {new Date(attempt.timestamp).toLocaleString()} · {attempt.result}
            </Text>
          </View>
        ))}
      {state.attempts.length > 100 ? (
        <Text>
          画面は直近100件。最大1万件の履歴を保持し、それ以前は順次消えます。保存中の全履歴は
          JSON に含まれます。
        </Text>
      ) : null}
    </>
  );
}
function LearningLibrary({
  state,
  review,
  busy,
  onOpen,
}: {
  readonly state: LearningState;
  readonly review: boolean;
  readonly busy: boolean;
  readonly onOpen: (catalog: Catalog, lesson: Lesson) => Promise<void>;
}) {
  const catalogs = state.catalogs.map((catalog) => ({
    catalog,
    lessons: catalog.lessons.filter(
      (lesson) => !review || currentProgress(state, catalog, lesson)?.review
    ),
  }));
  return (
    <>
      {state.catalogs.length === 0 ? (
        <Text>
          教材はまだありません。「JSON
          管理」で取得元を登録・取得してください。保存後はオフラインで利用できます。
        </Text>
      ) : null}
      {review && catalogs.every((item) => item.lessons.length === 0) ? (
        <Text>復習対象はありません。 / Nothing to review.</Text>
      ) : null}
      {catalogs
        .filter((item) => item.lessons.length)
        .map(({ catalog, lessons }) => (
          <View key={catalogKey(catalog)} style={styles.card}>
            <Text style={styles.heading}>{catalog.title}</Text>
            <Text>
              {catalog.catalogID} · v{catalog.version}
            </Text>
            {lessons.map((lesson) => (
              <LessonLink
                key={lesson.id}
                state={state}
                catalog={catalog}
                lesson={lesson}
                busy={busy}
                onOpen={onOpen}
              />
            ))}
          </View>
        ))}
    </>
  );
}
function LessonLink({
  state,
  catalog,
  lesson,
  busy,
  onOpen,
}: {
  readonly state: LearningState;
  readonly catalog: Catalog;
  readonly lesson: Lesson;
  readonly busy: boolean;
  readonly onOpen: (catalog: Catalog, lesson: Lesson) => Promise<void>;
}) {
  const progress = currentProgress(state, catalog, lesson);
  let suffix = '';
  if (progress)
    suffix = progress.completed
      ? ' ✓'
      : ` · ${progress.index + 1}/${lesson.steps.length}`;
  return (
    <ActionButton
      label={`${lesson.title}${suffix}`}
      disabled={busy}
      onPress={() => void onOpen(catalog, lesson)}
      variant="secondary"
    />
  );
}
const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 16 },
  heading: { color: colors.ink, fontSize: 21, fontWeight: '700' },
  tabs: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
