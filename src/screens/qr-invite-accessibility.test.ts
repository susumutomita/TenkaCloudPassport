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
    // Issue 15: 文言そのものは Message Catalog（`src/app/i18n/messages.ts`）へ集約した
    // ため、配置順序は Catalog の Key 参照で固定し、正確な JA/EN 文言は
    // `messages.test.ts` が担う。
    expectInOrder(text, [
      't.description',
      '<QrCodeView',
      't.remainingMinutesTitle(',
      't.screenshotRiskNotice',
      "notice.level === 'warning'",
      't.participantsTitle(',
      't.markHostReadyButton(',
      't.proceedToGuestScanButton',
      't.cancelButton',
    ]);
  });

  it('Host Invite 画面は満了 1 分前の content-free 通知を expiry-notice から取得する', async () => {
    const text = await source('HostInviteScreen.tsx');

    expect(text).toContain("from '../app/expiry-notice'");
    expect(text).toContain('expiryNotice(remainingMs, locale)');
  });

  it('Issue 15: 参加者名と Ready 状態の区切りは Message Catalog の participantRow を経由し、日本語の全角記号を直書きしない', async () => {
    const text = await source('HostInviteScreen.tsx');

    expect(text).toContain('t.participantRow(');
    expect(text).not.toContain('：');
  });

  it('Host Invite 画面は Native Camera / SVG Package を直接 import しない', async () => {
    const text = await source('HostInviteScreen.tsx');

    for (const forbidden of FORBIDDEN_NATIVE_TRANSPORT_IMPORTS) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('QR Scan 画面は 5 つの Camera Permission 状態すべてに対応した文言を Message Catalog から取得する', async () => {
    const text = await source('QrScanScreen.tsx');
    const noticeText = await source('../app/camera-permission-notice.ts');

    expect(text).toContain('cameraPermissionNotice');
    // Issue 15: 文言そのものは `src/app/i18n/messages.ts` へ集約したため、正確な JA/EN
    // 文言のピン留めは `messages.test.ts` が担う。ここでは 5 状態すべてが Message
    // Catalog の対応する Key を参照していることだけを固定する。
    for (const key of [
      'notDeterminedTitle',
      'grantedTitle',
      'deniedTitle',
      'revokedTitle',
      'hardwareUnavailableTitle',
    ]) {
      expect(noticeText).toContain(key);
    }
  });

  it('QR Scan 画面は Camera 権限の状態に関わらず Passport 編集へ戻れる', async () => {
    const text = await source('QrScanScreen.tsx');

    expect(text).toContain('t.backToProfileButton');
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
