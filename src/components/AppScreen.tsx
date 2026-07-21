import type { ReactNode } from 'react';
import {
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
}

export default function AppScreen({
  eyebrow,
  title,
  description,
  children,
  keyboardDismissMode,
}: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
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
