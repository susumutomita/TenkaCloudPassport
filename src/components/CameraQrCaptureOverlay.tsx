import type { CameraQrCapturePort } from '../app/camera-qr-capture';
import type { Locale } from '../app/i18n/locale';

/**
 * Issue 146: Web / Bun Test 経路にはカメラが無い。この経路の
 * `createDefaultCameraQrCapturePort` は権限状態を `hardware-unavailable` に固定し、
 * `capture()` は Camera Preview を開く前に `PERMISSION_NOT_GRANTED` で失敗する
 * （画面には「この端末にはカメラがありません」という既存文言が出る）。
 * したがってこの経路で Preview を描画する必要は無く、`expo-camera` を Web Bundle
 * へ持ち込まないためにも何も描画しない。実体は
 * `CameraQrCaptureOverlay.native.tsx` にあり、Metro が Native Build でだけ差し替える。
 */
export interface CameraQrCaptureOverlayProps {
  readonly port: CameraQrCapturePort;
  readonly locale?: Locale;
}

export default function CameraQrCaptureOverlay(
  _props: CameraQrCaptureOverlayProps
) {
  return null;
}
