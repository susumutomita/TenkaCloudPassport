import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Locale } from '../../app/i18n/locale';
import { PUBLISHED_CATALOGS } from '../../app/learning/published-catalogs';
import type { useLearning } from '../../app/learning/use-learning';
import ActionButton from '../../components/ActionButton';
import { colors, spacing } from '../../ui/theme';

type Flow = ReturnType<typeof useLearning>;
const LABELS = {
  ja: {
    title: '教材を選んで保存',
    steps: '① 選ぶ → ② ダウンロード → ③ 学習',
    choose: 'ほかの教材を選ぶ',
    close: '教材の選択を閉じる',
    saved: '✓ 保存済み・オフラインで学習できます',
    empty: '未ダウンロード・最初の取得には通信が必要です',
    downloading: 'ダウンロード中…',
    saving: '端末に保存中…',
    start: '保存した教材で学習を始める',
    download: 'ダウンロードして保存',
    update: '教材の更新を確認して保存',
    cancel: 'ダウンロードを中断',
    retry: 'もう一度ダウンロード',
    note: '保存した教材と進捗は更新後も残ります。独自の練習教材で、公式問題・過去問ではありません。',
  },
  en: {
    title: 'Choose and save lessons',
    steps: '1. Choose → 2. Download → 3. Practice',
    choose: 'Choose another catalog',
    close: 'Close choices',
    saved: '✓ Saved; available offline',
    empty: 'Not downloaded; connect to save lessons',
    downloading: 'Downloading…',
    saving: 'Saving on your device…',
    start: 'Start with saved lessons',
    download: 'Download and save',
    update: 'Check for updates',
    cancel: 'Cancel download',
    retry: 'Retry download',
    note: 'Updates keep saved versions and progress. Original exercises, not official or past exam questions.',
  },
};
type Labels = (typeof LABELS)[Locale];
type PublishedCatalog = (typeof PUBLISHED_CATALOGS)[number];

export function CatalogPicker({
  flow,
  locale,
  onStudy,
}: {
  readonly flow: Flow;
  readonly locale: Locale;
  readonly onStudy: (catalogID: string) => void;
}) {
  const [selected, setSelected] = useState<string>(
    PUBLISHED_CATALOGS[0].catalogID
  );
  const [choosing, setChoosing] = useState(false);
  const catalog =
    PUBLISHED_CATALOGS.find((item) => item.catalogID === selected) ??
    PUBLISHED_CATALOGS[0];
  const saved =
    flow.state?.catalogs.some((item) => item.catalogID === catalog.catalogID) ??
    false;
  const t = LABELS[locale];
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{t.title}</Text>
      <Text>{t.steps}</Text>
      <Text style={styles.heading}>{catalog.title}</Text>
      <Text style={styles.body}>{catalog.description}</Text>
      <CatalogDownloadActions
        key={catalog.catalogID}
        flow={flow}
        catalog={catalog}
        saved={saved}
        t={t}
        onStudy={() => onStudy(catalog.catalogID)}
      />
      <ActionButton
        label={choosing ? t.close : t.choose}
        disabled={flow.busy}
        variant="secondary"
        onPress={() => setChoosing(!choosing)}
      />
      {choosing ? (
        <CatalogChoices
          selected={selected}
          busy={flow.busy}
          onSelect={(id) => {
            setSelected(id);
            setChoosing(false);
          }}
        />
      ) : null}
      <Text style={styles.note}>{t.note}</Text>
    </View>
  );
}
function CatalogChoices({
  selected,
  busy,
  onSelect,
}: {
  readonly selected: string;
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <>
      {PUBLISHED_CATALOGS.map((item) => (
        <ActionButton
          key={item.catalogID}
          label={`${selected === item.catalogID ? '✓ ' : ''}${item.title}`}
          disabled={busy}
          variant={selected === item.catalogID ? 'primary' : 'secondary'}
          onPress={() => onSelect(item.catalogID)}
        />
      ))}
    </>
  );
}
function CatalogDownloadActions({
  flow,
  catalog,
  saved,
  t,
  onStudy,
}: {
  readonly flow: Flow;
  readonly catalog: PublishedCatalog;
  readonly saved: boolean;
  readonly t: Labels;
  readonly onStudy: () => void;
}) {
  const [failed, setFailed] = useState(false);
  async function download() {
    const saved = await flow.downloadLatest(catalog.manifestURL);
    setFailed(!saved);
  }
  const active = flow.downloadStatus?.url === catalog.manifestURL;
  const saving = flow.downloadStatus?.phase === 'saving';
  const idleText = saved ? t.saved : t.empty;
  const activeText = saving ? t.saving : t.downloading;
  const idleLabel = saved ? t.update : t.download;
  const downloadLabel = failed ? t.retry : idleLabel;
  return (
    <>
      <Text
        accessibilityLiveRegion="polite"
        style={saved ? styles.saved : styles.body}
      >
        {active ? activeText : idleText}
      </Text>
      {saved ? (
        <ActionButton label={t.start} disabled={flow.busy} onPress={onStudy} />
      ) : null}
      <ActionButton
        label={active ? t.downloading : downloadLabel}
        disabled={flow.busy}
        variant={saved ? 'secondary' : 'primary'}
        onPress={() => void download()}
      />
      {active && !saving ? (
        <ActionButton
          label={t.cancel}
          onPress={flow.cancelDownload}
          variant="secondary"
        />
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  saved: { color: colors.successText, fontSize: 16, lineHeight: 24 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
