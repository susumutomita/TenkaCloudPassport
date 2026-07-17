import { useEffect, useReducer } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  INITIAL_BRIDGE_DISCLOSURE_STATE,
  reduceBridgeDisclosure,
} from '../app/bridge-disclosure';
import { expiryNotice } from '../app/expiry-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import type { RetiredLounge } from '../domain/lounge';
import { colors, spacing } from '../ui/theme';

interface OutcomeScreenProps {
  readonly lounge: RetiredLounge;
  readonly remainingMs: number;
  readonly locale?: Locale;
  readonly onComplete: () => void;
  readonly onExit: () => void;
  readonly onHostEnd: () => void;
}

export default function OutcomeScreen({
  lounge,
  remainingMs,
  locale = DEFAULT_LOCALE,
  onComplete,
  onExit,
  onHostEnd,
}: OutcomeScreenProps) {
  const t = MESSAGES[locale].outcome;
  const [disclosure, dispatchDisclosure] = useReducer(
    reduceBridgeDisclosure,
    INITIAL_BRIDGE_DISCLOSURE_STATE
  );
  const notice = expiryNotice(remainingMs, locale);
  const hasBridge = lounge.outcome.kind === 'bridge';
  const bridgeIsVisible = hasBridge && disclosure === 'visible';
  const message = bridgeIsVisible
    ? lounge.outcome.bridge.message
    : hasBridge
      ? t.bridgeMaskedMessage
      : t.noSignalMessage;
  // Issue 15 AC「異言語 Bridge は原文と端末内生成の補助文を区別する」。`sourceLabels`
  // （Clue Label そのもの、翻訳しない原文）と `message`（`language` ごとに端末内で今回
  // 生成した補助文）を別々の Text として提示し、どちらが原文でどちらが生成物かを
  // 利用者が取り違えないようにする（`src/domain/bridge.ts` の設計判断を参照）。
  const sourceLabels = bridgeIsVisible
    ? lounge.outcome.bridge.sourceLabels
    : [];

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
      eyebrow="Step 5 / Retired"
      title={hasBridge ? t.bridgeTitle : t.noSignalTitle}
      description={t.description}
    >
      <View style={[styles.result, !hasBridge ? styles.noSignal : undefined]}>
        <Text style={styles.resultKind}>
          {hasBridge ? t.bridgeLabel : t.noSignalLabel}
        </Text>
        <Text style={styles.message}>{message}</Text>
        {sourceLabels.length > 0 ? (
          <View style={styles.sourceLabels}>
            <Text style={styles.sourceLabelsCaption}>
              {t.sourceLabelCaption}
            </Text>
            <Text style={styles.sourceLabelsValue}>
              {sourceLabels.join(' / ')}
            </Text>
            <Text style={styles.generatedNoteCaption}>
              {t.generatedNoteCaption}
            </Text>
          </View>
        ) : null}
      </View>
      {notice.level === 'warning' ? (
        <View accessibilityRole="alert" style={styles.expiryWarning}>
          <Text style={styles.expiryWarningText}>{notice.message}</Text>
        </View>
      ) : null}
      {hasBridge ? (
        <ActionButton
          label={bridgeIsVisible ? t.maskBridgeButton : t.revealBridgeButton}
          onPress={() =>
            dispatchDisclosure({ type: bridgeIsVisible ? 'mask' : 'reveal' })
          }
          variant="secondary"
        />
      ) : null}
      <ActionButton label={t.completeButton} onPress={onComplete} />
      <ActionButton label={t.exitButton} onPress={onExit} variant="secondary" />
      <ActionButton
        label={t.hostEndButton}
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
  sourceLabels: {
    borderColor: colors.primarySoft,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  sourceLabelsCaption: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sourceLabelsValue: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  generatedNoteCaption: {
    color: colors.primarySoft,
    fontSize: 12,
    lineHeight: 18,
  },
  expiryWarning: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  expiryWarningText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
});
