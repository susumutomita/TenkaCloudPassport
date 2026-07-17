import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { type AppMessages, MESSAGES } from './i18n/messages';
import type { CameraPermissionState } from './qr-scanner-port';

export interface CameraPermissionNotice {
  readonly title: string;
  readonly message: string;
  readonly canRequest: boolean;
  readonly canRecheck: boolean;
}

function notices(
  messages: AppMessages
): Record<CameraPermissionState, CameraPermissionNotice> {
  const other = messages.cameraPermissionNotice.otherFeaturesRemainAvailable;
  return {
    'not-determined': {
      title: messages.cameraPermissionNotice.notDeterminedTitle,
      message: `${messages.cameraPermissionNotice.notDeterminedMessage}${other}`,
      canRequest: true,
      canRecheck: false,
    },
    granted: {
      title: messages.cameraPermissionNotice.grantedTitle,
      message: messages.cameraPermissionNotice.grantedMessage,
      canRequest: false,
      canRecheck: false,
    },
    denied: {
      title: messages.cameraPermissionNotice.deniedTitle,
      message: `${messages.cameraPermissionNotice.deniedMessage}${other}`,
      canRequest: false,
      canRecheck: true,
    },
    revoked: {
      title: messages.cameraPermissionNotice.revokedTitle,
      message: `${messages.cameraPermissionNotice.revokedMessage}${other}`,
      canRequest: false,
      canRecheck: true,
    },
    'hardware-unavailable': {
      title: messages.cameraPermissionNotice.hardwareUnavailableTitle,
      message: `${messages.cameraPermissionNotice.hardwareUnavailableMessage}${other}`,
      canRequest: false,
      canRecheck: false,
    },
  };
}

export function cameraPermissionNotice(
  state: CameraPermissionState,
  locale: Locale = DEFAULT_LOCALE
): CameraPermissionNotice {
  return notices(MESSAGES[locale])[state];
}
