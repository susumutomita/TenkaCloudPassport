import { type CameraPermissionState, QrScanError } from './qr-scanner-port';

/**
 * Issue 146: 実カメラで QR を 1 件読み取るための Port。既存の `QrScannerPort`
 * （`createInProcessQrScannerPort`）は単一端末デモ用の in-process 実装で、
 * `publish()` した文字列をそのまま返すだけであり、対面の相手端末に表示された
 * QR は読み取れない。会話エージェントの「QR 再スキャン」はこちらを使う。
 *
 * Screen / Domain がカメラパッケージを直接 import しない、という
 * `qr-scanner-port.ts` の architect guidance をそのまま引き継ぐ。カメラ実体との
 * 接続は 2 方向に分かれる。
 *
 * - 権限の取得・要求は `CameraPermissionGateway`（Native 実装は
 *   `default-camera-qr-capture.native.ts` が `expo-camera` を注入する）。
 * - 読み取れた文字列の受け渡しは `deliver()`。Camera Preview を描画する
 *   Component（`CameraQrCaptureOverlay.native.tsx`）が、復号できた frame ごとに呼ぶ。
 *
 * このファイル自体は Platform 非依存の純粋な状態機械であり、`bun test` から
 * そのまま実行できる（`web-crypto-random.ts` / `.native.ts` と同じ分割方針）。
 */

/** Camera Preview を今表示すべきかを、購読側（Overlay Component）へ伝える状態。 */
export type CameraQrCaptureStatus =
  | 'idle'
  | 'requesting-permission'
  | 'capturing';

/**
 * `expo-camera` の `PermissionResponse` のうち、状態導出に必要な最小の形。
 * Native 境界の実値は型を信用せず、`cameraPermissionStateFromResponse` が
 * 閉じた `CameraPermissionState` へ正規化する。
 */
export interface CameraPermissionResponse {
  readonly status: string;
  readonly canAskAgain: boolean;
}

/**
 * `expo-camera` の権限 Response を、この repo が既に持つ 5 状態
 * （`camera-permission-notice.ts` が文言を持つ）へ写す唯一の変換。
 * 再要求できない `denied` を `revoked`（設定から後で無効化された）として扱うのは、
 * 「設定でカメラを再度許可すると読み取れる」という recheck 導線がそのまま
 * 当てはまるのがこの状態だからである。未知の値は granted へ倒さず `denied` へ
 * fail-closed する（`normalizeAgentModelFailureCode` と同じ原則）。
 */
export function cameraPermissionStateFromResponse(
  response: CameraPermissionResponse
): CameraPermissionState {
  if (response.status === 'granted') return 'granted';
  if (response.status === 'undetermined') return 'not-determined';
  if (response.status === 'denied' && !response.canAskAgain) return 'revoked';
  return 'denied';
}

export interface CameraPermissionGateway {
  getPermissionState(): Promise<CameraPermissionState>;
  requestPermission(): Promise<CameraPermissionState>;
}

export interface CameraQrCapturePort {
  getPermissionState(): Promise<CameraPermissionState>;
  requestPermission(): Promise<CameraPermissionState>;
  /**
   * Camera Preview を開き、QR を 1 件読み取れるまで待つ。権限が
   * `not-determined` なら 1 度だけ要求する。granted にならなければ Preview を
   * 開かずに `QrScanError('PERMISSION_NOT_GRANTED')` で失敗する。
   */
  capture(): Promise<string>;
  readonly status: CameraQrCaptureStatus;
  /** `status` の変化を購読する。戻り値を呼ぶと解除する。 */
  subscribe(listener: () => void): () => void;
  /** Camera Preview が QR を復号できたときに呼ぶ。待機中でなければ無視する。 */
  deliver(raw: string): void;
  /** 利用者の取り消し・画面離脱で呼ぶ。待機中でなければ無視する。 */
  cancel(): void;
}

interface CaptureResolver {
  readonly resolve: (raw: string) => void;
  readonly reject: (error: unknown) => void;
}

interface PendingCapture {
  /**
   * 待機中に重ねて呼ばれた `capture()` の解決先。カメラは 1 つしか無いため
   * Preview を二重に開かず、同じ 1 回分の読取結果を全員へ配る。
   */
  readonly resolvers: CaptureResolver[];
  /** 権限確認を終えて Camera Preview を開いたか。開く前の frame は取り込まない。 */
  granted: boolean;
}

export function createCameraQrCapturePort(
  gateway: CameraPermissionGateway
): CameraQrCapturePort {
  const listeners = new Set<() => void>();
  let pending: PendingCapture | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** 待機を終了し、全ての `capture()` 呼び出しへ同じ結末を配る。 */
  function settle(
    record: PendingCapture,
    outcome:
      | { readonly kind: 'scanned'; readonly raw: string }
      | { readonly kind: 'failed'; readonly error: unknown }
  ): void {
    pending = null;
    for (const resolver of record.resolvers) {
      if (outcome.kind === 'scanned') resolver.resolve(outcome.raw);
      else resolver.reject(outcome.error);
    }
    notify();
  }

  async function openPreview(record: PendingCapture): Promise<void> {
    try {
      let state = await gateway.getPermissionState();
      if (state === 'not-determined') {
        state = await gateway.requestPermission();
      }
      // 権限確認中に cancel() されていれば、この record は既に決着している。
      if (pending !== record) return;
      if (state !== 'granted') {
        settle(record, {
          kind: 'failed',
          error: new QrScanError(
            'PERMISSION_NOT_GRANTED',
            'カメラの利用が許可されていないため QR を読み取れません。'
          ),
        });
        return;
      }
      record.granted = true;
      notify();
    } catch (error: unknown) {
      if (pending !== record) return;
      settle(record, { kind: 'failed', error });
    }
  }

  return {
    getPermissionState: () => gateway.getPermissionState(),
    requestPermission: () => gateway.requestPermission(),
    get status() {
      if (pending === null) return 'idle';
      return pending.granted ? 'capturing' : 'requesting-permission';
    },
    capture() {
      return new Promise<string>((resolve, reject) => {
        const active = pending;
        if (active !== null) {
          active.resolvers.push({ resolve, reject });
          return;
        }
        const record: PendingCapture = {
          resolvers: [{ resolve, reject }],
          granted: false,
        };
        pending = record;
        notify();
        void openPreview(record);
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    deliver(raw) {
      const record = pending;
      if (record === null || !record.granted) return;
      settle(record, { kind: 'scanned', raw });
    },
    cancel() {
      const record = pending;
      if (record === null) return;
      settle(record, {
        kind: 'failed',
        error: new QrScanError(
          'SCAN_CANCELLED',
          'QR の読み取りを取り消しました。'
        ),
      });
    },
  };
}
