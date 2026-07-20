import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../ui/theme';
import StatusDot from './StatusDot';

interface ExpiryWarningBannerProps {
  readonly message: string;
}

/**
 * Issue 72 B: ActiveLounge / HostInvite / Outcome の 3 画面でバイト単位一致していた
 * 満了間近バナーの共有原子。表示するかどうかの判定は `qr-invite-accessibility.test.ts`
 * のソース文字列順契約があるため screen 側に残し、ここでは message を受け取って
 * 表示するだけにする。
 */
export default function ExpiryWarningBanner({
  message,
}: ExpiryWarningBannerProps) {
  return (
    <View accessibilityRole="alert" style={styles.expiryWarning}>
      <StatusDot tone="warning" style={styles.dot} />
      <Text style={styles.expiryWarningText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  expiryWarning: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  dot: {
    marginTop: 7,
  },
  expiryWarningText: {
    color: colors.warningText,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
});
