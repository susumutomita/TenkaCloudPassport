import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function nativeSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'CameraQrCaptureOverlay.native.tsx');
}

function webSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'CameraQrCaptureOverlay.tsx');
}

/**
 * Issue 146: `CameraQrCaptureOverlay.native.tsx` は Metro が Native Build でだけ
 * 解決するため `bun test` から実行できず、カバレッジにも現れない
 * （`web-crypto-random.native.ts` と同じ既存 idiom）。実行できない代わりに、
 * 実カメラ経路が Port 契約から外れていないことをソーステキストで固定する。
 * `Card.tsx` / `AppScreen.tsx` の既存ソース契約テストと同じ流儀。
 */
describe('CameraQrCaptureOverlay（実カメラ Preview）のソース契約', () => {
  it('復号できた frame を Port の deliver へそのまま渡す', async () => {
    const text = await nativeSource();

    expect(text).toContain(
      'onBarcodeScanned={(result) => port.deliver(result.data)}'
    );
  });

  it('QR 以外のバーコード種別を読み取らない', async () => {
    const text = await nativeSource();

    expect(text).toContain("barcodeScannerSettings={{ barcodeTypes: ['qr'] }}");
  });

  it('Preview の表示は Port の status だけから決め、独自の開閉 state を持たない', async () => {
    const text = await nativeSource();

    expect(text).toContain('useSyncExternalStore');
    expect(text).toContain('port.subscribe');
    expect(text).toContain("visible={status === 'capturing'}");
    expect(text).not.toContain('useState');
  });

  it('取り消し導線を明示ボタンと Android の戻る操作の両方へつなぐ', async () => {
    const text = await nativeSource();

    expect(text).toContain('onRequestClose={port.cancel}');
    expect(text).toContain('onPress={port.cancel}');
    expect(text).toContain('accessibilityHint={t.cancelButtonHint}');
  });

  it('読み取った内容を保存も送信もしない', async () => {
    const text = await nativeSource();

    expect(text).not.toContain('fetch(');
    expect(text).not.toContain('Storage');
    expect(text).not.toContain('writeFile');
  });

  it('文言は Message Catalog から引き、画面へ直書きしない', async () => {
    const text = await nativeSource();

    expect(text).toContain('MESSAGES[locale].cameraQrCapture');
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('Web 版は expo-camera を import せず、何も描画しない', async () => {
    const text = await webSource();

    expect(text).not.toContain("from 'expo-camera'");
    expect(text).toContain('return null;');
  });

  it('Native 版だけが expo-camera を import する（Screen 側へ漏らさない）', async () => {
    const text = await nativeSource();

    expect(text).toContain("from 'expo-camera'");
  });
});
