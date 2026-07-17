import { describe, expect, it } from 'bun:test';
import { LOUNGE_INVITE_SCHEMA_VERSION } from '../domain/lounge-invite';
import { encodeQrPayload, QrPayloadError } from '../protocol/qr-payload';
import { scanQrPayload } from './qr-scan-flow';
import { createInProcessQrScannerPort } from './qr-scanner-port';

const LOUNGE_ID = 'lng_00000000000000000000000000000001';

function inviteRaw(): string {
  return encodeQrPayload({
    kind: 'lounge-invite',
    value: {
      schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
      loungeId: LOUNGE_ID,
      expiresAtEpochMs: 1_000_000,
    },
  });
}

describe('QR Scan Flow のオーケストレーション', () => {
  it('Port から取得した内容を decode して既読集合を更新する', async () => {
    const port = createInProcessQrScannerPort('granted');
    const raw = inviteRaw();
    port.publish(raw);

    const result = await scanQrPayload(port, new Set());

    expect(result.payload).toEqual({
      kind: 'lounge-invite',
      value: {
        schemaVersion: LOUNGE_INVITE_SCHEMA_VERSION,
        loungeId: LOUNGE_ID,
        expiresAtEpochMs: 1_000_000,
      },
    });
    expect(result.seenRawPayloads.has(raw)).toBe(true);
  });

  it('既読集合にある内容を再度読み取ると重複読取エラーを投げる', async () => {
    const port = createInProcessQrScannerPort('granted');
    const raw = inviteRaw();
    port.publish(raw);

    await expect(scanQrPayload(port, new Set([raw]))).rejects.toBeInstanceOf(
      QrPayloadError
    );
  });

  it('Port が権限エラーを投げた場合はそのまま伝播する', async () => {
    const port = createInProcessQrScannerPort('denied');

    await expect(scanQrPayload(port, new Set())).rejects.toThrow(
      'カメラの利用が許可されていない'
    );
  });
});
