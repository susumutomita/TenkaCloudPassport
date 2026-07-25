import { describe, expect, it } from 'bun:test';
import { createDefaultCameraQrCapturePort } from './default-camera-qr-capture';
import { QrScanError } from './qr-scanner-port';

/**
 * `.native.ts` 側（`expo-camera` 実体）は Metro の Platform 解決でのみ読まれ、
 * `bun test` からは実行されない（`web-crypto-random.native.ts` と同じ既存 idiom）。
 * ここでは Web / Bun Test 経路の既定 Composition が「黙って何も起きない」形に
 * ならないことだけを固定する。
 */
describe('既定の Camera QR Capture Composition（Web / Bun Test）', () => {
  it('カメラが無い端末として hardware-unavailable を返す', async () => {
    const port = createDefaultCameraQrCapturePort();

    expect(await port.getPermissionState()).toBe('hardware-unavailable');
    expect(await port.requestPermission()).toBe('hardware-unavailable');
  });

  it('capture は Preview を開かず PERMISSION_NOT_GRANTED で失敗する', async () => {
    const port = createDefaultCameraQrCapturePort();

    try {
      await port.capture();
      throw new Error('QrScanError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(QrScanError);
      if (error instanceof QrScanError) {
        expect(error.code).toBe('PERMISSION_NOT_GRANTED');
      }
    }
    expect(port.status).toBe('idle');
  });
});
