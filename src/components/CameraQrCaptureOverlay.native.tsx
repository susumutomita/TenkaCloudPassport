import { CameraView } from 'expo-camera';
import { useSyncExternalStore } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CameraQrCapturePort } from '../app/camera-qr-capture';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { colors } from '../ui/theme';
import CameraQrCapturePanel from './CameraQrCapturePanel';

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
  // `visible={false}` の Modal が children を保持するかは Platform 実装の詳細に
  // 依るため、そこへカメラの停止を任せない。capturing 以外では Component ごと
  // 描画しないことで、`CameraView` の unmount とカメラの解放を保証する。
  if (status !== 'capturing') return null;
  return (
    <Modal animationType="slide" onRequestClose={port.cancel} visible>
      <SafeAreaProvider>
        <View style={styles.container}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(result) => port.deliver(result.data)}
            style={styles.camera}
          />
          <CameraQrCapturePanel locale={locale} onCancel={port.cancel} />
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
    minHeight: 0,
  },
  container: {
    backgroundColor: colors.ink,
    flex: 1,
  },
});
