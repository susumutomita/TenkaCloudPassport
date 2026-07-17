import { describe, expect, it } from 'bun:test';
import { completeLounge, evaluateLounge } from '../domain/lounge';
import { createLoungeInvite } from '../domain/lounge-invite';
import {
  createLoungeRoom,
  joinLoungeRoom,
  LoungeRoomError,
  markParticipantReady,
  startLoungeFromRoom,
} from '../domain/lounge-room';
import {
  createLocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import { RULES_PROVIDER } from '../domain/rules-provider';
import { createSessionIdentifiers } from '../domain/session-identifiers';
import { encodeQrPayload } from '../protocol/qr-payload';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import { scanQrPayload } from './qr-scan-flow';
import { createInProcessQrScannerPort } from './qr-scanner-port';

const CLOCK = { wallClockMs: 1_700_000_000_000, monotonicMs: 10_000 };

function passportFor(clueIds: readonly string[]) {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
    languageCodes: [],
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });
}

/**
 * インターネット接続なし・単一端末で完走する Host + Guest の 2 人分フローを
 * 実装が呼ぶのと同じ Use Case 関数の並びで検証する（M1）。M3 で Transport が
 * 実カメラ / 実ネットワークへ差し替わっても、ここで固定した呼び出し列は
 * そのまま再利用できる。
 */
