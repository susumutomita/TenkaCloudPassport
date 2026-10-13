import { useState } from 'react';
import { Text } from 'react-native';
import { diagnosticRecovery } from '../app/diagnostic-recovery';
import type { Locale } from '../app/i18n/locale';
import type { LocalDiagnosticsFlow } from '../app/use-local-diagnostics-flow';
import ActionButton from '../components/ActionButton';
import Card from '../components/Card';

export type LegacyCleanupFlow = Pick<
  LocalDiagnosticsFlow,
  | 'busy'
  | 'loading'
  | 'recoveryRequired'
  | 'localDataPreview'
  | 'error'
  | 'refresh'
  | 'removeModel'
>;
const COPY = {
  ja: {
    title: '旧モデルの片付け',
    description:
      '会話 AI は廃止済みです。以前保存したモデルは自動削除しません。',
    inspect: '旧モデルの容量を確認',
    loading: '容量を確認しています。',
    empty: '旧モデルの管理ファイルはありません。',
    confirm:
      '旧モデルの管理ファイルだけを削除します。取り消せません。自己紹介カードと学習進捗は残ります。',
    review: '旧モデルの削除を確認',
    remove: '旧モデルだけ削除する',
    cancel: '削除をやめる',
  },
  en: {
    title: 'Legacy model cleanup',
    description:
      'Conversation AI is retired. Previously saved model files are not automatically deleted.',
    inspect: 'Check legacy model storage',
    loading: 'Checking storage…',
    empty: 'No legacy managed model files.',
    confirm:
      'Delete only legacy managed model files? This cannot be undone. Cards and learning progress remain.',
    review: 'Review legacy model deletion',
    remove: 'Delete legacy models only',
    cancel: 'Cancel deletion',
  },
} as const;
export function LegacyModelCleanupSection({
  flow,
  locale,
}: {
  readonly flow: LegacyCleanupFlow;
  readonly locale: Locale;
}) {
  const [confirm, setConfirm] = useState(false);
  const t = COPY[locale];
  const blocked = flow.busy || flow.loading || flow.recoveryRequired;
  const model = flow.localDataPreview?.model;
  function remove() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    void flow.removeModel();
  }
  return (
    <Card>
      <Text>{t.title}</Text>
      <Text>{t.description}</Text>
      <ActionButton
        label={t.inspect}
        disabled={blocked}
        variant="secondary"
        onPress={() => {
          setConfirm(false);
          void flow.refresh();
        }}
      />
      {flow.loading ? (
        <Text accessibilityLiveRegion="polite">{t.loading}</Text>
      ) : null}
      {flow.localDataPreview ? (
        <Text accessibilityLiveRegion="polite">
          {model ? `${model.sizeBytes.toLocaleString()} bytes` : t.empty}
        </Text>
      ) : null}
      {flow.error ? (
        <Text accessibilityRole="alert">
          {diagnosticRecovery(flow.error.code, locale).title}
        </Text>
      ) : null}
      {model ? (
        <>
          {confirm ? <Text>{t.confirm}</Text> : null}
          <ActionButton
            label={confirm ? t.remove : t.review}
            disabled={blocked}
            variant="danger"
            onPress={remove}
          />
          {confirm ? (
            <ActionButton
              label={t.cancel}
              disabled={blocked}
              variant="secondary"
              onPress={() => setConfirm(false)}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
