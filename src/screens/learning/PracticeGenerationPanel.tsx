import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import type { Locale } from '../../app/i18n/locale';
import type {
  GenerationAvailability,
  GenerationPort,
} from '../../app/practice-generation/provider';
import ActionButton from '../../components/ActionButton';
import {
  bundledPractice,
  practiceCatalog,
} from '../../domain/crypto-practice/catalog';
import type { Catalog } from '../../domain/learning/model';

interface Props {
  readonly provider: GenerationPort;
  readonly locale: Locale;
  readonly disabled: boolean;
  readonly onCatalog: (catalog: Catalog) => void;
}
const reasons: Record<GenerationAvailability, readonly [string, string]> = {
  available: [
    'Apple Intelligenceを端末内で利用できます。',
    'Apple Intelligence is available on this device.',
  ],
  'unsupported-platform': [
    'このOSではAI出題を利用できません。',
    'AI generation is unavailable on this platform.',
  ],
  'native-build-required': [
    'AI出題には対応するネイティブ版が必要です。',
    'AI generation requires a native build with the module.',
  ],
  'unsupported-os': [
    'このOS版ではAI出題を利用できません。',
    'AI generation is unavailable on this OS version.',
  ],
  'device-not-eligible': [
    'この端末はApple Intelligenceに対応していません。',
    'This device does not support Apple Intelligence.',
  ],
  'apple-intelligence-not-enabled': [
    'Apple Intelligenceが有効になっていません。',
    'Apple Intelligence is not enabled.',
  ],
  'model-not-ready': [
    '端末内モデルの準備ができていません。',
    'The on-device model is not ready.',
  ],
  unknown: [
    'AIの利用可否を確認できません。再確認できます。',
    'Could not determine AI availability. You can check again.',
  ],
};

export default function PracticeGenerationPanel({
  provider,
  locale,
  disabled,
  onCatalog,
}: Props) {
  const [availability, setAvailability] =
    useState<GenerationAvailability>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(false);
  const inFlight = useRef(false);
  const cancellation = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const ja = locale === 'ja';
  const check = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await provider.availability();
      if (alive.current && request === generation.current)
        setAvailability(next);
    } catch {
      if (alive.current && request === generation.current)
        setAvailability('unknown');
    }
  }, [provider]);
  useEffect(() => {
    alive.current = true;
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
      else cancellation.current?.abort();
    });
    return () => {
      alive.current = false;
      cancellation.current?.abort();
      generation.current += 1;
      subscription.remove();
    };
  }, [check]);
  async function generate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const controller = new AbortController();
      cancellation.current = controller;
      const draft = await provider.generate(controller.signal);
      const catalog = practiceCatalog([draft], locale, 'apple');
      if (alive.current) onCatalog(catalog);
    } catch {
      if (alive.current) {
        setError(true);
        void check();
      }
    } finally {
      inFlight.current = false;
      cancellation.current = null;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text>
        {ja
          ? '既存crypto-battleの演算練習。対戦・Battle得点は含みません。'
          : 'Original crypto-battle arithmetic practice; no multiplayer or Battle score.'}
      </Text>
      <ActionButton
        label={
          ja
            ? '同梱の暗号・数学練習を追加'
            : 'Add bundled crypto arithmetic practice'
        }
        disabled={disabled || busy}
        onPress={() => onCatalog(bundledPractice(locale))}
        variant="secondary"
      />
      <Text accessibilityLiveRegion="polite">
        {reasons[availability][ja ? 0 : 1]}
      </Text>
      <Text>
        {ja
          ? 'AIはテンプレートと数値を選び、正答と採点は元の演算で検証します。学習データをクラウドへ送りません。モデル出力の文章・正答・コードは使いません。'
          : 'AI selects a template and numbers. Original arithmetic determines the answer and grading. No learning data is sent to a cloud model; model-written prose, answers and code are not used.'}
      </Text>
      <ActionButton
        label={
          busy
            ? ja
              ? '端末内で生成中…'
              : 'Generating on device…'
            : ja
              ? 'Apple Intelligenceで練習を作成'
              : 'Create practice with Apple Intelligence'
        }
        disabled={disabled || busy || availability !== 'available'}
        onPress={() => void generate()}
      />
      <ActionButton
        label={ja ? 'AIの利用可否を再確認' : 'Check AI availability again'}
        disabled={busy}
        onPress={() => void check()}
        variant="secondary"
      />
      {error ? (
        <Text accessibilityRole="alert">
          {ja
            ? '生成できませんでした。保存データは変更していません。同梱練習を利用するか再試行してください。'
            : 'Generation failed. Saved data was not changed. Use bundled practice or retry.'}
        </Text>
      ) : null}
    </View>
  );
}
