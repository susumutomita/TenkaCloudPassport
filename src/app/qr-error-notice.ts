import {
  LoungeRoomError,
  type LoungeRoomErrorCode,
} from '../domain/lounge-room';
import {
  QrPayloadError,
  type QrPayloadErrorCode,
} from '../protocol/qr-payload';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { type AppMessages, MESSAGES } from './i18n/messages';
import { QrScanError, type QrScanErrorCode } from './qr-scanner-port';

function qrPayloadMessages(
  messages: AppMessages
): Record<QrPayloadErrorCode, string> {
  return {
    NOT_PASSPORT_QR: messages.qrErrorNotice.notPassportQr,
    INVALID_PREFIX: messages.qrErrorNotice.invalidPrefix,
    OVERSIZED_PAYLOAD: messages.qrErrorNotice.oversizedPayload,
    INVALID_JSON: messages.qrErrorNotice.invalidJson,
    UNKNOWN_VERSION: messages.qrErrorNotice.unknownVersion,
    DUPLICATE_SCAN: messages.qrErrorNotice.duplicateScan,
  };
}

function loungeRoomMessages(
  messages: AppMessages
): Record<LoungeRoomErrorCode, string> {
  return {
    INVALID_CLOCK: messages.qrErrorNotice.invalidClock,
    ROOM_EXPIRED: messages.qrErrorNotice.roomExpired,
    ROOM_FULL: messages.qrErrorNotice.roomFull,
    ROOM_NOT_FORMING: messages.qrErrorNotice.roomNotForming,
    PARTICIPANT_NOT_FOUND: messages.qrErrorNotice.participantNotFound,
    INVALID_PARTICIPANT_COUNT: messages.qrErrorNotice.invalidParticipantCount,
  };
}

function qrScanMessages(
  messages: AppMessages
): Record<QrScanErrorCode, string> {
  return {
    PERMISSION_NOT_GRANTED: messages.qrErrorNotice.permissionNotGranted,
    NOTHING_TO_SCAN: messages.qrErrorNotice.nothingToScan,
  };
}

/**
 * QR 招待・共有確認・Ready フローで発生しうる各層の型付き Error を、
 * Owner 向けの `locale` 対応メッセージへ一元的に変換する。
 */
export function qrFlowErrorMessage(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE
): string {
  const messages = MESSAGES[locale];
  if (error instanceof QrPayloadError) {
    return qrPayloadMessages(messages)[error.code];
  }
  if (error instanceof LoungeRoomError) {
    return loungeRoomMessages(messages)[error.code];
  }
  if (error instanceof QrScanError) {
    return qrScanMessages(messages)[error.code];
  }
  if (error instanceof Error) return error.message;
  return messages.qrErrorNotice.genericFailure;
}
