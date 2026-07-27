import { describe, expect, it } from 'bun:test';
import {
  ConversationExampleError,
  type ConversationExampleInput,
} from './conversation-example';
import {
  buildConversationExamplePrompt,
  CONVERSATION_EXAMPLE_RESPONSE_SCHEMA,
} from './conversation-example-prompt';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらもオープンソースに関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  ownerProfileText: 'クラウド基盤を作っています',
  peerProfileText: 'OSS の運営をしています',
  language: 'ja',
};

function expectInvalidInput(action: () => unknown): void {
  try {
    action();
    throw new Error('ConversationExampleError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConversationExampleError);
    if (!(error instanceof ConversationExampleError)) throw error;
    expect(error.code).toBe('INVALID_INPUT');
  }
}

describe('buildConversationExamplePrompt（氏名・連絡先を持たない入力境界）', () => {
  it('Bridge と任意 Profile text だけを untrusted JSON へ格納する', () => {
    const prompt = buildConversationExamplePrompt(INPUT);
    const data = JSON.parse(prompt.userPrompt);

    expect(data).toEqual({
      language: 'ja',
      commonPoint: INPUT.bridgeReason,
      firstQuestion: INPUT.bridgeOpener,
      ownerProfileText: INPUT.ownerProfileText,
      peerProfileText: INPUT.peerProfileText,
    });
    expect(prompt.systemPrompt).toContain('natural Japanese');
    expect(prompt.systemPrompt).toContain('untrusted data');
    expect(prompt.responseSchema).toBe(CONVERSATION_EXAMPLE_RESPONSE_SCHEMA);
  });

  it('話者は本人ではなく AI アシスタント同士で、オーナーを三人称で語り接点を探す指示を持つ', () => {
    // Issue 155（owner フィードバック）: 人間 2 人の会話シナリオを創作させず、
    // AI 同士がオーナーの接点を先に見つけておく対話にする。本人の台詞を
    // 捏造しない契約をプロンプト文言で固定する。
    const prompt = buildConversationExamplePrompt(INPUT);

    expect(prompt.systemPrompt).toContain('dialogue between two AI assistants');
    expect(prompt.systemPrompt).toContain('third person');
    expect(prompt.systemPrompt).toContain(
      'never impersonates the owners themselves'
    );
    expect(prompt.systemPrompt).toContain(
      'discover and confirm what the two owners have in common'
    );
  });

  it('英語 Locale では英語生成を指示し、空の Profile text は Field ごと省略する', () => {
    const prompt = buildConversationExamplePrompt({
      bridgeReason: 'You both care about accessibility.',
      bridgeOpener: 'What accessibility problem are you working on?',
      ownerProfileText: '   ',
      language: 'en',
    });
    const data = JSON.parse(prompt.userPrompt);

    expect(prompt.systemPrompt).toContain('natural English');
    expect(data).toEqual({
      language: 'en',
      commonPoint: 'You both care about accessibility.',
      firstQuestion: 'What accessibility problem are you working on?',
    });
  });

  it('余分な氏名 Field を持つ Object からも氏名を Prompt へ列挙しない', () => {
    const inputWithNames = {
      ...INPUT,
      ownerName: 'Alice',
      peerName: 'Bob',
      email: 'alice@example.com',
    };
    const prompt = buildConversationExamplePrompt(inputWithNames);

    expect(prompt.userPrompt).not.toContain('Alice');
    expect(prompt.userPrompt).not.toContain('Bob');
    expect(prompt.userPrompt).not.toContain('alice@example.com');
    expect(Object.keys(JSON.parse(prompt.userPrompt))).toEqual([
      'language',
      'commonPoint',
      'firstQuestion',
      'ownerProfileText',
      'peerProfileText',
    ]);
  });

  it('前後の空白だけを除き、意味を変える切り詰めはしない', () => {
    const prompt = buildConversationExamplePrompt({
      ...INPUT,
      bridgeReason: '  共通点です  ',
      bridgeOpener: '  最初の質問です  ',
    });

    expect(JSON.parse(prompt.userPrompt)).toMatchObject({
      commonPoint: '共通点です',
      firstQuestion: '最初の質問です',
    });
  });

  it('未対応 Locale は型を信用せず拒否する', () => {
    expectInvalidInput(() =>
      Reflect.apply(buildConversationExamplePrompt, undefined, [
        { ...INPUT, language: 'fr' },
      ])
    );
  });

  it('空・上限超過・改行・不可視文字を含む Bridge 文を拒否する', () => {
    for (const bridgeReason of [
      '   ',
      'あ'.repeat(241),
      '1 行目\n2 行目',
      '末尾改行\n',
      '1 行目\u20292 行目',
      'a\u200bb',
    ]) {
      expectInvalidInput(() =>
        buildConversationExamplePrompt({ ...INPUT, bridgeReason })
      );
    }
  });

  it('Bridge と Profile text に含まれる連絡先らしい内容を拒否する', () => {
    for (const invalid of [
      { bridgeOpener: '連絡は a@example.com へ' },
      { bridgeReason: 'https://example.com が共通点です' },
      { ownerProfileText: '電話は 090-1234-5678 です' },
      { peerProfileText: 'www.example.com を運営しています' },
    ]) {
      expectInvalidInput(() =>
        buildConversationExamplePrompt({ ...INPUT, ...invalid })
      );
    }
  });

  it('Profile text の上限超過と制御文字を拒否する', () => {
    expectInvalidInput(() =>
      buildConversationExamplePrompt({
        ...INPUT,
        ownerProfileText: 'あ'.repeat(421),
      })
    );
    expectInvalidInput(() =>
      buildConversationExamplePrompt({
        ...INPUT,
        peerProfileText: 'a\u0000b',
      })
    );
    expectInvalidInput(() =>
      buildConversationExamplePrompt({
        ...INPUT,
        peerProfileText: '\n',
      })
    );
  });

  it('JSON Schema は Root・Turn の追加 Field を禁止し 2〜6 件へ制限する', () => {
    expect(CONVERSATION_EXAMPLE_RESPONSE_SCHEMA).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['turns'],
      properties: {
        turns: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['speaker', 'text'],
          },
        },
      },
    });
  });
});
