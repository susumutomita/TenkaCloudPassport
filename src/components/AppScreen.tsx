import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing } from '../ui/theme';
import { monoFontFamily } from '../ui/typography';
import BrandMark from './BrandMark';

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
   * `KeyboardAvoidingView` で包み、キーボード表示中も footer が隠れないように
   * する（iOS は `padding` behavior、Android は `windowSoftInputMode` の既定
   * 挙動に委ねる。RN の標準パターン）。
   */
  readonly footer?: ReactNode;
}

export default function AppScreen({
  eyebrow,
  title,
  description,
  children,
  keyboardDismissMode,
  footer,
}: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode={keyboardDismissMode}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <BrandMark size={20} />
            <Text style={styles.brand}>
              TenkaCloud <Text style={styles.brandSub}>Passport</Text>
            </Text>
          </View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.body}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
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
    paddingBottom: 56,
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 44,
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
