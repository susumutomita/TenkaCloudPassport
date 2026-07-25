import { describe, expect, it } from 'bun:test';
import {
  type CameraPermissionGateway,
  cameraPermissionStateFromResponse,
  createCameraQrCapturePort,
} from './camera-qr-capture';
import { type CameraPermissionState, QrScanError } from './qr-scanner-port';

function gatewayOf(
  initial: CameraPermissionState,
  afterRequest: CameraPermissionState = initial
): CameraPermissionGateway & { readonly requestCount: () => number } {
  let requested = 0;
  return {
    getPermissionState: () => Promise.resolve(initial),
    requestPermission: () => {
      requested += 1;
      return Promise.resolve(afterRequest);
    },
    requestCount: () => requested,
  };
}

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

/** `status` が目的の値になるまで microtask を進める（権限確認は非同期のため）。 */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Camera 権限 Response の状態導出', () => {
  it('granted はそのまま granted になる', () => {
    expect(
      cameraPermissionStateFromResponse({
        status: 'granted',
        canAskAgain: true,
      })
    ).toBe('granted');
  });

  it('undetermined は not-determined になる', () => {
    expect(
      cameraPermissionStateFromResponse({
        status: 'undetermined',
        canAskAgain: true,
      })
    ).toBe('not-determined');
  });

  it('再要求できる denied は denied になる', () => {
    expect(
      cameraPermissionStateFromResponse({ status: 'denied', canAskAgain: true })
    ).toBe('denied');
  });

  it('再要求できない denied は、設定から無効化された revoked として扱う', () => {
    expect(
      cameraPermissionStateFromResponse({
        status: 'denied',
        canAskAgain: false,
      })
    ).toBe('revoked');
  });

  it('未知の status は granted へ倒さず denied へ fail-closed する', () => {
    expect(
      cameraPermissionStateFromResponse({
        status: 'unexpected',
        canAskAgain: true,
      })
    ).toBe('denied');
  });
});

describe('Camera QR Capture Port（実カメラ 1 回分の読取）', () => {
  it('権限状態を Gateway からそのまま公開する', async () => {
    const port = createCameraQrCapturePort(gatewayOf('denied'));

    expect(await port.getPermissionState()).toBe('denied');
    expect(await port.requestPermission()).toBe('denied');
  });

  it('開始前は idle で、Camera Preview を表示しない', () => {
    const port = createCameraQrCapturePort(gatewayOf('granted'));

    expect(port.status).toBe('idle');
  });

  it('granted なら Preview を開き、読み取れた文字列で解決する', async () => {
    const port = createCameraQrCapturePort(gatewayOf('granted'));

    const captured = port.capture();
    await settle();
    expect(port.status).toBe('capturing');

    port.deliver('https://card.tenkacloud.com/c/#abc');

    expect(await captured).toBe('https://card.tenkacloud.com/c/#abc');
    expect(port.status).toBe('idle');
  });

  it('not-determined のときは 1 度だけ権限を要求してから Preview を開く', async () => {
    const gateway = gatewayOf('not-determined', 'granted');
    const port = createCameraQrCapturePort(gateway);

    const captured = port.capture();
    expect(port.status).toBe('requesting-permission');
    await settle();

    expect(gateway.requestCount()).toBe(1);
    expect(port.status).toBe('capturing');
    port.deliver('raw');
    await captured;
  });

  it('要求しても granted にならなければ Preview を開かず PERMISSION_NOT_GRANTED で失敗する', async () => {
    const port = createCameraQrCapturePort(
      gatewayOf('not-determined', 'denied')
    );

    const captured = port.capture();
    await expectScanError(() => captured, 'PERMISSION_NOT_GRANTED');
    expect(port.status).toBe('idle');
  });

  it('hardware-unavailable の端末では Preview を開かない', async () => {
    const port = createCameraQrCapturePort(gatewayOf('hardware-unavailable'));

    await expectScanError(() => port.capture(), 'PERMISSION_NOT_GRANTED');
    expect(port.status).toBe('idle');
  });

  it('取り消すと SCAN_CANCELLED で失敗し、Preview を閉じる', async () => {
    const port = createCameraQrCapturePort(gatewayOf('granted'));

    const captured = port.capture();
    await settle();
    port.cancel();

    await expectScanError(() => captured, 'SCAN_CANCELLED');
    expect(port.status).toBe('idle');
  });

  it('権限確認中の取り消しでも Preview を開かずに終わる', async () => {
    const port = createCameraQrCapturePort(
      gatewayOf('not-determined', 'granted')
    );

    const captured = port.capture();
    port.cancel();
    await settle();

    await expectScanError(() => captured, 'SCAN_CANCELLED');
    expect(port.status).toBe('idle');
  });

  it('待機していないときの deliver・cancel は何も起こさない', async () => {
    const port = createCameraQrCapturePort(gatewayOf('granted'));

    port.deliver('raw');
    port.cancel();

    expect(port.status).toBe('idle');
  });

  it('Preview を開く前に届いた frame は取り込まない（権限確認中の誤配送を無視する）', async () => {
    const port = createCameraQrCapturePort(
      gatewayOf('not-determined', 'granted')
    );

    const captured = port.capture();
    port.deliver('too-early');
    await settle();
    expect(port.status).toBe('capturing');

    port.deliver('actual');

    expect(await captured).toBe('actual');
  });

  it('連続した capture は同じ 1 回分の読取を共有する（カメラを二重に開かない）', async () => {
    const gateway = gatewayOf('not-determined', 'granted');
    const port = createCameraQrCapturePort(gateway);

    const first = port.capture();
    const second = port.capture();
    await settle();
    port.deliver('raw');

    expect(await first).toBe('raw');
    expect(await second).toBe('raw');
    expect(gateway.requestCount()).toBe(1);
  });

  it('解決後の余分な frame は次の capture へ紛れ込まない', async () => {
    const port = createCameraQrCapturePort(gatewayOf('granted'));

    const first = port.capture();
    await settle();
    port.deliver('first');
    await first;
    port.deliver('stale-frame');

    const second = port.capture();
    await settle();
    port.deliver('second');

    expect(await second).toBe('second');
  });

  it('Gateway が失敗したらその例外を伝え、Preview を閉じる', async () => {
    const port = createCameraQrCapturePort({
      getPermissionState: () => Promise.reject(new Error('camera unavailable')),
      requestPermission: () => Promise.resolve('granted'),
    });

    const captured = port.capture();

    await expect(captured).rejects.toThrow('camera unavailable');
    expect(port.status).toBe('idle');
  });

  it('status が変わるたびに購読者へ通知し、解除できる', async () => {
    const port = createCameraQrCapturePort(gatewayOf('granted'));
    const seen: string[] = [];
    const unsubscribe = port.subscribe(() => seen.push(port.status));

    const captured = port.capture();
    await settle();
    port.deliver('raw');
    await captured;
    unsubscribe();
    const ignored = port.capture();
    port.cancel();
    await ignored.catch(() => undefined);

    expect(seen).toEqual(['requesting-permission', 'capturing', 'idle']);
  });
});
