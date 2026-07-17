import type { CameraPermissionState } from './qr-scanner-port';

export interface CameraPermissionNotice {
  readonly title: string;
  readonly message: string;
  readonly canRequest: boolean;
  readonly canRecheck: boolean;
}

const OTHER_FEATURES_REMAIN_AVAILABLE =
  'Passport の編集、Backup、Settings はこのまま利用できます。';

const NOTICES: Record<CameraPermissionState, CameraPermissionNotice> = {
  'not-determined': {
    title: 'カメラの利用許可が必要です。',
    message: `QR を読み取るには、カメラへのアクセスを許可してください。${OTHER_FEATURES_REMAIN_AVAILABLE}`,
    canRequest: true,
    canRecheck: false,
  },
  granted: {
    title: 'カメラを利用できます。',
    message: 'QR を読み取ってください。',
    canRequest: false,
    canRecheck: false,
  },
  denied: {
    title: 'カメラの利用が拒否されています。',
    message: `この端末の設定でカメラの許可を変更できます。${OTHER_FEATURES_REMAIN_AVAILABLE}`,
    canRequest: false,
    canRecheck: true,
  },
  revoked: {
    title: 'カメラの利用が後から無効化されました。',
    message: `設定でカメラを再度許可すると QR を読み取れます。${OTHER_FEATURES_REMAIN_AVAILABLE}`,
    canRequest: false,
    canRecheck: true,
  },
  'hardware-unavailable': {
    title: 'この端末にはカメラがありません。',
    message: `QR の読み取りはこの端末で利用できません。${OTHER_FEATURES_REMAIN_AVAILABLE}`,
    canRequest: false,
    canRecheck: false,
  },
};

export function cameraPermissionNotice(
  state: CameraPermissionState
): CameraPermissionNotice {
  return NOTICES[state];
}
