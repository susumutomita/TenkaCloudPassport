import { describe, expect, it } from 'bun:test';
import {
  addConversationSessionPeer,
  type ConversationSession,
  createConversationSession,
} from '../domain/conversation-session';
import { createIntroCard } from '../domain/intro-card';
import { createParticipantId } from '../domain/session-identifiers';
import { encodeIntroCardUrl } from '../protocol/intro-card-url';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import {
  type CameraQrCapturePort,
  createCameraQrCapturePort,
} from './camera-qr-capture';
import { decodeConversationAgentPeerCard } from './conversation-agent-flow';
import {
  conversationAgentScanErrorMessage,
  resolveScannedPeer,
} from './conversation-agent-flow-controller';
import { MESSAGES } from './i18n/messages';

/**
 * Issue 146: 実カメラ読取の経路を、Port の単体契約ではなく
 * 「カメラが 1 フレーム復号した文字列を受け取ってから、相手カードが
 * `ConversationSession` へ入るまで」の一続きとして固定する結合テスト。
 *
 * 実カメラそのもの（`expo-camera` の `CameraView`）は Native Build でしか動かない
 * ため、この repo で検証できる境界はここまでである。`onBarcodeScanned` が
 * `port.deliver(result.data)` を呼ぶという 1 行だけが未検証で残り、それ以外
 * （権限判定、Preview の開閉、URL の復号、セッションへの追加、取り消し時の
 * 無表示、権限拒否時の文言）はすべてここで実行して確認する。
 *
 * No Mock: 差し替えているのは OS の権限 API に相当する Gateway だけで、
 * 自己紹介ページ URL は実際の `encodeIntroCardUrl` で組み立て、復号も
 * セッション操作も本番と同じ実装をそのまま通す。
 */

function grantedPort(): CameraQrCapturePort {
  return createCameraQrCapturePort({
    getPermissionState: () => Promise.resolve('granted'),
    requestPermission: () => Promise.resolve('granted'),
  });
}

function selfSession(): ConversationSession {
  return createConversationSession({
    participantId: createParticipantId(webCryptoRandomBytes),
    introCard: createIntroCard({
      name: '自分',
      themeIds: ['open-source', 'accessibility'],
    }),
  });
}

/** `CameraQrCaptureOverlay.native.tsx` の `onBarcodeScanned` と同じ呼び出し。 */
function scanFrame(port: CameraQrCapturePort, raw: string): void {
  port.deliver(raw);
}

/**
 * `use-conversation-agent-flow.ts` の `onScanPeer` と同じ配線を、hook の外で組む。
 * 世代キー・decode・addPeer・onError の渡し方を本番と揃える。
 */
function startScan(
  port: CameraQrCapturePort,
  session: { current: ConversationSession },
  errorMessage: { current: string | null }
): Promise<void> {
  const scanGenerationRef = { current: 0 };
  return resolveScannedPeer({
    scanGenerationRef,
    generationAtStart: scanGenerationRef.current,
    scan: () => port.capture(),
    decode: decodeConversationAgentPeerCard,
    addPeer: (card) => {
      session.current = addConversationSessionPeer(session.current, {
        participantId: createParticipantId(webCryptoRandomBytes),
        introCard: card,
      });
      errorMessage.current = null;
    },
    onError: (error) => {
      errorMessage.current = conversationAgentScanErrorMessage({
        error,
        locale: 'ja',
        fallbackMessage: MESSAGES.ja.conversationAgent.runErrorMessage,
      });
    },
  });
}

describe('実カメラで読み取った QR がセッションへ入るまでの経路（Issue 146）', () => {
  it('相手の自己紹介ページ URL を読み取ると、その相手がセッションへ追加される', async () => {
    const peerCard = createIntroCard({
      name: '相手 太郎',
      title: 'Platform Engineer',
      themeIds: ['open-source', 'cloud-infrastructure'],
    });
    const port = grantedPort();
    const session = { current: selfSession() };
    const errorMessage: { current: string | null } = { current: null };

    const scanning = startScan(port, session, errorMessage);
    await Promise.resolve();
    await Promise.resolve();
    scanFrame(port, encodeIntroCardUrl(peerCard));
    await scanning;

    expect(session.current.peers).toHaveLength(1);
    expect(session.current.peers[0]?.introCard.name).toBe('相手 太郎');
    expect(session.current.peers[0]?.introCard.themeIds).toEqual([
      'open-source',
      'cloud-infrastructure',
    ]);
    expect(errorMessage.current).toBeNull();
    expect(port.status).toBe('idle');
  });

  it('URL 全体ではなくフラグメント単体を読み取っても同じ結果になる', async () => {
    const peerCard = createIntroCard({ name: '断片 花子' });
    const url = encodeIntroCardUrl(peerCard);
    const fragment = url.slice(url.lastIndexOf('#') + 1);
    const port = grantedPort();
    const session = { current: selfSession() };
    const errorMessage: { current: string | null } = { current: null };

    const scanning = startScan(port, session, errorMessage);
    await Promise.resolve();
    await Promise.resolve();
    scanFrame(port, fragment);
    await scanning;

    expect(session.current.peers[0]?.introCard.name).toBe('断片 花子');
  });

  it('自己紹介ページではない QR を読み取ると、理由を表示して誰も追加しない', async () => {
    const port = grantedPort();
    const session = { current: selfSession() };
    const errorMessage: { current: string | null } = { current: null };

    const scanning = startScan(port, session, errorMessage);
    await Promise.resolve();
    await Promise.resolve();
    scanFrame(port, 'TCPQ1:{"kind":"lounge-invite"}');
    await scanning;

    expect(session.current.peers).toHaveLength(0);
    expect(errorMessage.current).not.toBeNull();
  });

  it('読み取りをやめると、誰も追加せず Error も表示しない', async () => {
    const port = grantedPort();
    const session = { current: selfSession() };
    const errorMessage: { current: string | null } = { current: null };

    const scanning = startScan(port, session, errorMessage);
    await Promise.resolve();
    await Promise.resolve();
    port.cancel();
    await scanning;

    expect(session.current.peers).toHaveLength(0);
    expect(errorMessage.current).toBeNull();
    expect(port.status).toBe('idle');
  });

  it('カメラを許可していない端末では、Preview を開かず理由を表示する', async () => {
    const port = createCameraQrCapturePort({
      getPermissionState: () => Promise.resolve('denied'),
      requestPermission: () => Promise.resolve('denied'),
    });
    const session = { current: selfSession() };
    const errorMessage: { current: string | null } = { current: null };

    await startScan(port, session, errorMessage);

    expect(session.current.peers).toHaveLength(0);
    expect(errorMessage.current).toBe(
      MESSAGES.ja.qrErrorNotice.permissionNotGranted
    );
    expect(port.status).toBe('idle');
  });

  it('続けて 2 人読み取ると、2 人ともセッションに残る', async () => {
    const port = grantedPort();
    const session = { current: selfSession() };
    const errorMessage: { current: string | null } = { current: null };

    for (const name of ['1 人目', '2 人目']) {
      const scanning = startScan(port, session, errorMessage);
      await Promise.resolve();
      await Promise.resolve();
      scanFrame(port, encodeIntroCardUrl(createIntroCard({ name })));
      await scanning;
    }

    expect(session.current.peers.map((peer) => peer.introCard.name)).toEqual([
      '1 人目',
      '2 人目',
    ]);
  });
});
