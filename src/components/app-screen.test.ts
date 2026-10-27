import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

/**
 * Issue 117（owner 実機フィードバック、iOS）: 入力中にソフトキーボードが出ると、
 * `AppScreen` の footer（`KeyboardAvoidingView` 包み）がキーボードの上まで
 * せり上がり、入力欄・ライブプレビューへ重なって見えなくなる。この repo は
 * レンダリング用のテスト基盤（React Testing Library 相当）を持たないため、
 * 他の Screen / Component と同じくソーステキスト検査で契約を固定する
 * （`docs/design/2026-07-22-intro-card-creation-flow.md` が同じ理由で
 * debounce タイマーの検証をソース契約に留めているのと同種の制約）。
 */
describe('AppScreen の footer キーボード表示中非表示のソース契約（Issue 117）', () => {
  it('footer を持つ iOS 画面だけ Keyboard の will イベントを購読し、アンマウント時に解除する', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain("from 'react-native'");
    expect(text).toMatch(/\bKeyboard\b/);
    expect(text).toContain("if (!hasFooter || Platform.OS !== 'ios') return;");
    expect(text).toContain("Keyboard.addListener('keyboardWillShow',");
    expect(text).toContain("Keyboard.addListener('keyboardWillHide',");
    expect(text).toContain('showSubscription.remove();');
    expect(text).toContain('hideSubscription.remove();');
    // 依存配列は footer（JSX、毎 render 新しい参照）ではなく、真偽値化した
    // hasFooter にする（そうしないと footer を使う画面で毎キー入力ごとに
    // listener の張り直しが起きてしまう）。
    expect(text).toContain('}, [hasFooter]);');
  });

  it('Android は windowSoftInputMode の既定挙動のままにし、did イベントへのフォールバックを追加しない（code-reviewer 指摘: 未検証・未報告の Android 退行を避ける）', async () => {
    const text = await source('AppScreen.tsx');

    const footerHook = text.slice(
      text.indexOf('function useFooterHiddenForKeyboard('),
      text.indexOf('interface AppScreenProps')
    );
    expect(footerHook).toContain(
      "if (!hasFooter || Platform.OS !== 'ios') return;"
    );
    expect(footerHook).not.toContain("Keyboard.addListener('keyboardDidShow'");
    expect(footerHook).not.toContain("Keyboard.addListener('keyboardDidHide'");
    expect(footerHook).not.toMatch(/Platform\.OS === 'ios' \? 'keyboardWill/);
    // Input growth correction has a separate opt-in iOS-only subscription;
    // did events must not become an Android footer fallback.
    const inputSubscription = text.slice(
      text.lastIndexOf(
        'useEffect(() => {',
        text.indexOf('keyboardFrame.current = Keyboard.metrics()')
      ),
      text.indexOf('const footerContent')
    );
    expect(inputSubscription).toContain(
      "if (Platform.OS !== 'ios' || !automaticallyAdjustKeyboardInsets) return;"
    );
    expect(inputSubscription).toContain(
      "Keyboard.addListener('keyboardDidShow'"
    );
    expect(inputSubscription).toContain('show.remove();');
    expect(inputSubscription).toContain('frame.remove();');
    expect(inputSubscription).toContain('hide.remove();');
  });

  it('キーボード表示中は footer を DOM から外し、入力欄・プレビューへ渡す領域を返す（隠すだけで領域を確保したままにしない）', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain('hasFooter && !hideFooterForKeyboard');
    // footer が無い画面（大多数）は今までどおり footer 節が render されず、
    // 見た目が変わらない。
    expect(text).toContain('? (');
    expect(text).toContain(': null');
  });

  it('footer は実測し、狭い高さでは本文と一緒にスクロールする', async () => {
    const text = await source('AppScreen.tsx');
    expect(text).toContain('onLayout={handleFooterLayout}');
    expect(text).toContain('event.nativeEvent.layout.height');
    expect(text).toContain('footerHeight > height * 0.3');
    expect(text).toContain('{inlineFooter ? footerContent : null}');
    expect(text).toContain('{!inlineFooter ? footerContent : null}');
  });

  it('footer が falsy なら空のバーを描画しない', async () => {
    const text = await source('AppScreen.tsx');
    expect(text).toContain('const hasFooter = Boolean(footer);');
    expect(text).toContain('hasFooter && !hideFooterForKeyboard');
  });
});

/**
 * Issue 118（owner 実機フィードバック）: 言語切替が Settings 画面までスクロールしないと
 * 見つからず分かりにくいため、自己紹介カード系画面の右上ヘッダー（BrandMark ロックアップの
 * 右の空き）へ常設のトグルを追加する。`locale` / `onChangeLocale` を渡した画面だけに
 * 出る optional prop にし、渡さない既存の全 Screen の見た目は変えない。
 */
describe('AppScreen のヘッダー言語切替トグル（Issue 118）', () => {
  it('locale / onChangeLocale の両方を渡した画面だけにトグルを表示する（optional prop、既存画面の見た目は変えない）', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain('locale?: Locale');
    expect(text).toContain('onChangeLocale?: (locale: Locale) => void');
    expect(text).toContain('locale && onChangeLocale ?');
  });

  it('トグルは BrandMark ロックアップと同じ行の右側に、space-between で配置する', async () => {
    const text = await source('AppScreen.tsx');
    const rowStart = text.indexOf('<View style={styles.brandRow}>');
    const rowEnd = text.indexOf('<Text style={styles.eyebrow}>', rowStart);
    const rowBlock = text.slice(rowStart, rowEnd);

    expect(rowBlock).toContain('<View style={styles.brandLockup}>');
    expect(rowBlock).toContain('<BrandMark');
    expect(rowBlock).toContain('<Pressable');
    expect(text).toContain("justifyContent: 'space-between'");
  });

  it('タップすると現在の Locale の次（LOCALES 配列の巡回）へ切り替える', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain('function nextLocale(current: Locale): Locale {');
    expect(text).toContain('LOCALES.indexOf(current)');
    expect(text).toContain(
      'onPress={() => onChangeLocale(nextLocale(locale))}'
    );
  });

  it('accessibilityLabel / accessibilityHint を Message Catalog（common.localeToggle*）から組み立て、タップ領域は WCAG 2.5.5 相当（44pt）を持つ', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain('common.localeToggleAccessibilityLabel(');
    expect(text).toContain('common.localeToggleHint');
    expect(text).toContain("from '../ui/touch-target'");
    expect(text).toContain('minHeight: MIN_TOUCH_TARGET');
    expect(text).toContain('minWidth: MIN_TOUCH_TARGET');
  });
});
