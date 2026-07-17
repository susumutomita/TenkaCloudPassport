import { StyleSheet, Text, View } from 'react-native';
import { cameraPermissionNotice } from '../app/camera-permission-notice';
import type { CameraPermissionState } from '../app/qr-scanner-port';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import { colors, spacing } from '../ui/theme';

interface QrScanScreenProps {
  readonly permissionState: CameraPermissionState;
  readonly errorMessage: string | null;
  readonly onRequestPermission: () => void;
  readonly onRecheckPermission: () => void;
  readonly onScan: () => void;
  readonly onBackToHostInvite: () => void;
  readonly onBackToProfile: () => void;
}

export default function QrScanScreen({
  permissionState,
  errorMessage,
  onRequestPermission,
  onRecheckPermission,
  onScan,
  onBackToHostInvite,
  onBackToProfile,
}: QrScanScreenProps) {
  const notice = cameraPermissionNotice(permissionState);
  const canScan = permissionState === 'granted';

  return (
    <AppScreen
      description="Host が表示した Invite QR を読み取ります。Camera の利用を拒否しても、Passport の編集や他の機能は引き続き利用できます。"
      eyebrow="Step 4 / Guest Scan"
      title="Invite QR を読み取る。"
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
          label="カメラの利用を許可する"
          onPress={onRequestPermission}
        />
      ) : null}
      {notice.canRecheck ? (
        <ActionButton
          label="Camera 権限を再確認する"
          onPress={onRecheckPermission}
          variant="secondary"
        />
      ) : null}
      <ActionButton
        accessibilityHint="Host が表示している Invite QR を読み取ります。"
        disabled={!canScan}
        label="QR を読み取る"
        onPress={onScan}
      />
      <ActionButton
        label="Host の画面へ戻る"
        onPress={onBackToHostInvite}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint="Camera 権限の状態に関わらず、Passport の編集画面を利用できます。"
        label="Passport の編集へ戻る"
        onPress={onBackToProfile}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
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
