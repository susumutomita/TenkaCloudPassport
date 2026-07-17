import {
  LoungeRoomError,
  type LoungeRoomErrorCode,
} from '../domain/lounge-room';
import {
  QrPayloadError,
  type QrPayloadErrorCode,
} from '../protocol/qr-payload';
import { QrScanError, type QrScanErrorCode } from './qr-scanner-port';

const QR_PAYLOAD_MESSAGES: Record<QrPayloadErrorCode, string> = {
  NOT_PASSPORT_QR: 'これは TenkaCloud Passport の QR ではありません。',
  INVALID_PREFIX: 'QR の形式（Prefix）が正しくありません。',
  OVERSIZED_PAYLOAD: 'QR の内容量が上限を超えています。',
  INVALID_JSON: 'QR の内容を読み取れませんでした。',
  UNKNOWN_VERSION: 'このアプリが対応していない Version の QR です。',
  DUPLICATE_SCAN:
    '同じ QR を連続して読み取りました。新しく表示された QR を読み取ってください。',
};

const LOUNGE_ROOM_MESSAGES: Record<LoungeRoomErrorCode, string> = {
  INVALID_CLOCK: '端末の時計を確認してください。',
  ROOM_EXPIRED:
    'この Lounge の招待は期限切れです。Host に新しい Invite QR を表示してもらってください。',
  ROOM_FULL: 'この Lounge はすでに定員に達しています。',
  ROOM_NOT_FORMING: 'この Lounge はすでに開始しているため、参加できません。',
  PARTICIPANT_NOT_FOUND:
    '参加者情報が見つかりません。もう一度参加し直してください。',
  INVALID_PARTICIPANT_COUNT: 'この Lounge の参加者数が不正です。',
};

const QR_SCAN_MESSAGES: Record<QrScanErrorCode, string> = {
  PERMISSION_NOT_GRANTED:
    'カメラの利用が許可されていないため QR を読み取れません。',
  NOTHING_TO_SCAN:
    '読み取れる QR がありません。Host の画面を確認してください。',
};

/**
 * QR 招待・共有確認・Ready フローで発生しうる各層の型付き Error を、
 * Owner 向けの日本語メッセージへ一元的に変換する。
 */
export function qrFlowErrorMessage(error: unknown): string {
  if (error instanceof QrPayloadError) return QR_PAYLOAD_MESSAGES[error.code];
  if (error instanceof LoungeRoomError) return LOUNGE_ROOM_MESSAGES[error.code];
  if (error instanceof QrScanError) return QR_SCAN_MESSAGES[error.code];
  if (error instanceof Error) return error.message;
  return '読み取りに失敗しました。もう一度実行してください。';
}
