import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'RealQrView.tsx');
}

/**
 * `docs/design/qr-invite-and-ready-flow.md` の「M3 受け入れ基準」節（renderer）を
 * ソーステキスト検査で固定する。この repo にレンダリング用の統合テスト基盤
 * （React Testing Library 相当）が無いため、`QrCodeView` / `Card` 等の既存 Component
 * と同じ Source Contract Test の形を踏襲する。
 */
describe('RealQrView（実 QR 表示）のソース契約', () => {
  it('props は matrix と size だけを受ける', async () => {
    const text = await source();
    const propsStart = text.indexOf('interface RealQrViewProps');
    const propsEnd = text.indexOf('}', propsStart);
    const propsBlock = text.slice(propsStart, propsEnd);

    expect(propsBlock).toContain(
      'readonly matrix: readonly (readonly boolean[])[]'
    );
    expect(propsBlock).toContain('readonly size?: number');
    expect(propsBlock.match(/^\s*readonly \w+/gm)).toHaveLength(2);
  });

  it('Quiet zone を 4 module 確保する', async () => {
    const text = await source();

    expect(text).toContain('QUIET_ZONE_MODULES = 4');
  });

  it('最小レンダリングサイズ 240px、かつ 1 module あたり物理 2px 以上を強制する', async () => {
    const text = await source();

    expect(text).toContain('MIN_RENDER_SIZE = 240');
    expect(text).toContain('MIN_PIXELS_PER_MODULE = 2');
    expect(text).toContain('Math.max(');
  });

  it('白地を固定し、ダークモードや theme 分岐で反転しない', async () => {
    const text = await source();

    expect(text).toContain('backgroundColor: colors.white');
    expect(text).toContain('filled ? colors.ink : colors.white');
    expect(text).not.toContain('useColorScheme');
    expect(text).not.toContain('dark');
  });

  it('image role を持つ（Accessibility Label は呼び出し側の Screen が付与する）', async () => {
    const text = await source();

    expect(text).toContain('accessibilityRole="image"');
  });

  it('装飾用の QrCodeView とは独立し、react-native-svg や qr-matrix に依存しない', async () => {
    const text = await source();

    expect(text).not.toContain('react-native-svg');
    expect(text).not.toContain('qr-matrix');
  });

  it('色の 16 進値を直書きせず theme のトークンだけを使う', async () => {
    const text = await source();

    expect(text).toContain("from '../ui/theme'");
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
