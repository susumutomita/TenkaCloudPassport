import { describe, expect, it } from 'bun:test';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';
import { readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

/**
 * Issue 15: WCAG 2.5.5 相当の 44 pt 以上の Touch Target を、`Pressable` を持つ全 Screen /
 * Component についてソーステキストで機械検証する。`minHeight` / `height` の数値をスタイル
 * 定義から抽出し、`ui/touch-target.ts` の共有定数以上であることを確認する
 * （レンダリング基盤を持たないため、実測ではなく宣言値の検査に留める）。
 */
function extractStyleNumber(
  text: string,
  styleName: string,
  prop: string
): number {
  const styleBlockPattern = new RegExp(`${styleName}:\\s*\\{([^}]*)\\}`);
  const styleMatch = styleBlockPattern.exec(text);
  if (!styleMatch?.[1]) {
    throw new Error(`Style ${styleName} が見つかりません。`);
  }
  const propPattern = new RegExp(`${prop}:\\s*(\\d+)`);
  const propMatch = propPattern.exec(styleMatch[1]);
  if (!propMatch?.[1]) {
    throw new Error(`Style ${styleName} に ${prop} がありません。`);
  }
  return Number(propMatch[1]);
}

describe('Touch Target が 44 pt 以上である', () => {
  it('ActionButton は minHeight が 44 pt 以上', async () => {
    const text = await source('../components/ActionButton.tsx');
    expect(
      extractStyleNumber(text, 'button', 'minHeight')
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('ClueSelector の各選択肢は minHeight が 44 pt 以上', async () => {
    const text = await source('../components/ClueSelector.tsx');
    expect(
      extractStyleNumber(text, 'option', 'minHeight')
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('PetEmojiSelector の各選択肢は height が 44 pt 以上', async () => {
    const text = await source('../components/PetEmojiSelector.tsx');
    expect(extractStyleNumber(text, 'option', 'height')).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET
    );
  });

  it('LanguageSelector の各選択肢は minHeight が 44 pt 以上', async () => {
    const text = await source('../components/LanguageSelector.tsx');
    expect(
      extractStyleNumber(text, 'option', 'minHeight')
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('EncounterSetupScreen の確認チェックボックス行は共有定数を使って 44 pt 以上を強制する', async () => {
    const text = await source('EncounterSetupScreen.tsx');
    expect(text).toContain("from '../ui/touch-target'");
    expect(text).toContain('minHeight: MIN_TOUCH_TARGET');
  });

  it('PassportSharePreviewScreen の Toggle 行は minHeight が 44 pt 以上', async () => {
    const text = await source('PassportSharePreviewScreen.tsx');
    expect(
      extractStyleNumber(text, 'toggle', 'minHeight')
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('IntroCardEditScreen の自由リンク削除ボタンは共有定数を使って 44 pt 以上を強制する（Issue 90）', async () => {
    const text = await source('IntroCardEditScreen.tsx');
    expect(text).toContain("from '../ui/touch-target'");
    expect(text).toContain('minHeight: MIN_TOUCH_TARGET');
    expect(text).toContain('minWidth: MIN_TOUCH_TARGET');
  });

  it('AppScreen のヘッダー言語切替トグルは共有定数を使って 44 pt 以上を強制する（Issue 118）', async () => {
    const text = await source('../components/AppScreen.tsx');
    expect(text).toContain("from '../ui/touch-target'");
    expect(text).toContain('minHeight: MIN_TOUCH_TARGET');
    expect(text).toContain('minWidth: MIN_TOUCH_TARGET');
  });

  it('IntroCardScreen の削除リンクは共有定数を使って 44 pt 以上を強制する（Issue 118: 控えめなテキストリンクへ移した後もタップ領域は維持する）', async () => {
    const text = await source('IntroCardScreen.tsx');
    expect(text).toContain("from '../ui/touch-target'");
    expect(text).toContain('minHeight: MIN_TOUCH_TARGET');
    expect(text).toContain('minWidth: MIN_TOUCH_TARGET');
  });
});
