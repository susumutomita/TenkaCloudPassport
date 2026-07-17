import { describe, expect, it } from 'bun:test';
import { LoungeRoomError } from '../domain/lounge-room';
import { QrPayloadError } from '../protocol/qr-payload';
import { qrFlowErrorMessage } from './qr-error-notice';
import { QrScanError } from './qr-scanner-port';

describe('QR フローの Error メッセージ変換', () => {
  it('QrPayloadError の 8 種類の型付きコードすべてに固有の日本語文言を返す', () => {
    const codes: readonly QrPayloadError['code'][] = [
      'NOT_PASSPORT_QR',
      'INVALID_PREFIX',
      'OVERSIZED_PAYLOAD',
      'INVALID_JSON',
      'UNKNOWN_VERSION',
      'DUPLICATE_SCAN',
    ];
    const messages = codes.map((code) =>
      qrFlowErrorMessage(new QrPayloadError(code, 'x'))
    );

    expect(new Set(messages).size).toBe(codes.length);
  });

  it('LoungeRoomError の各コードに固有の日本語文言を返す', () => {
    const codes: readonly LoungeRoomError['code'][] = [
      'INVALID_CLOCK',
      'ROOM_EXPIRED',
      'ROOM_FULL',
      'ROOM_NOT_FORMING',
      'PARTICIPANT_NOT_FOUND',
      'INVALID_PARTICIPANT_COUNT',
    ];
    const messages = codes.map((code) =>
      qrFlowErrorMessage(new LoungeRoomError(code, 'x'))
    );

    expect(new Set(messages).size).toBe(codes.length);
  });

  it('QrScanError の各コードに固有の日本語文言を返す', () => {
    expect(
      qrFlowErrorMessage(new QrScanError('PERMISSION_NOT_GRANTED', 'x'))
    ).toContain('カメラ');
    expect(
      qrFlowErrorMessage(new QrScanError('NOTHING_TO_SCAN', 'x'))
    ).toContain('QR');
  });

  it('未分類の Error はその message をそのまま使う', () => {
    expect(qrFlowErrorMessage(new Error('個別のエラーメッセージ'))).toBe(
      '個別のエラーメッセージ'
    );
  });

  it('Error ではない例外には既定の案内文を返す', () => {
    expect(qrFlowErrorMessage('文字列の例外')).toBe(
      '読み取りに失敗しました。もう一度実行してください。'
    );
  });
});
