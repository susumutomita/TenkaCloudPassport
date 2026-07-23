import { describe, expect, it } from 'bun:test';
import type { SelectedBridge } from './bridge-selection';
import { CATALOG_VERSION } from './clue-catalog';
import {
  buildConversationAgentModelInput,
  CONVERSATION_AGENT_PLACEHOLDER_PET_NAME,
  introCardToConversationPassport,
  selectConversationBridge,
} from './conversation-agent-evidence';
import {
  addConversationSessionPeer,
  type ConversationSessionParticipant,
  createConversationSession,
} from './conversation-session';
import { createIntroCard } from './intro-card';
import type { ParticipantId } from './session-identifiers';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェントの Evidence 抽出アダプタの日本語 BDD
 * テスト。`bridge-selection.test.ts` と同じく `ptc_<literal>` を使う。
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

describe('introCardToConversationPassport', () => {
  it('themeIds を持たないカードを、空の clues を持つ Public Passport へ投影する', () => {
    const card = createIntroCard({ name: '田中太郎' });

    const passport = introCardToConversationPassport(card);

    expect(passport).toEqual({
      schemaVersion: 2,
      catalogVersion: CATALOG_VERSION,
      petName: CONVERSATION_AGENT_PLACEHOLDER_PET_NAME,
      clues: [],
      languages: [],
    });
  });

  it('themeIds を持つカードを、カタログの category を伴う ConfirmedClue[] へ投影する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      themeIds: ['open-source', 'information-security'],
    });

    const passport = introCardToConversationPassport(card);

    expect(passport.clues).toEqual([
      { value: 'open-source', category: 'interest', source: 'owner-selected' },
      {
        value: 'information-security',
        category: 'skill',
        source: 'owner-selected',
      },
    ]);
  });

  it('petName に本名（IntroCard.name）を投影しない（プレースホルダのみ）', () => {
    const card = createIntroCard({ name: '田中太郎' });

    const passport = introCardToConversationPassport(card);

    expect(passport.petName).not.toBe(card.name);
    expect(passport.petName).toBe(CONVERSATION_AGENT_PLACEHOLDER_PET_NAME);
  });
});

describe('selectConversationBridge', () => {
  it('相手が themeIds を持たない場合、no-signal を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子')
    );

    expect(selectConversationBridge(session)).toEqual({ kind: 'no-signal' });
  });

  it('自分と相手が同じ会話テーマを持つ場合、shared-topic を根拠にした bridge を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );

    const result = selectConversationBridge(session);

    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect([...result.bridge.participantIds].sort()).toEqual([
        'ptc_peer',
        'ptc_self',
      ]);
      expect(result.bridge.evidenceIds).toEqual([
        'topic:open-source:ptc_peer:ptc_self',
      ]);
    }
  });

  it('カタログ上で補完関係にある会話テーマ同士は offer-need-complement を根拠にした bridge を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['information-security'])
      ),
      participant('peer', '鈴木花子', ['product-design'])
    );

    const result = selectConversationBridge(session);

    expect(result.kind).toBe('bridge');
  });

  it('自分自身しかいないセッションを渡すと BridgeSelectionError（INVALID_PARTICIPANT_COUNT）を投げる', () => {
    const session = createConversationSession(
      participant('self', '田中太郎', ['open-source'])
    );

    expect(() => selectConversationBridge(session)).toThrow();
  });

  it('3 者間セッションでも Fairness Rule により自分に割り当てられた bridge を返す', () => {
    const session = addConversationSessionPeer(
      addConversationSessionPeer(
        createConversationSession(
          participant('self', '田中太郎', ['open-source'])
        ),
        participant('peerA', 'A', ['open-source'])
      ),
      participant('peerB', 'B', [])
    );

    const result = selectConversationBridge(session);

    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect([...result.bridge.participantIds].sort()).toEqual([
        'ptc_peerA',
        'ptc_self',
      ]);
    }
  });
});

describe('buildConversationAgentModelInput', () => {
  it('自分 + 相手 1 名の bridge から AgentModelInput を組み立てる', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );
    const result = selectConversationBridge(session);
    if (result.kind !== 'bridge') throw new Error('bridge が必要です。');

    const input = buildConversationAgentModelInput(
      session,
      result.bridge,
      1_000
    );

    expect(input).not.toBeNull();
    expect(input?.deadlineAtWallClockMs).toBe(1_000);
    expect(input?.language).toBeUndefined();
    expect(input?.ownerPassport.clues).toEqual([
      { value: 'open-source', category: 'interest', source: 'owner-selected' },
    ]);
    expect(input?.encounteredPassport.clues).toEqual([
      { value: 'open-source', category: 'interest', source: 'owner-selected' },
    ]);
  });

  it('language を渡すと AgentModelInput.language へそのまま反映する', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );
    const result = selectConversationBridge(session);
    if (result.kind !== 'bridge') throw new Error('bridge が必要です。');

    const input = buildConversationAgentModelInput(
      session,
      result.bridge,
      1_000,
      'en'
    );

    expect(input?.language).toBe('en');
  });

  it('bridge の参加者が 3 名以上（Step B の N 者間統合）の場合、null を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );
    const tripleBridge: SelectedBridge = {
      participantIds: ['ptc_self', 'ptc_peer', 'ptc_other'] as ParticipantId[],
      reason: 'テスト用',
      opener: 'テスト用',
      evidenceIds: ['topic:open-source:ptc_peer:ptc_self'],
      confidence: 'possible',
    };

    expect(
      buildConversationAgentModelInput(session, tripleBridge, 1_000)
    ).toBeNull();
  });

  it('bridge に自分自身が含まれない場合、null を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );
    const foreignBridge: SelectedBridge = {
      participantIds: ['ptc_peer', 'ptc_other'] as ParticipantId[],
      reason: 'テスト用',
      opener: 'テスト用',
      evidenceIds: ['topic:open-source:ptc_other:ptc_peer'],
      confidence: 'possible',
    };

    expect(
      buildConversationAgentModelInput(session, foreignBridge, 1_000)
    ).toBeNull();
  });

  it('bridge が指す相手が session.peers に存在しない場合、null を返す（bridge と session の不整合に対する防御）', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );
    const mismatchedBridge: SelectedBridge = {
      participantIds: ['ptc_self', 'ptc_not-in-session'] as ParticipantId[],
      reason: 'テスト用',
      opener: 'テスト用',
      evidenceIds: ['topic:open-source:ptc_not-in-session:ptc_self'],
      confidence: 'possible',
    };

    expect(
      buildConversationAgentModelInput(session, mismatchedBridge, 1_000)
    ).toBeNull();
  });
});
