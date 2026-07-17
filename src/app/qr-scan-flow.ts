import { decodeQrPayload, type QrPayload } from '../protocol/qr-payload';
import type { QrScannerPort } from './qr-scanner-port';

export interface QrScanResult {
  readonly payload: QrPayload;
  readonly seenRawPayloads: ReadonlySet<string>;
}

/**
 * Port から生 QR 文字列を取得し、プロトコル層の decode（重複読取判定を含む）へ渡す。
 * Port は「読み取れたか」だけを、decode は「何を読み取ったか」の妥当性だけを担う。
 */
export async function scanQrPayload(
  port: QrScannerPort,
  seenRawPayloads: ReadonlySet<string>
): Promise<QrScanResult> {
  const raw = await port.scan();
  const payload = decodeQrPayload(raw, seenRawPayloads);
  return {
    payload,
    seenRawPayloads: new Set([...seenRawPayloads, raw]),
  };
}
