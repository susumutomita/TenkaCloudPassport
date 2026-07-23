import { type ReactNode, useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LOCALE_LABELS, LOCALES, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';
import { monoFontFamily } from '../ui/typography';
import BrandMark from './BrandMark';

/**
 * Issue 118: ヘッダーの言語切替は 2 Locale（ja/en）の単純なトグルであるため、
 * `LOCALES` 配列内で次の Locale を 1 つ返す。3 Locale 以上へ拡張する場合も
 * 「現在位置の次」を返す本関数のロジックはそのまま使える。
 */
function nextLocale(current: Locale): Locale {
  const index = LOCALES.indexOf(current);
  return LOCALES[(index + 1) % LOCALES.length] ?? current;
}

/**
 * Issue 93 の `content.paddingBottom` 既定値。footer を持つ画面
 * （Issue 117 時点では `IntroCardEditScreen` のみ）では、この基礎値に
 * footer の実測高さを足し込み、フッター表示中でも最後の入力欄が隠れない
 * だけの下部余白を確保する。
 */
const BASE_CONTENT_BOTTOM_PADDING = 56;

/**
 * Issue 117（owner 実機フィードバック、iOS）: 入力中にソフトキーボードが
 * 出ると、`KeyboardAvoidingView` が footer をキーボードの上まで押し上げ、
 * 入力欄・ライブプレビューへ重なって見えなくなる。`footer` を持つ画面
 * だけ Keyboard の show/hide を購読し、キーボード表示中は footer を隠す
 * （閉じる、または Issue 90 の return/done 送り・`keyboardDismissMode`
 * で再表示される）。
 *
 * 却下した代替案: footer を `position: absolute` で画面最下部に固定する案は、
 * 結局キーボードの裏に隠れて「閉じないと押せない」ままで問題を解決しない。
 * footer を `ScrollView` の内容末尾（`children` の後）へ戻す案は、Issue 93 が
 * 定めた「プレビューと保存ボタンが同時に見える」作成フローを崩すため
 * 却下する（`Plan.md` の Issue 117 設計節）。
 *
 * `footer` は JSX として毎 render 新しい参照になるため、真偽値化した
 * `hasFooter` を依存にする（`footer` 自体を依存にすると、footer を持つ
 * 画面で入力のたびに listener の解除・再登録が起きてしまう）。
 *
 * iOS 限定（code-reviewer 指摘）: 本 Issue の実機フィードバックは iOS のみで、
 * `AppScreenProps.footer` の既存コメントが述べるとおり Android は Expo 既定の
 * `windowSoftInputMode: "adjustResize"` により、footer が
 * `KeyboardAvoidingView` を介さずとも自然にキーボードの上へ再配置される
 * （`keyboardShouldPersistTaps="handled"` によりキーボード表示中でも footer を
 * タップできる、Issue 93 の既存挙動）。iOS 専用の
 * `keyboardWillShow`/`keyboardWillHide` を Android 向けに
 * `keyboardDidShow`/`keyboardDidHide` へ置き換えて同じ「隠す」挙動を全体適用
 * すると、Android では未報告かつ未検証のまま「キーボード表示中は footer を
 * タップできない」という退行を持ち込むことになる。そのため、この hook は
 * `Platform.OS === 'ios'` のときだけ購読し、Android の挙動は Issue 93 の
 * ままにする。
 */
function useFooterHiddenForKeyboard(hasFooter: boolean): boolean {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!hasFooter || Platform.OS !== 'ios') return;
    const showSubscription = Keyboard.addListener('keyboardWillShow', () =>
      setKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener('keyboardWillHide', () =>
      setKeyboardVisible(false)
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      // Codex 指摘（low）: footer が truthy → falsy に変わる間にキーボードが
      // 閉じずに終わると、次に truthy へ戻ったとき古い keyboardVisible が
      // 残り得る。購読解除と同時に false へリセットし、次回 truthy 時は
      // 必ず「キーボード非表示」から再開させる。
      setKeyboardVisible(false);
    };
  }, [hasFooter]);

  return hasFooter && keyboardVisible;
}

