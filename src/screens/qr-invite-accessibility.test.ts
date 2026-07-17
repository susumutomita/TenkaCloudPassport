import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

const FORBIDDEN_NATIVE_TRANSPORT_IMPORTS = [
  'expo-camera',
  'react-native-camera',
  'react-native-vision-camera',
  'react-native-svg',
];

describe('QR 招待・共有確認・Ready フローの Accessibility 契約', () => {
  it('Host Invite 画面は QR、期限、Screenshot リスク、参加者状態、主操作の順に配置する', async () => {
    const text = await source('HostInviteScreen.tsx');

    expect(text).toContain('accessibilityLabel=');
    expect(text).toContain('accessibilityRole=');
    expectInOrder(text, [
      'Invite QR を対面の相手に見せてください',
      '<QrCodeView',
      '残り',
      'Screenshot',
      "notice.level === 'warning'",
      '参加者 {participants.length}',
      '自分も Ready にする',
      'ゲストとして QR を読み取る',
      'キャンセル',
    ]);
  });

  it('Host Invite 画面は満了 1 分前の content-free 通知を expiry-notice から取得する', async () => {
    const text = await source('HostInviteScreen.tsx');

    expect(text).toContain("from '../app/expiry-notice'");
    expect(text).toContain('expiryNotice(remainingMs)');
  });

  it('Host Invite 画面は Native Camera / SVG Package を直接 import しない', async () => {
    const text = await source('HostInviteScreen.tsx');

    for (const forbidden of FORBIDDEN_NATIVE_TRANSPORT_IMPORTS) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('QR Scan 画面は 5 つの Camera Permission 状態すべてに対応した文言を持つ', async () => {
    const text = await source('QrScanScreen.tsx');
    const noticeText = await source('../app/camera-permission-notice.ts');

    expect(text).toContain('cameraPermissionNotice');
    for (const message of [
      'カメラの利用許可が必要です。',
      'カメラを利用できます。',
      'カメラの利用が拒否されています。',
      'カメラの利用が後から無効化されました。',
      'この端末にはカメラがありません。',
    ]) {
      expect(noticeText).toContain(message);
    }
  });

  it('QR Scan 画面は Camera 権限の状態に関わらず Passport 編集へ戻れる', async () => {
    const text = await source('QrScanScreen.tsx');

    expect(text).toContain('Passport の編集へ戻る');
    expectInOrder(text, ['onRequestPermission', 'onScan', 'onBackToProfile']);
  });

  it('QR Scan 画面は Native Camera Package を直接 import しない', async () => {
    const text = await source('QrScanScreen.tsx');

    for (const forbidden of FORBIDDEN_NATIVE_TRANSPORT_IMPORTS) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('QrCodeView は装飾行列に image role と Payload 由来の label を付ける', async () => {
    const text = await source('../components/QrCodeView.tsx');

    expect(text).toContain('accessibilityRole="image"');
    expect(text).toContain('accessibilityLabel');
    for (const forbidden of FORBIDDEN_NATIVE_TRANSPORT_IMPORTS) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('Domain 層は Native Camera / Transport Package を直接 import しない', async () => {
    for (const fileName of [
      '../domain/lounge-invite.ts',
      '../domain/lounge-room.ts',
      '../protocol/qr-payload.ts',
      '../protocol/lounge-invite-schema.ts',
    ]) {
      const text = await source(fileName);
      for (const forbidden of [
        ...FORBIDDEN_NATIVE_TRANSPORT_IMPORTS,
        'react-native',
        'expo-file-system',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
