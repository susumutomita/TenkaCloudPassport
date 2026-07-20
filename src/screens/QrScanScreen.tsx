import { StyleSheet, Text, View } from 'react-native';
import { cameraPermissionNotice } from '../app/camera-permission-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { CameraPermissionState } from '../app/qr-scanner-port';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import { colors, primaryEmphasisBorder, spacing } from '../ui/theme';

interface QrScanScreenProps {
  readonly permissionState: CameraPermissionState;
  readonly errorMessage: string | null;
  readonly locale?: Locale;
  readonly onRequestPermission: () => void;
  readonly onRecheckPermission: () => void;
  readonly onScan: () => void;
  readonly onBackToHostInvite: () => void;
  readonly onBackToProfile: () => void;
}

export default function QrScanScreen({
  permissionState,
  errorMessage,
  locale = DEFAULT_LOCALE,
  onRequestPermission,
  onRecheckPermission,
  onScan,
  onBackToHostInvite,
  onBackToProfile,
}: QrScanScreenProps) {
  const t = MESSAGES[locale].qrScan;
  const notice = cameraPermissionNotice(permissionState, locale);
  const canScan = permissionState === 'granted';

  return (
    <AppScreen
      description={t.description}
      eyebrow="Step 4 / Guest Scan"
      title={t.title}
    >
      <View
        accessibilityRole={permissionState === 'granted' ? 'summary' : 'alert'}
        style={[
          styles.notice,
          permissionState === 'granted' ? undefined : styles.noticeWarning,
        ]}
      >
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text style={styles.noticeText}>{notice.message}</Text>
      </View>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      {notice.canRequest ? (
        <ActionButton
          label={t.requestPermissionButton}
          onPress={onRequestPermission}
        />
      ) : null}
      {notice.canRecheck ? (
        <ActionButton
          label={t.recheckPermissionButton}
          onPress={onRecheckPermission}
          variant="secondary"
        />
      ) : null}
      <ActionButton
        accessibilityHint={t.scanButtonHint}
        disabled={!canScan}
        label={t.scanButton}
        onPress={onScan}
      />
      <ActionButton
        label={t.backToHostInviteButton}
        onPress={onBackToHostInvite}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={t.backToProfileHint}
        label={t.backToProfileButton}
        onPress={onBackToProfile}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    ...primaryEmphasisBorder,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noticeWarning: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
