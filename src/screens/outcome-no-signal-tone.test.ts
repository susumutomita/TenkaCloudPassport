import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'OutcomeScreen.tsx');
}

/**
 * Issue 72 F（F-1TDS45 の owner 判断）: bridge / no-signal の両方が ink 地 + summit
 * ドット + accent ラベルだと、橋が見つからない no-signal にも祝祭的な summit 演出が
 * ついてしまう。no-signal はドットを idle トーン、ラベル色を白 opacity 0.68 相当へ
 * 落とし、summit（accent ドット + accent ラベル）は bridge 限定にする。文言は不変。
 */
describe('Outcome 画面は summit 演出を bridge に限定し no-signal は muted 系にする', () => {
  it('StatusDot の tone は hasBridge で summit / idle を切り替える', async () => {
    const text = await source();

    expect(text).toContain("from '../components/StatusDot'");
    expect(text).toContain("hasBridge ? 'summit' : 'idle'");
  });

  it('resultKind ラベルの色は hasBridge で accent / 白 opacity 0.68 を切り替える', async () => {
    const text = await source();

    expect(text).toContain('hasBridge ? styles.resultKindBridge');
    expect(text).toContain('color: colors.accent');
    const noSignalStyleStart = text.indexOf('resultKindNoSignal: {');
    const noSignalStyleEnd = text.indexOf('}', noSignalStyleStart);
    const noSignalStyle = text.slice(noSignalStyleStart, noSignalStyleEnd);

    expect(noSignalStyle).toContain('color: colors.white');
    expect(noSignalStyle).toContain('opacity: 0.68');
  });
});
