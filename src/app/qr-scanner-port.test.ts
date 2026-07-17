import { describe, expect, it } from 'bun:test';
import { createInProcessQrScannerPort, QrScanError } from './qr-scanner-port';

async function expectScanError(
  action: () => Promise<unknown>,
  code: QrScanError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('QrScanError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(QrScanError);
    if (error instanceof QrScanError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('In-Process QR Scanner Port（単一端末アダプタ）', () => {
  it('既定は not-determined から始まる', async () => {
    const port = createInProcessQrScannerPort();

    expect(await port.getPermissionState()).toBe('not-determined');
  });

  it('not-determined から要求すると granted へ遷移する', async () => {
    const port = createInProcessQrScannerPort();

    expect(await port.requestPermission()).toBe('granted');
    expect(await port.getPermissionState()).toBe('granted');
  });

  it('denied のまま要求しても denied を維持する（再プロンプトしない）', async () => {
    const port = createInProcessQrScannerPort('denied');

    expect(await port.requestPermission()).toBe('denied');
  });

  it('revoked のまま要求しても revoked を維持する', async () => {
    const port = createInProcessQrScannerPort('revoked');

    expect(await port.requestPermission()).toBe('revoked');
  });

  it('hardware-unavailable のまま要求しても変化しない', async () => {
    const port = createInProcessQrScannerPort('hardware-unavailable');

    expect(await port.requestPermission()).toBe('hardware-unavailable');
  });

  it('granted かつ publish 済みの内容を scan で取得する', async () => {
    const port = createInProcessQrScannerPort('granted');
    port.publish('TCPQ1:{}');

    expect(await port.scan()).toBe('TCPQ1:{}');
  });

  it('permission が granted でなければ scan を拒否する', async () => {
    const port = createInProcessQrScannerPort('denied');
    port.publish('TCPQ1:{}');

    await expectScanError(() => port.scan(), 'PERMISSION_NOT_GRANTED');
  });

  it('publish されていなければ scan を拒否する', async () => {
    const port = createInProcessQrScannerPort('granted');

    await expectScanError(() => port.scan(), 'NOTHING_TO_SCAN');
  });

  it('publish(null) で公開中の内容を取り下げる', async () => {
    const port = createInProcessQrScannerPort('granted');
    port.publish('TCPQ1:{}');
    port.publish(null);

    await expectScanError(() => port.scan(), 'NOTHING_TO_SCAN');
  });

  it('setPermissionState で Camera 権限状態を明示的に切り替えられる', async () => {
    const port = createInProcessQrScannerPort('not-determined');
    port.setPermissionState('hardware-unavailable');

    expect(await port.getPermissionState()).toBe('hardware-unavailable');
  });
});
