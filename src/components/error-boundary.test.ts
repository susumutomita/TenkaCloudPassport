import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

/**
 * Issue 138（実機 blocker C、会話 Agent 起動クラッシュ）: `ErrorBoundary` は
 * `react-native` の Primitive（`View` / `Text` / `Pressable` / `SafeAreaView`）に
 * 依存する Component であり、この repo の `bun test` は `react-native` の
 * package entry（Flow 構文）を解決できないため、他の Screen / Component と同じく
 * import せずソーステキスト検査で契約を固定する（`accessibility-test-kit.ts` 冒頭
 * コメント・`app-screen.test.ts` と同じ制約・同じ流儀）。
 */
function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ErrorBoundary.tsx');
}

describe('ErrorBoundary（汎用 Error Boundary、Issue 138）', () => {
  it('Error Boundary は class component として実装する（function component + hook では componentDidCatch を実装できない React の制約）', async () => {
    const text = await source();

    expect(text).toContain('export class ErrorBoundary extends Component<');
  });

  it('getDerivedStateFromError は例外の内容によらず常に hasError: true を返す（fail-closed）', async () => {
    const text = await source();

    expect(text).toContain(
      'static getDerivedStateFromError(): ErrorBoundaryState {'
    );
    expect(text).toContain('return { hasError: true };');
  });

  it('componentDidCatch は Network へ送信せず、ローカル console.error だけに記録する（Diagnostics と同じ Network 送信なし方針）', async () => {
    const text = await source();
    const start = text.indexOf('override componentDidCatch');
    const end = text.indexOf('override render(): ReactNode {', start);
    const body = text.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(body).toContain(
      "console.error('[ErrorBoundary] Unhandled render error', error);"
    );
    // 空 catch・仮実装ではない実処理であることを固定する。
    expect(body).not.toMatch(/componentDidCatch\([^)]*\): void \{\s*\}/);
  });

  it('hasError が false のときは children をそのまま返し、true のときだけ fallback を返す', async () => {
    const text = await source();
    const renderStart = text.indexOf('override render(): ReactNode {');
    const renderBody = text.slice(
      renderStart,
      text.indexOf('\n}\n', renderStart)
    );

    expect(renderBody).toContain(
      'if (!this.state.hasError) return this.props.children;'
    );
  });

  it('fallback は accessibilityRole="alert" を持ち、messages（title / description / backButtonLabel）と onRecover を使う', async () => {
    const text = await source();
    const renderStart = text.indexOf('override render(): ReactNode {');
    const renderBody = text.slice(renderStart);

    expect(renderBody).toContain('accessibilityRole="alert"');
    expect(renderBody).toContain('{messages.title}');
    expect(renderBody).toContain('{messages.description}');
    expect(renderBody).toContain(
      'accessibilityLabel={messages.backButtonLabel}'
    );
    expect(renderBody).toContain('{messages.backButtonLabel}');
    expect(renderBody).toContain('onPress={onRecover}');
  });

  it('fallback は AppScreen 等の共有 Component へ依存しない（依存先自体が例外原因だった場合の再失敗を避けるため RN の基礎 Primitive だけで組む）', async () => {
    const text = await source();

    expect(text).not.toContain("from './AppScreen'");
    expect(text).not.toContain('<AppScreen');
    expect(text).not.toContain("from './ActionButton'");
    expect(text).not.toContain('<ActionButton');
    expect(text).toContain(
      "import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';"
    );
  });

  it('Native 側の crash は捕まえられない限界をコメントで明示する', async () => {
    const text = await source();

    expect(text).toContain('Native module 側の crash');
  });
});
