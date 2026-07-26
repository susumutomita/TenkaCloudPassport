import { describe, expect, it } from 'bun:test';
import { IntroCardError } from '../domain/intro-card';
import { encodeIntroCardUrl } from '../protocol/intro-card-url';
import {
  CONVERSATION_AGENT_SAMPLE_PEER_CARD,
  type ConversationExampleResultView,
  decodeConversationAgentPeerCard,
  INITIAL_CONVERSATION_AGENT_RESULT,
  presentConversationAgentResult,
} from './conversation-agent-flow';

const CONVERSATION_EXAMPLE: ConversationExampleResultView = {
  state: { kind: 'available' },
  onGenerate: () => undefined,
  onCancel: () => undefined,
};

describe('decodeConversationAgentPeerCard', () => {
  it('完全な自己紹介ページ URL から Intro Card を復元する', () => {
    const url = encodeIntroCardUrl({
      name: '鈴木花子',
      themeIds: ['open-source'],
    });

    const card = decodeConversationAgentPeerCard(url);

    expect(card).toEqual({ name: '鈴木花子', themeIds: ['open-source'] });
  });

  it('フラグメント単体（先頭の # を含まない）を貼り付けても復元する', () => {
    const url = encodeIntroCardUrl({ name: '鈴木花子' });
    const fragment = url.slice(url.indexOf('#') + 1);

    expect(decodeConversationAgentPeerCard(fragment)).toEqual({
      name: '鈴木花子',
    });
  });

  it('前後に空白が付いた入力を trim してから解釈する', () => {
    const url = encodeIntroCardUrl({ name: '鈴木花子' });

    expect(decodeConversationAgentPeerCard(`  ${url}  `)).toEqual({
      name: '鈴木花子',
    });
  });

  it('不正な入力は decodeIntroCardUrlFragment 由来の IntroCardError をそのまま伝える', () => {
    expect(() =>
      decodeConversationAgentPeerCard('not a valid card url')
    ).toThrow(IntroCardError);
  });
});

describe('CONVERSATION_AGENT_SAMPLE_PEER_CARD', () => {
  it('実在人物を想起させない固定サンプルであり、themeIds を持つ', () => {
    expect(CONVERSATION_AGENT_SAMPLE_PEER_CARD.name).toBe('Sample Explorer');
    expect(
      CONVERSATION_AGENT_SAMPLE_PEER_CARD.themeIds?.length
    ).toBeGreaterThan(0);
  });
});

describe('INITIAL_CONVERSATION_AGENT_RESULT', () => {
  it('idle 状態である', () => {
    expect(INITIAL_CONVERSATION_AGENT_RESULT).toEqual({ kind: 'idle' });
  });
});

describe('presentConversationAgentResult（Issue 155）', () => {
  it('Bridge にだけ会話例 View Model を合成する', () => {
    expect(
      presentConversationAgentResult(
        {
          kind: 'bridge',
          reason: '共通点があります。',
          opener: '聞いてみましょう。',
          partnerNames: ['鈴木花子'],
        },
        CONVERSATION_EXAMPLE
      )
    ).toEqual({
      kind: 'bridge',
      reason: '共通点があります。',
      opener: '聞いてみましょう。',
      partnerNames: ['鈴木花子'],
      conversationExample: CONVERSATION_EXAMPLE,
    });
  });

  it('Bridge 以外の状態は余分な field を追加せずそのまま返す', () => {
    for (const result of [
      { kind: 'idle' as const },
      { kind: 'running' as const },
      { kind: 'no-signal' as const },
      { kind: 'error' as const, message: '失敗しました。' },
    ]) {
      expect(presentConversationAgentResult(result, CONVERSATION_EXAMPLE)).toBe(
        result
      );
    }
  });
});
