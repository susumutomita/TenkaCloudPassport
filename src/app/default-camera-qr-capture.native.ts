import { Camera } from 'expo-camera';
import {
  type CameraQrCapturePort,
  cameraPermissionStateFromResponse,
  createCameraQrCapturePort,
} from './camera-qr-capture';

/**
 * Native Build（Expo Go・Development Build・本番ビルド）の Composition。
 * `expo-camera` の権限 API をこの 1 ファイルへ閉じ込め、状態導出そのものは
 * Platform 非依存の `cameraPermissionStateFromResponse`（`bun test` で検証済み）
 * へ委譲する。`default-agent-model-provider.ts` / `.native.ts` と同じ
 * 「Native Module の import は `.native.ts` の中だけ」という既存 idiom に従う。
 */
export function createDefaultCameraQrCapturePort(): CameraQrCapturePort {
  return createCameraQrCapturePort({
    getPermissionState: async () =>
      cameraPermissionStateFromResponse(
        await Camera.getCameraPermissionsAsync()
      ),
    requestPermission: async () =>
      cameraPermissionStateFromResponse(
        await Camera.requestCameraPermissionsAsync()
      ),
  });
}
