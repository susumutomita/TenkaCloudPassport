import { describe, expect, it } from 'bun:test';
import { MAX_BRIDGE_SELECTION_PARTICIPANTS } from './bridge-selection';
import {
  addConversationSessionPeer,
  ConversationSessionError,
  type ConversationSessionParticipant,
  canStartConversationAgent,
  clearConversationSessionPeers,
  conversationSessionParticipants,
  createConversationSession,
  removeConversationSessionPeer,
} from './conversation-session';
import { createIntroCard } from './intro-card';
import type { ParticipantId } from './session-identifiers';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェントの非永続セッションの日本語 BDD テスト。
 * `bridge-selection.test.ts` と同じく、`ptc_<literal>` の template literal 型で
 * `ParticipantId` へ型エスケープ無しに代入する。
 */
function participant<Id extends string>(
  id: Id,
  name: string,
  themeIds: readonly string[] = []
): ConversationSessionParticipant {
  return {
    participantId: `ptc_${id}`,
    introCard: createIntroCard({
      name,
      ...(themeIds.length > 0 ? { themeIds } : {}),
    }),
  };
}

function expectConversationSessionError(
  action: () => void,
  code: ConversationSessionError['code']
): void {
  try {
    action();
    throw new Error('ConversationSessionError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConversationSessionError);
    if (error instanceof ConversationSessionError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('createConversationSession', () => {
  it('自分自身の Intro Card だけを持つ、相手未受信のセッションを作る', () => {
    const self = participant('self', '田中太郎');

    const session = createConversationSession(self);

    expect(session.self).toEqual(self);
    expect(session.peers).toEqual([]);
  });
});

describe('addConversationSessionPeer', () => {
  it('受信した相手の Intro Card をセッションへ追加する', () => {
    const self = participant('self', '田中太郎');
    const peer = participant('peer', '鈴木花子');
    const session = createConversationSession(self);

    const next = addConversationSessionPeer(session, peer);

    expect(next.peers).toEqual([peer]);
    // 追加前のセッション（引数）は変更されない（純粋関数）。
    expect(session.peers).toEqual([]);
  });

  it('複数の相手を追加すると、追加順に peers が増える', () => {
    const self = participant('self', '田中太郎');
    const peerA = participant('peerA', 'A');
    const peerB = participant('peerB', 'B');
    const session = addConversationSessionPeer(
      createConversationSession(self),
      peerA
    );

    const next = addConversationSessionPeer(session, peerB);

    expect(next.peers).toEqual([peerA, peerB]);
  });

  it('自分自身と同じ participantId の相手を追加しようとすると DUPLICATE_PARTICIPANT を投げる', () => {
    const self = participant('self', '田中太郎');
    const session = createConversationSession(self);

    expectConversationSessionError(
      () =>
        addConversationSessionPeer(session, {
          ...self,
          introCard: createIntroCard({ name: '別人' }),
        }),
      'DUPLICATE_PARTICIPANT'
    );
  });

  it('既に追加済みの相手と同じ participantId を再度追加しようとすると DUPLICATE_PARTICIPANT を投げる', () => {
    const self = participant('self', '田中太郎');
    const peer = participant('peer', '鈴木花子');
    const session = addConversationSessionPeer(
      createConversationSession(self),
      peer
    );

    expectConversationSessionError(
      () => addConversationSessionPeer(session, peer),
      'DUPLICATE_PARTICIPANT'
    );
  });

  it(`合計人数が上限（${MAX_BRIDGE_SELECTION_PARTICIPANTS} 名）ちょうどまでは追加できる`, () => {
    let session = createConversationSession(participant('self', '田中太郎'));
    for (
      let index = 0;
      index < MAX_BRIDGE_SELECTION_PARTICIPANTS - 1;
      index += 1
    ) {
      session = addConversationSessionPeer(
        session,
        participant(`peer${index}`, `相手${index}`)
      );
    }

    expect(conversationSessionParticipants(session)).toHaveLength(
      MAX_BRIDGE_SELECTION_PARTICIPANTS
    );
  });

  it(`合計人数が上限（${MAX_BRIDGE_SELECTION_PARTICIPANTS} 名）を超える場合、SESSION_FULL を投げる`, () => {
    let session = createConversationSession(participant('self', '田中太郎'));
    for (
      let index = 0;
      index < MAX_BRIDGE_SELECTION_PARTICIPANTS - 1;
      index += 1
    ) {
      session = addConversationSessionPeer(
        session,
        participant(`peer${index}`, `相手${index}`)
      );
    }
    const full = session;

    expectConversationSessionError(
      () =>
        addConversationSessionPeer(full, participant('overflow', '溢れた人')),
      'SESSION_FULL'
    );
  });
});

describe('removeConversationSessionPeer', () => {
  it('指定した participantId の相手をセッションから外す', () => {
    const self = participant('self', '田中太郎');
    const peerA = participant('peerA', 'A');
    const peerB = participant('peerB', 'B');
    const session = addConversationSessionPeer(
      addConversationSessionPeer(createConversationSession(self), peerA),
      peerB
    );

    const next = removeConversationSessionPeer(session, peerA.participantId);

    expect(next.peers).toEqual([peerB]);
  });

  it('存在しない participantId を指定しても何も変わらない（no-op）', () => {
    const self = participant('self', '田中太郎');
    const peer = participant('peer', '鈴木花子');
    const session = addConversationSessionPeer(
      createConversationSession(self),
      peer
    );

    const next = removeConversationSessionPeer(
      session,
      'ptc_does-not-exist' as ParticipantId
    );

    expect(next.peers).toEqual([peer]);
  });
});

describe('clearConversationSessionPeers', () => {
  it('受信済みの相手カードだけを消し、自分自身の Intro Card は保持する', () => {
    const self = participant('self', '田中太郎');
    const peer = participant('peer', '鈴木花子');
    const session = addConversationSessionPeer(
      createConversationSession(self),
      peer
    );

    const cleared = clearConversationSessionPeers(session);

    expect(cleared.self).toEqual(self);
    expect(cleared.peers).toEqual([]);
  });
});

describe('conversationSessionParticipants', () => {
  it('自分自身を先頭に、受信済みの相手を続けた配列を返す', () => {
    const self = participant('self', '田中太郎');
    const peer = participant('peer', '鈴木花子');
    const session = addConversationSessionPeer(
      createConversationSession(self),
      peer
    );

    expect(conversationSessionParticipants(session)).toEqual([self, peer]);
  });
});

describe('canStartConversationAgent', () => {
  it('自分自身しかいない場合、false を返す（参加者 2 名未満）', () => {
    const session = createConversationSession(participant('self', '田中太郎'));

    expect(canStartConversationAgent(session)).toBe(false);
  });

  it('相手を 1 名でも受信すると true を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(participant('self', '田中太郎')),
      participant('peer', '鈴木花子')
    );

    expect(canStartConversationAgent(session)).toBe(true);
  });
});
