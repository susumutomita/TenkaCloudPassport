import { CameraView } from 'expo-camera';
import { useSyncExternalStore } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { CameraQrCapturePort } from '../app/camera-qr-capture';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import { colors, spacing } from '../ui/theme';
import ActionButton from './ActionButton';

/**
 * Issue 146: 実カメラで相手の QR を読み取る間だけ全画面に出す Overlay。
 * `expo-camera` を import するのはこの Native 専用ファイルだけで、呼び出し側の
 * Screen は `CameraQrCapturePort` しか知らない（`qr-scanner-port.ts` の architect
 * guidance）。Web / Bun Test 経路は `CameraQrCaptureOverlay.tsx` が何も描画しない。
 *
 * 読み取った文字列はここから `port.deliver()` へ渡すだけで、この Component は
 * 保存も送信もしない。復号と検証は呼び出し側の
 * `decodeConversationAgentPeerCard` が担う。
 */
export interface CameraQrCaptureOverlayProps {
  readonly port: CameraQrCapturePort;
  readonly locale?: Locale;
}

export default function CameraQrCaptureOverlay({
  port,
  locale = DEFAULT_LOCALE,
}: CameraQrCaptureOverlayProps) {
  const status = useSyncExternalStore(
    port.subscribe,
    () => port.status,
    () => port.status
  );
  const t = MESSAGES[locale].cameraQrCapture;
  return (
    <Modal
      animationType="slide"
      onRequestClose={port.cancel}
      visible={status === 'capturing'}
    >
      <View style={styles.container}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => port.deliver(result.data)}
          style={styles.camera}
        />
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.title}>
            {t.title}
          </Text>
          <Text style={styles.hint}>{t.hint}</Text>
          <ActionButton
            accessibilityHint={t.cancelButtonHint}
            label={t.cancelButton}
            onPress={port.cancel}
            variant="secondary"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
  container: {
    backgroundColor: colors.ink,
    flex: 1,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: colors.white,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '600',
  },
});
