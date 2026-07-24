import { Component, type ReactNode } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';

/**
 * Issue 138（実機 blocker C、会話 Agent 起動クラッシュ）: React の JS 例外は、
 * 例外を投げた Component の祖先に Error Boundary（`componentDidCatch` /
 * `static getDerivedStateFromError`）が無い限り、アプリ全体（他 Stage・
 * Navigation）まで巻き込んでクラッシュする。この Component は class（Error
 * Boundary は function component + hook では実装できない、React 公式の制約）
 * として汎用実装し、任意の Stage の描画ツリーを包んで JS 例外をその Stage 内へ
 * 封じ込める。
 *
 * 限界（呼び出し側にも周知する）: これは JS 側の例外だけを捕まえる。llama.rn
 * 等の Native module 側の crash（Native Context の異常終了、OS レベルの crash）は
 * React の Error Boundary を経由しないため、ここでは防げない。owner から Native
 * 側のクラッシュログ（Xcode Console / red box のスタック）が届いた場合は、別途
 * 原因箇所を特定して個別に修正する。
 *
 * フォールバック UI は `AppScreen` 等の共有 Component へ依存しない
 * （依存先の Component 自体が今回の例外原因だった場合に、フォールバック描画
 * 自体が再度失敗する事態を避けるため、RN の基礎 Primitive だけで組む）。
 */

export interface ErrorBoundaryFallbackMessages {
  readonly title: string;
  readonly description: string;
  readonly backButtonLabel: string;
}

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly messages: ErrorBoundaryFallbackMessages;
  /** フォールバック表示から呼び出し元の安全な Stage（例: Settings）へ戻す。 */
  readonly onRecover: () => void;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    // Network 送信は行わない（Diagnostics と同じ既定方針）。開発中は Metro の
    // Console / red box で原因追跡できるよう、ローカルへ残すだけに留める。
    console.error('[ErrorBoundary] Unhandled render error', error);
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const { messages, onRecover } = this.props;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View accessibilityRole="alert" style={styles.container}>
          <Text style={styles.title}>{messages.title}</Text>
          <Text style={styles.description}>{messages.description}</Text>
          <Pressable
            accessibilityLabel={messages.backButtonLabel}
            accessibilityRole="button"
            onPress={onRecover}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>{messages.backButtonLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    backgroundColor: colors.white,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
});
