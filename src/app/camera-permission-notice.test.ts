import { describe, expect, it } from 'bun:test';
import { cameraPermissionNotice } from './camera-permission-notice';
import type { CameraPermissionState } from './qr-scanner-port';

const STATES: readonly CameraPermissionState[] = [
  'not-determined',
  'granted',
  'denied',
  'revoked',
  'hardware-unavailable',
];

describe('Camera Permission の UI 状態別 Notice', () => {
  it('5 つの Permission 状態それぞれに固有の title と message を持つ', () => {
    const notices = STATES.map((state) => cameraPermissionNotice(state));

    expect(new Set(notices.map((notice) => notice.title)).size).toBe(
      STATES.length
    );
  });

  it('not-determined だけが Request を提示する', () => {
    expect(cameraPermissionNotice('not-determined').canRequest).toBe(true);
    for (const state of STATES.filter((s) => s !== 'not-determined')) {
      expect(cameraPermissionNotice(state).canRequest).toBe(false);
    }
  });

  it('denied と revoked だけが再確認を提示する', () => {
    expect(cameraPermissionNotice('denied').canRecheck).toBe(true);
    expect(cameraPermissionNotice('revoked').canRecheck).toBe(true);
    expect(cameraPermissionNotice('granted').canRecheck).toBe(false);
    expect(cameraPermissionNotice('hardware-unavailable').canRecheck).toBe(
      false
    );
    expect(cameraPermissionNotice('not-determined').canRecheck).toBe(false);
  });

  it('denied、revoked、hardware-unavailable は他機能が利用可能である旨を含む', () => {
    for (const state of [
      'denied',
      'revoked',
      'hardware-unavailable',
    ] as const) {
      expect(cameraPermissionNotice(state).message).toContain(
        'Passport の編集、Backup、Settings'
      );
    }
  });

  it('locale が en のとき、5 状態それぞれに固有の英語 title を持つ', () => {
    const notices = STATES.map((state) => cameraPermissionNotice(state, 'en'));

    expect(new Set(notices.map((notice) => notice.title)).size).toBe(
      STATES.length
    );
    for (const state of [
      'denied',
      'revoked',
      'hardware-unavailable',
    ] as const) {
      expect(cameraPermissionNotice(state, 'en').message).toContain(
        'Editing your Passport, Backup, and Settings'
      );
    }
  });
});
