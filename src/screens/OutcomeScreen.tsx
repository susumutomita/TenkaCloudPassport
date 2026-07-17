import { useEffect, useReducer } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  INITIAL_BRIDGE_DISCLOSURE_STATE,
  reduceBridgeDisclosure,
} from '../app/bridge-disclosure';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import type { RetiredLounge } from '../domain/lounge';
import { colors, spacing } from '../ui/theme';

interface OutcomeScreenProps {
  readonly lounge: RetiredLounge;
  readonly onComplete: () => void;
  readonly onExit: () => void;
  readonly onHostEnd: () => void;
}

export default function OutcomeScreen({
  lounge,
  onComplete,
  onExit,
  onHostEnd,
}: OutcomeScreenProps) {
  const [disclosure, dispatchDisclosure] = useReducer(
    reduceBridgeDisclosure,
    INITIAL_BRIDGE_DISCLOSURE_STATE
  );
  const hasBridge = lounge.outcome.kind === 'bridge';
  const bridgeIsVisible = hasBridge && disclosure === 'visible';
  const message = bridgeIsVisible
    ? lounge.outcome.bridge.message
    : hasBridge
      ? 'Bridge は mask されています。Owner が確認するときだけ表示してください。'
      : '今回は Bridge を支える確認済みの手掛かりがありません。推測せずに終了します。';

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        dispatchDisclosure({ type: 'app-became-inactive' });
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <AppScreen
      eyebrow="Step 4 / Retired"
      title={hasBridge ? '人間の会話へ。' : 'no-signal も正常な結果。'}
      description="結果の確定直後に Pet は retired になりました。追加説明、再判定、継続チャットは行いません。"
    >
      <View style={[styles.result, !hasBridge ? styles.noSignal : undefined]}>
        <Text style={styles.resultKind}>
          {hasBridge ? 'Bridge' : 'no-signal'}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {hasBridge ? (
        <ActionButton
          label={bridgeIsVisible ? 'Bridge を隠す' : 'Bridge を表示'}
          onPress={() =>
            dispatchDisclosure({ type: bridgeIsVisible ? 'mask' : 'reveal' })
          }
          variant="secondary"
        />
      ) : null}
      <ActionButton label="結果を閉じて Lounge を破棄" onPress={onComplete} />
      <ActionButton label="退出して破棄" onPress={onExit} variant="secondary" />
      <ActionButton
        label="Host として終了"
        onPress={onHostEnd}
        variant="danger"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  result: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    gap: spacing.md,
    padding: spacing.lg,
  },
  noSignal: {
    backgroundColor: colors.ink,
  },
  resultKind: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  message: {
    color: colors.white,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 34,
  },
});