interface AppScreenProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  /**
   * Issue 90: 多くの単一行入力を持つ画面（`IntroCardEditScreen` 等）が、
   * スクロールでキーボードを閉じられるよう `"on-drag"` を渡せるようにする
   * optional prop。既定は React Native の `ScrollView` の既定値（`"none"`）の
   * まま変えず、他の全 Screen の挙動には影響しない。
   */
  readonly keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  /**
   * Issue 93: 保存・生成ボタン等を `ScrollView` の外（画面下部）へ固定したい
   * 画面向けの optional prop。渡さない既存の全 Screen は今までどおり
   * `children` の末尾にボタンを並べるだけで、レイアウトは変わらない。
   * `KeyboardAvoidingView` で包む（iOS は `padding` behavior、Android は
   * `windowSoftInputMode` の既定挙動に委ねる。RN の標準パターン）。Issue 117
   * 以降、iOS はキーボード表示中に footer をレンダーツリーから外して隠し
   * （キーボードが閉じると再表示する）、Android は Issue 93 の既定挙動の
   * まま footer がキーボードの上へ自然に再配置される（下の
   * `useFooterHiddenForKeyboard` を参照）。footer 表示中の下部 padding は
   * `hasFooter` の有無だけに依存し、キーボードの表示状態では変わらない。
   */
  readonly footer?: ReactNode;
  /**
   * Issue 118: 自己紹介カード系画面（`IntroCardScreen` / `IntroCardEditScreen`）の
   * 右上ヘッダーへ、言語切替の常設トグルを表示する。両方渡した画面だけに出る
   * optional prop で、渡さない既存の全 Screen は今までどおり BrandMark ロックアップ
   * だけの見た目のまま変わらない。以前は Settings 画面までスクロールしないと
   * 切り替えられなかった（owner 実機フィードバック）。
   */
  readonly locale?: Locale;
  readonly onChangeLocale?: (locale: Locale) => void;
}

export default function AppScreen({
  eyebrow,
  title,
  description,
  children,
  keyboardDismissMode,
  footer,
  locale,
  onChangeLocale,
}: AppScreenProps) {
  // code-reviewer 指摘: `footer !== undefined && footer !== null` だと
  // `footer={false}` 等の falsy な値でも「footer あり」判定になり、
  // 中身が空のボーダー付き footer バーが描画されてしまう。既存の
  // `{footer ? <View>...} : null}`（Issue 93）と同じ truthy 判定に揃える。
  const hasFooter = Boolean(footer);
  const hideFooterForKeyboard = useFooterHiddenForKeyboard(hasFooter);
  const [footerHeight, setFooterHeight] = useState(0);

  function handleFooterLayout(event: LayoutChangeEvent): void {
    setFooterHeight(event.nativeEvent.layout.height);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            hasFooter
              ? { paddingBottom: BASE_CONTENT_BOTTOM_PADDING + footerHeight }
              : null,
          ]}
          keyboardDismissMode={keyboardDismissMode}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <View style={styles.brandLockup}>
              <BrandMark size={20} />
              <Text style={styles.brand}>
                TenkaCloud <Text style={styles.brandSub}>Passport</Text>
              </Text>
            </View>
            {locale && onChangeLocale ? (
              <Pressable
                accessibilityHint={MESSAGES[locale].common.localeToggleHint}
                accessibilityLabel={MESSAGES[
                  locale
                ].common.localeToggleAccessibilityLabel(
                  LOCALE_LABELS[locale],
                  LOCALE_LABELS[nextLocale(locale)]
                )}
                accessibilityRole="button"
                onPress={() => onChangeLocale(nextLocale(locale))}
                style={styles.localeToggle}
              >
                <Text style={styles.localeToggleText}>
                  {locale.toUpperCase()}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.body}>{children}</View>
        </ScrollView>
        {/* `hasFooter &&` は一見 `hideFooterForKeyboard` に畳み込めそうだが
            省略しない: `hideFooterForKeyboard` は footer が無い画面でも
            常に `false`（`hasFooter && keyboardVisible` の結果）を返すため、
            `hasFooter` を外すと footer を持たない画面にまで空の
            `styles.footer`（border-top 付き）バーが描画されてしまう。 */}
        {hasFooter && !hideFooterForKeyboard ? (
          <View onLayout={handleFooterLayout} style={styles.footer}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 680,
    padding: spacing.lg,
    paddingBottom: BASE_CONTENT_BOTTOM_PADDING,
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 44,
  },
  brandLockup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  localeToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
  },
  localeToggleText: {
    color: colors.ink,
    fontFamily: monoFontFamily,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  brand: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  brandSub: {
    color: colors.mutedLight,
  },
  eyebrow: {
    color: colors.mutedLight,
    fontFamily: monoFontFamily,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 42,
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 26,
    marginTop: spacing.md,
  },
  body: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
