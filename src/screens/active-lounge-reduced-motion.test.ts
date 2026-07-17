import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ActiveLoungeScreen.tsx');
}

/**
 * Issue 15 の受け入れ条件「Reduce Motion 時は Pet Animation を静的状態へ置換する」の配線を
 * 固定する。この repo はレンダリング用の統合テスト基盤を持たないため、`reduceMotion` が
 * 真の分岐が `Animated.loop` / `Animated.timing` を一切使わないこと、偽の分岐だけが
 * Animation を組み立てることをソーステキストで検証する
 * （`src/app/reduced-motion-port.ts` の Port 自体は `reduced-motion-port.test.ts` が
 * 実際の代替実装で検証する）。`if (reduceMotion) {` は useEffect 側（Animation 停止）と
 * render 側（静的 Text の分岐）の 2 箇所にあるため、`lastIndexOf` で render 側だけを
 * 切り出す。
 */
describe('Active Lounge 画面の Pet Animation は Reduce Motion 時に静的表示へ置換する', () => {
  it('PetEmojiGlyph は reduceMotion prop を受け取る', async () => {
    const text = await source();

    expect(text).toContain('reduceMotion: boolean');
  });

  it('useEffect は reduceMotion が真のとき Animation を組み立てず即座に抜ける', async () => {
    const text = await source();
    const effectStart = text.indexOf('useEffect(() => {');
    const effectEnd = text.indexOf('}, [reduceMotion, scale]);');
    const effectBody = text.slice(effectStart, effectEnd);
    const guardEnd = effectBody.indexOf('return undefined;');
    const guardBranch = effectBody.slice(0, guardEnd);

    expect(guardBranch).toContain('if (reduceMotion) {');
    expect(guardBranch).toContain('scale.setValue(1);');
    expect(guardBranch).not.toContain('Animated.loop');
    expect(guardBranch).not.toContain('Animated.timing');
  });

  it('reduceMotion が偽のときだけ useEffect が Animated.loop で軽い拍動を組み立てる', async () => {
    const text = await source();
    const effectStart = text.indexOf('useEffect(() => {');
    const effectEnd = text.indexOf('}, [reduceMotion, scale]);');
    const effectBody = text.slice(effectStart, effectEnd);

    expect(effectBody).toContain('return undefined;');
    expect(effectBody.indexOf('return undefined;')).toBeLessThan(
      effectBody.indexOf('Animated.loop(')
    );
    expect(effectBody).toContain('Animated.sequence([');
    expect(effectBody).toContain('pulse.start();');
  });

  it('render 側の reduceMotion 分岐は Animated.loop / Animated.timing を使わない静的な Text を返す', async () => {
    const text = await source();
    const renderGuardStart = text.lastIndexOf('if (reduceMotion) {');
    const renderGuardEnd = text.indexOf('return (', renderGuardStart);
    const guardBranch = text.slice(renderGuardStart, renderGuardEnd);

    expect(guardBranch).toContain('<Text style={styles.petEmojiGlyph}>');
    expect(guardBranch).not.toContain('Animated.loop');
    expect(guardBranch).not.toContain('Animated.timing');
  });

  it('render 側の既定分岐は Animated.Text で拍動させる', async () => {
    const text = await source();
    const renderGuardStart = text.lastIndexOf('if (reduceMotion) {');
    const animatedTextIndex = text.indexOf('<Animated.Text', renderGuardStart);

    expect(animatedTextIndex).toBeGreaterThan(renderGuardStart);
    expect(text).toContain('transform: [{ scale }]');
  });

  it('reduceMotion 未指定の既定値は false（Motion 有効）である', async () => {
    const text = await source();

    expect(text).toContain('reduceMotion = false,');
  });
});
