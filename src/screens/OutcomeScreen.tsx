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
import ExpiryWarningBanner from '../components/ExpiryWarningBanner';
import StatusDot from '../components/StatusDot';
import type { RetiredLounge } from '../domain/lounge';
import { colors, spacing } from '../ui/theme';
import { monoLabel } from '../ui/typography';

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
      <View style={styles.result}>
        <View style={styles.resultKindRow}>
          <StatusDot tone={hasBridge ? 'summit' : 'idle'} />
          <Text
            style={[
              styles.resultKind,
              hasBridge ? styles.resultKindBridge : styles.resultKindNoSignal,
            ]}
          >
            {hasBridge ? t.bridgeLabel : t.noSignalLabel}
          </Text>
        </View>
        <Text style={styles.message}>{message}</Text>
        {sourceLabels.length > 0 ? (
          <View style={styles.sourceLabels}>
            <View style={styles.divider} />
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
        <ExpiryWarningBanner message={notice.message} />
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
  // Bridge / no-signal ともに ink 地。summit はグラデーションを足さず、accent の
  // ドット + ラベルという小要素だけで表す（docs/design/2026-07-20-ink-summit-redesign.md）。
  result: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    gap: spacing.md,
    padding: spacing.lg,
  },
  resultKindRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  resultKind: {
    ...monoLabel,
  },
  // summit（accent ラベル）は bridge 限定にする（Issue 72 F / F-1TDS45）。no-signal は
  // 橋が見つからなかった旨を祝祭的な演出にしないよう白 opacity 0.68 の muted 系へ落とす。
  resultKindBridge: {
    color: colors.accent,
  },
  resultKindNoSignal: {
    color: colors.white,
    opacity: 0.68,
  },
  message: {
    color: colors.white,
    fontSize: 21,
    fontWeight: '600',
    lineHeight: 32,
  },
  sourceLabels: {
    gap: spacing.xs,
  },
  // ダーク面の区切りは白の低不透明度で表す。border に opacity を個別指定できないため
  // 専用の View で描く。
  divider: {
    backgroundColor: colors.white,
    height: 1,
    marginBottom: spacing.xs,
    opacity: 0.14,
  },
  sourceLabelsCaption: {
    ...monoLabel,
    color: colors.white,
    // デザイン値 .5 は 10px 級で AA を割るため、契約優先で .68 へ引き上げる。
    opacity: 0.68,
  },
  sourceLabelsValue: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
  },
  generatedNoteCaption: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 18,
    opacity: 0.68,
  },
});
