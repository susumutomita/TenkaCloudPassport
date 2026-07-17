/**
 * M1 の QR 読取は単一端末で完結する。将来 M3 が実カメラ Transport に差し替えても
 * Screen / Domain は同じ Port だけを参照し、Native Camera Package を直接 import
 * しない（architect guidance）。
 */
export type CameraPermissionState =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'revoked'
  | 'hardware-unavailable';

export interface QrScannerPort {
  getPermissionState(): Promise<CameraPermissionState>;
  requestPermission(): Promise<CameraPermissionState>;
  scan(): Promise<string>;
}

export type QrScanErrorCode = 'PERMISSION_NOT_GRANTED' | 'NOTHING_TO_SCAN';

export class QrScanError extends Error {
  readonly code: QrScanErrorCode;

  constructor(code: QrScanErrorCode, message: string) {
    super(message);
    this.name = 'QrScanError';
    this.code = code;
  }
}

export interface InProcessQrScannerPort extends QrScannerPort {
  /** Host 側の画面が「今表示している QR」を publish する。Guest の scan() はこの値を返す。 */
  publish(raw: string | null): void;
  /** テストと単一端末デモが Camera 権限状態を明示的に切り替えるための capability。 */
  setPermissionState(state: CameraPermissionState): void;
}

export function createInProcessQrScannerPort(
  initialPermissionState: CameraPermissionState = 'not-determined'
): InProcessQrScannerPort {
  let permissionState = initialPermissionState;
  let publishedRaw: string | null = null;

  return {
    getPermissionState() {
      return Promise.resolve(permissionState);
    },
    requestPermission() {
      if (permissionState === 'not-determined') {
        permissionState = 'granted';
      }
      return Promise.resolve(permissionState);
    },
    scan() {
      if (permissionState !== 'granted') {
        return Promise.reject(
          new QrScanError(
            'PERMISSION_NOT_GRANTED',
            'カメラの利用が許可されていないため QR を読み取れません。'
          )
        );
      }
      if (publishedRaw === null) {
        return Promise.reject(
          new QrScanError(
            'NOTHING_TO_SCAN',
            '読み取れる QR がありません。Host の画面を確認してください。'
          )
        );
      }
      return Promise.resolve(publishedRaw);
    },
    publish(raw) {
      publishedRaw = raw;
    },
    setPermissionState(state) {
      permissionState = state;
    },
  };
}
