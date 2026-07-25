import {
  type CameraQrCapturePort,
  createCameraQrCapturePort,
} from './camera-qr-capture';

/**
 * Bun Test / Web の既定 Composition。この経路にはカメラが無いため、権限状態を
 * `hardware-unavailable` に固定する。`capture()` は Preview を開かずに
 * `QrScanError('PERMISSION_NOT_GRANTED')` で失敗し、画面には
 * 「この端末にはカメラがありません」という既存の文言が出る（黙って何も
 * 起きない no-op にはしない）。Native Build だけが `.native.ts` へ差し替える。
 */
export function createDefaultCameraQrCapturePort(): CameraQrCapturePort {
  return createCameraQrCapturePort({
    getPermissionState: () => Promise.resolve('hardware-unavailable'),
    requestPermission: () => Promise.resolve('hardware-unavailable'),
  });
}
