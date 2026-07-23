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

    // コメント上の言及（却下理由の説明）は許容するが、実際に
    // `Keyboard.addListener` へ did イベントを渡すコードは持たない。
    expect(text).not.toContain("Keyboard.addListener('keyboardDidShow'");
    expect(text).not.toContain("Keyboard.addListener('keyboardDidHide'");
    expect(text).not.toMatch(/Platform\.OS === 'ios' \? 'keyboardWill/);
  });

  it('キーボード表示中は footer を DOM から外し、入力欄・プレビューへ渡す領域を返す（隠すだけで領域を確保したままにしない）', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain('hasFooter && !hideFooterForKeyboard');
    // footer が無い画面（大多数）は今までどおり footer 節が render されず、
    // 見た目が変わらない。
    expect(text).toContain('? (');
    expect(text).toContain(': null');
  });

  it('footer の実測高さぶん ScrollView の contentContainer 下部パディングを確保し、キーボード表示中に footer が隠れていても padding は戻さない（code-reviewer 指摘: 表示切替のたびのスクロール位置ガタつき防止）', async () => {
    const text = await source('AppScreen.tsx');

    expect(text).toContain('onLayout={handleFooterLayout}');
    expect(text).toContain('function handleFooterLayout(');
    expect(text).toContain('event.nativeEvent.layout.height');
    expect(text).toContain('setFooterHeight(');
    // padding 加算の条件は hasFooter だけであり、hideFooterForKeyboard では
    // 分岐しない（footer が一時的に隠れても padding は測定値のまま据え置く）。
    const paddingConditionStart = text.indexOf('contentContainerStyle={[');
    const paddingConditionEnd = text.indexOf(']}', paddingConditionStart);
    const paddingConditionBlock = text.slice(
      paddingConditionStart,
      paddingConditionEnd
    );
    expect(paddingConditionBlock).toContain(
      'BASE_CONTENT_BOTTOM_PADDING + footerHeight'
    );
    expect(paddingConditionBlock).not.toContain('hideFooterForKeyboard');
    expect(paddingConditionBlock).toMatch(/hasFooter\s*\n?\s*\?\s*\{/);
  });

  it('footer を持たない既存画面の見た目は変えない（footer が falsy なら hasFooter は false のまま、padding 加算・footer 節ともに従来どおり）', async () => {
    const text = await source('AppScreen.tsx');

    // Issue 93 の既存 `{footer ? <View>...} : null}` と同じ truthy 判定に
    // 揃える（code-reviewer 指摘: `!== undefined && !== null` だと
    // `footer={false}` 等でも「footer あり」判定になり、中身が空の
    // ボーダー付き footer バーが描画されてしまう）。
    expect(text).toContain('const hasFooter = Boolean(footer);');
    expect(text).toMatch(/hasFooter\s*\n?\s*\?\s*\{/);
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