describe('QR 招待から Ready gating を経て Agent State Machine が開始するまでの一気通貫フロー', () => {
  it('Host と Guest がともに Ready になった時点でだけ判定が開始し、Bridge を経て破棄まで完走する', async () => {
    const qrScannerPort = createInProcessQrScannerPort('granted');

    // 1. Host が 20 分の Lounge を作り、Invite QR を表示する。
    const { loungeId, participantId: hostParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const hostPassport = passportFor(['open-source']);
    const roomAfterHostJoin = joinLoungeRoom(
      createLoungeRoom({ loungeId, clock: CLOCK }),
      {
        participantId: hostParticipantId,
        publicPassport: hostPassport,
        clock: CLOCK,
      }
    );
    const invite = createLoungeInvite({
      loungeId,
      nowEpochMs: CLOCK.wallClockMs,
    });
    qrScannerPort.publish(
      encodeQrPayload({ kind: 'lounge-invite', value: invite })
    );

    expect(roomAfterHostJoin.status).toBe('forming');

    // 2. Guest は QR 読取後、3 操作以内（読取→共有確認→Ready）で Ready になれる。
    const scanResult = await scanQrPayload(qrScannerPort, new Set());
    expect(scanResult.payload.kind).toBe('lounge-invite');
    if (scanResult.payload.kind !== 'lounge-invite') {
      throw new Error('lounge-invite が必要です。');
    }
    expect(scanResult.payload.value.loungeId).toBe(loungeId);

    const guestPassport = passportFor(['open-source']);
    const { participantId: guestParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const roomAfterGuestJoin = joinLoungeRoom(roomAfterHostJoin, {
      participantId: guestParticipantId,
      publicPassport: guestPassport,
      clock: CLOCK,
    });

    // 3. 参加者が 2 名になっただけでは、まだ双方 Ready ではないので開始しない。
    expect(roomAfterGuestJoin.status).toBe('forming');

    const guestReady = markParticipantReady(roomAfterGuestJoin, {
      participantId: guestParticipantId,
      clock: CLOCK,
    });

    // Guest だけが Ready になった段階でも Agent State Machine はまだ開始しない。
    expect(guestReady.status).toBe('forming');

    const bothReady = markParticipantReady(guestReady, {
      participantId: hostParticipantId,
      clock: CLOCK,
    });

    // 4. 参加者 2 名かつ双方 Ready になった時点で ready へ遷移する。
    expect(bothReady.status).toBe('ready');
    if (bothReady.status !== 'ready') {
      throw new Error('ready が必要です。');
    }

    // 5. ready から Agent State Machine（既存の Lounge 状態機械）を開始する。
    const active = startLoungeFromRoom(bothReady);
    expect(active.status).toBe('active');

    // 6. Rules Provider が判定し、共通の手掛かりから Bridge を生成して retired になる。
    const retired = evaluateLounge(active, RULES_PROVIDER, {
      wallClockMs: CLOCK.wallClockMs + 1_000,
      monotonicMs: CLOCK.monotonicMs + 1_000,
    });
    expect(retired.status).toBe('retired');
    if (retired.status === 'retired') {
      expect(retired.outcome.kind).toBe('bridge');
    }

    // 7. 結果画面を閉じると Lounge 由来データを完全破棄する。
    const destroyed = completeLounge(retired);
    expect(destroyed).toEqual({ status: 'destroyed', reason: 'completed' });
  });

  it('共通する手掛かりがなければ no-signal のまま完走する', async () => {
    const qrScannerPort = createInProcessQrScannerPort('granted');
    const { loungeId, participantId: hostParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const roomAfterHostJoin = joinLoungeRoom(
      createLoungeRoom({ loungeId, clock: CLOCK }),
      {
        participantId: hostParticipantId,
        publicPassport: passportFor(['open-source']),
        clock: CLOCK,
      }
    );
    qrScannerPort.publish(
      encodeQrPayload({
        kind: 'lounge-invite',
        value: createLoungeInvite({ loungeId, nowEpochMs: CLOCK.wallClockMs }),
      })
    );

    const scanResult = await scanQrPayload(qrScannerPort, new Set());
    if (scanResult.payload.kind !== 'lounge-invite') {
      throw new Error('lounge-invite が必要です。');
    }
    const { participantId: guestParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const roomAfterGuestJoin = joinLoungeRoom(roomAfterHostJoin, {
      participantId: guestParticipantId,
      publicPassport: passportFor(['accessibility']),
      clock: CLOCK,
    });
    const guestReady = markParticipantReady(roomAfterGuestJoin, {
      participantId: guestParticipantId,
      clock: CLOCK,
    });
    const bothReady = markParticipantReady(guestReady, {
      participantId: hostParticipantId,
      clock: CLOCK,
    });
    if (bothReady.status !== 'ready') throw new Error('ready が必要です。');

    const active = startLoungeFromRoom(bothReady);
    const retired = evaluateLounge(active, RULES_PROVIDER, {
      wallClockMs: CLOCK.wallClockMs + 1_000,
      monotonicMs: CLOCK.monotonicMs + 1_000,
    });

    expect(retired.status).toBe('retired');
    if (retired.status === 'retired') {
      expect(retired.outcome).toEqual({ kind: 'no-signal' });
    }
  });

  it('Host のみが参加し Ready にしても、2 名条件を満たさないため Agent State Machine は開始しない', () => {
    const { loungeId, participantId: hostParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const roomAfterHostJoin = joinLoungeRoom(
      createLoungeRoom({ loungeId, clock: CLOCK }),
      {
        participantId: hostParticipantId,
        publicPassport: passportFor(['open-source']),
        clock: CLOCK,
      }
    );

    expect(roomAfterHostJoin.participants).toHaveLength(1);
    const hostReadyAlone = markParticipantReady(roomAfterHostJoin, {
      participantId: hostParticipantId,
      clock: CLOCK,
    });

    expect(hostReadyAlone.status).toBe('forming');
  });

  it('期限切れの Invite を読み取った Guest は参加できず、Agent State Machine も開始しない', async () => {
    const qrScannerPort = createInProcessQrScannerPort('granted');
    const { loungeId, participantId: hostParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const room = joinLoungeRoom(createLoungeRoom({ loungeId, clock: CLOCK }), {
      participantId: hostParticipantId,
      publicPassport: passportFor(['open-source']),
      clock: CLOCK,
    });
    qrScannerPort.publish(
      encodeQrPayload({
        kind: 'lounge-invite',
        value: createLoungeInvite({ loungeId, nowEpochMs: CLOCK.wallClockMs }),
      })
    );

    const scanResult = await scanQrPayload(qrScannerPort, new Set());
    if (scanResult.payload.kind !== 'lounge-invite') {
      throw new Error('lounge-invite が必要です。');
    }
    const { participantId: guestParticipantId } =
      createSessionIdentifiers(webCryptoRandomBytes);
    const afterExpiryClock = {
      wallClockMs: CLOCK.wallClockMs + 20 * 60 * 1_000,
      monotonicMs: CLOCK.monotonicMs,
    };

    expect(() =>
      joinLoungeRoom(room, {
        participantId: guestParticipantId,
        publicPassport: passportFor(['open-source']),
        clock: afterExpiryClock,
      })
    ).toThrow(LoungeRoomError);
  });
});
