import { describe, expect, it } from 'bun:test';
import { IntroCardError } from '../domain/intro-card';
import { encodeIntroCardUrl } from '../protocol/intro-card-url';
import {
  CONVERSATION_AGENT_SAMPLE_PEER_CARD,
  decodeConversationAgentPeerCard,
  INITIAL_CONVERSATION_AGENT_RESULT,
} from './conversation-agent-flow';

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
