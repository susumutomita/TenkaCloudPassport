import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ForensicPort } from '../../app/forensic/host';
import type { Locale } from '../../app/i18n/locale';
import type { LearningFilePort } from '../../app/learning/file-port';
import { catalogTitle, orderedCatalogs } from '../../app/learning/presentation';
import { PUBLISHED_CATALOGS } from '../../app/learning/published-catalogs';
import type { LearningStorage } from '../../app/learning/storage';
import {
  type LearningSelection,
  useLearning,
} from '../../app/learning/use-learning';
import type { GenerationPort } from '../../app/practice-generation/provider';
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
import { createRoundId } from '../../domain/session-identifiers';
import { webCryptoRandomBytes } from '../../protocol/web-crypto-random';
import { colors, spacing } from '../../ui/theme';
import ForensicScreen from '../forensic/ForensicScreen';
import { CatalogPicker } from './CatalogPicker';
import { LearningLesson } from './LearningLesson';
import PracticeGenerationPanel from './PracticeGenerationPanel';

interface Props {
  readonly generationProvider?: GenerationPort;
  readonly forensicHost?: ForensicPort;
  readonly storage: LearningStorage;
  readonly files: LearningFilePort;
  readonly locale: Locale;
  readonly onClose: () => void;
}
type Tab = 'library' | 'add' | 'review' | 'history' | 'files';
type Flow = ReturnType<typeof useLearning>;
export default function LearningScreen({
  generationProvider,
  forensicHost,
  storage,
  files,
  locale,
  onClose,
}: Props) {
  const [generationBusy, setGenerationBusy] = useState(false);
  const [practice, setPractice] = useState(false);
  const [created, setCreated] = useState<Catalog | null>(null);
  const flow = useLearning(storage, files);
  const uiFlow = { ...flow, busy: flow.busy || generationBusy };
  const ja = locale === 'ja';
  const screenKey = learningScreenKey(flow, created);
  const createdSaved = hasCreated(flow, created);
  if (practice && forensicHost)
    return (
      <ForensicScreen
        host={forensicHost}
        locale={locale}
        onClose={() => setPractice(false)}
      />
    );
  return (
    <AppScreen
      key={screenKey}
      eyebrow="Learning"
      title={ja ? '理解して使う' : 'Understand and apply'}
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
          ? '典型アルゴリズムとシステム設計を、理解から実装・類題へ。保存後はオフラインで学べます。'
          : 'Offline practice. Explanations are self-assessed; code is not executed or automatically graded. No mastery or interview outcome is guaranteed.'
      }
    >
      {created && !flow.selection && (
        <CreatedPractice
          catalog={created}
          flow={uiFlow}
          locale={locale}
          onDismiss={() => setCreated(null)}
        />
      )}
      <PracticeEntry
        provider={generationProvider}
        flow={uiFlow}
        onBusyChange={setGenerationBusy}
        locale={locale}
        onCatalog={(catalog) => {
          setCreated(catalog);
          flow.prepareCatalog(catalog);
        }}
        hidden={createdSaved}
      />
      {forensicHost && (
        <ActionButton
          label={
            ja
              ? '端末内でTenkaCloudの演習を開く'
              : 'Open on-device TenkaCloud practice'
          }
          disabled={flow.busy}
          onPress={() => setPractice(true)}
          variant="secondary"
        />
      )}
      {flow.message ? (
        <Text
          accessibilityRole={flow.messageKind === 'error' ? 'alert' : 'summary'}
          accessibilityLiveRegion="polite"
          style={flow.messageKind === 'error' ? styles.error : styles.notice}
        >
          {flow.message}
        </Text>
      ) : null}
      <LearningBody flow={uiFlow} locale={locale} />
    </AppScreen>
  );
}
function hasCreated(flow: Flow, created: Catalog | null): boolean {
  if (!created) return false;
  return (
    flow.state?.catalogs.some((c) => catalogKey(c) === catalogKey(created)) ??
    false
  );
}
function learningScreenKey(flow: Flow, created: Catalog | null): string {
  if (flow.selection && flow.state)
    return `${lessonKey(flow.selection.catalog, flow.selection.lesson)}-${currentProgress(flow.state, flow.selection.catalog, flow.selection.lesson)?.index ?? 0}`;
  if (flow.pending && created) return 'practice-preview';
  return hasCreated(flow, created) ? 'practice-ready' : 'home';
}
function PracticeEntry({
  provider,
  flow,
  locale,
  onCatalog,
  onBusyChange,
  hidden,
}: {
  readonly onBusyChange: (busy: boolean) => void;
  readonly onCatalog: (catalog: Catalog) => void;
  readonly hidden: boolean;
  readonly provider: GenerationPort | undefined;
  readonly flow: Flow;
  readonly locale: Locale;
}) {
  if (!provider || hidden || flow.selection || flow.pending) return null;
  return (
    <PracticeGenerationPanel
      provider={provider}
      locale={locale}
      disabled={flow.busy || !flow.state}
      onCatalog={onCatalog}
      onBusyChange={onBusyChange}
    />
  );
}
function CreatedPractice({
  catalog,
  flow,
  locale,
  onDismiss,
}: {
  catalog: Catalog;
  flow: Flow;
  locale: Locale;
  onDismiss(): void;
}) {
  const ja = locale === 'ja';
  const saved = flow.state?.catalogs.find(
    (c) => catalogKey(c) === catalogKey(catalog)
  );
  const proposed = flow.pending?.catalogs.some(
    (c) => catalogKey(c) === catalogKey(catalog)
  );
  if (!saved && !proposed) return null;
  return (
    <View style={styles.card} testID="created-practice">
      <Text style={styles.heading}>
        {saved
          ? ja
            ? '練習を開けます'
            : 'Your practice is ready'
          : ja
            ? '練習を作成しました・保存前の確認'
            : 'Practice created · review before saving'}
      </Text>
      {(saved ?? catalog).lessons.map((lesson) => (
        <View key={lesson.id} style={{ gap: spacing.sm }}>
          <Text selectable>{lesson.steps[0]?.prompt}</Text>
          {saved && (
            <ActionButton
              label={
                ja
                  ? `この問題を開く：${lesson.title}`
                  : `Open this question: ${lesson.title}`
              }
              disabled={flow.busy || !!flow.pending}
              onPress={() => {
                if (!flow.pending) void flow.open(saved, lesson);
              }}
            />
          )}
        </View>
      ))}
      {saved && (
        <ActionButton
          label={ja ? '別の練習を作る' : 'Create another practice'}
          disabled={flow.busy || !!flow.pending}
          variant="secondary"
          onPress={onDismiss}
        />
      )}
    </View>
  );
}
function LearningBody({
  flow,
  locale,
}: {
  readonly flow: Flow;
  readonly locale: Locale;
}) {
  if (flow.pending) return <PendingChanges flow={flow} />;
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
            createRoundId(webCryptoRandomBytes),
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
  const [tab, setTab] = useState<Tab>(
    state.catalogs.length ? 'library' : 'add'
  );
  const [focusedCatalog, setFocusedCatalog] = useState<string | null>(null);
  const labels =
    locale === 'ja'
      ? ['学習する', '教材を追加', '復習', '履歴', '保存管理']
      : ['Practice', 'Add lessons', 'Review', 'History', 'Saved data'];
  return (
    <>
      <View style={styles.tabs}>
        {(['library', 'add', 'review', 'history', 'files'] as const).map(
          (value, index) => (
            <View
              key={value}
              style={index < 2 ? styles.tab : styles.secondaryTab}
            >
              <ActionButton
                label={labels[index] ?? value}
                onPress={() => {
                  setTab(value);
                  setFocusedCatalog(null);
                  flow.setPending(null);
                }}
                disabled={flow.busy}
                variant={tab === value ? 'primary' : 'secondary'}
              />
            </View>
          )
        )}
      </View>
      {tab === 'library' || tab === 'review' ? (
        <LearningLibrary
          state={state}
          review={tab === 'review'}
          busy={flow.busy}
          onOpen={flow.open}
          focus={focusedCatalog}
        />
      ) : null}
      {tab === 'add' ? (
        <CatalogPicker
          flow={flow}
          locale={locale}
          onStudy={(catalogID) => {
            setFocusedCatalog(catalogID);
            setTab('library');
          }}
        />
      ) : null}
      {tab === 'library' ? (
        <ActionButton
          label={locale === 'ja' ? '教材を追加する' : 'Add lessons'}
          onPress={() => setTab('add')}
          disabled={flow.busy}
          variant="secondary"
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
      <Text>詳細：取得元と版を選ぶ</Text>
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
            {catalogTitle(source)} · {source.catalogID}
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
            {catalogTitle(catalog)} · {catalog.version}
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
  focus,
}: {
  readonly state: LearningState;
  readonly review: boolean;
  readonly busy: boolean;
  readonly onOpen: (catalog: Catalog, lesson: Lesson) => Promise<void>;
  readonly focus: string | null;
}) {
  const catalogs = orderedCatalogs(state.catalogs, focus).map((catalog) => ({
    catalog,
    lessons: catalog.lessons.filter(
      (lesson) => !review || currentProgress(state, catalog, lesson)?.review
    ),
  }));
  return (
    <>
      {state.catalogs.length === 0 ? (
        <Text>
          教材はまだありません。「教材を追加」からダウンロードしてください。保存後はオフラインで利用できます。
        </Text>
      ) : null}
      {review && catalogs.every((item) => item.lessons.length === 0) ? (
        <Text>復習対象はありません。 / Nothing to review.</Text>
      ) : null}
      {catalogs
        .filter((item) => item.lessons.length)
        .map(({ catalog, lessons }) => (
          <View key={catalogKey(catalog)} style={styles.card}>
            <Text style={styles.heading}>{catalogTitle(catalog)}</Text>
            <Text>
              保存済み · {catalog.lessons.length} 問 · v{catalog.version}
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
      label={`${progress ? (progress.completed ? '完了：' : '続きから：') : '学習を始める：'}${lesson.title}${suffix}`}
      disabled={busy}
      onPress={() => void onOpen(catalog, lesson)}
      variant="secondary"
    />
  );
}
const styles = StyleSheet.create({
  notice: { color: colors.successText, fontSize: 16 },
  error: { color: colors.danger, fontSize: 16 },
  heading: { color: colors.ink, fontSize: 21, fontWeight: '700' },
  tabs: { gap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap' },
  tab: { flexBasis: 180, flexGrow: 1, minWidth: 0 },
  secondaryTab: { flexBasis: 140, flexGrow: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
