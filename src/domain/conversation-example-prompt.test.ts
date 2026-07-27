import { describe, expect, it } from 'bun:test';
import {
  ConversationExampleError,
  type ConversationExampleInput,
  type ConversationExampleTurn,
} from './conversation-example';
import {
  buildConversationExampleTurnPrompt,
  CONVERSATION_EXAMPLE_TURN_RESPONSE_SCHEMA,
  verifyConversationExampleInput,
} from './conversation-example-prompt';

// `exactOptionalPropertyTypes` 下では `INPUT.ownerProfileText` の静的型が
// `string | undefined` になり、`VerifiedConversationExampleInput`（`string` 必須）
// への直接代入が型エラーになる。テストの期待値は plain `string` の定数から作る。
const OWNER_PROFILE_TEXT = 'クラウド基盤を作っています';
const PEER_PROFILE_TEXT = 'OSS の運営をしています';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらもオープンソースに関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  ownerProfileText: OWNER_PROFILE_TEXT,
  peerProfileText: PEER_PROFILE_TEXT,
  language: 'ja',
};

// Issue 169（/simplify 指摘）: `buildConversationExampleTurnPrompt` は呼び出し元
// （`conversation-example-generator.ts`）が会話 1 回につき 1 度だけ検証した値を
// 受け取る契約に変わり、自ら再検証しない。ターン毎プロンプトのテストは、この
// 検証済み値を使い回す。
const VERIFIED_INPUT = verifyConversationExampleInput(INPUT);

const TRANSCRIPT_TURN_1_TEXT = '最近触った OSS はありますか？';
const TRANSCRIPT: readonly ConversationExampleTurn[] = [
  { speaker: 'owner', text: TRANSCRIPT_TURN_1_TEXT },
];

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

describe('verifyConversationExampleInput（氏名・連絡先を持たない入力境界）', () => {
  it('前後の空白だけを除き、Bridge と Profile text を検証済み値へ正規化する', () => {
    const verified = verifyConversationExampleInput({
      ...INPUT,
      bridgeReason: '  共通点です  ',
    });

    expect(verified).toEqual({
      language: 'ja',
      bridgeReason: '共通点です',
      bridgeOpener: INPUT.bridgeOpener,
      ownerProfileText: OWNER_PROFILE_TEXT,
      peerProfileText: PEER_PROFILE_TEXT,
    });
  });

  it('空白だけの Profile text は Field ごと省略する', () => {
    const verified = verifyConversationExampleInput({
      ...INPUT,
      ownerProfileText: '   ',
      peerProfileText: undefined,
    });

    expect(verified).toEqual({
      language: 'ja',
      bridgeReason: INPUT.bridgeReason,
      bridgeOpener: INPUT.bridgeOpener,
    });
  });

  it('未対応 Locale は型を信用せず拒否する', () => {
    expectInvalidInput(() =>
      Reflect.apply(verifyConversationExampleInput, undefined, [
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
      `1 行目${String.fromCharCode(13)}2 行目`,
      `a${String.fromCharCode(0x200b)}b`,
    ]) {
      expectInvalidInput(() =>
        verifyConversationExampleInput({ ...INPUT, bridgeReason })
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
        verifyConversationExampleInput({ ...INPUT, ...invalid })
      );
    }
  });

  it('Profile text の上限超過と制御文字を拒否する', () => {
    expectInvalidInput(() =>
      verifyConversationExampleInput({
        ...INPUT,
        ownerProfileText: 'あ'.repeat(421),
      })
    );
    expectInvalidInput(() =>
      verifyConversationExampleInput({
        ...INPUT,
        peerProfileText: `a${String.fromCharCode(0)}b`,
      })
    );
  });
});

describe('buildConversationExampleTurnPrompt（Issue 169 のターン毎 bounded prompt）', () => {
  it('確定済み transcript と次の話者だけを untrusted JSON へ格納する', () => {
    const prompt = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 1,
      totalTurns: 4,
    });
    const data = JSON.parse(prompt.userPrompt);

    expect(data).toEqual({
      language: 'ja',
      commonPoint: INPUT.bridgeReason,
      firstQuestion: INPUT.bridgeOpener,
      ownerProfileText: OWNER_PROFILE_TEXT,
      peerProfileText: PEER_PROFILE_TEXT,
      transcript: [{ speaker: 'owner', text: TRANSCRIPT_TURN_1_TEXT }],
      turnIndex: 1,
      totalTurns: 4,
      nextSpeaker: 'peer',
    });
    expect(prompt.responseSchema).toBe(
      CONVERSATION_EXAMPLE_TURN_RESPONSE_SCHEMA
    );
  });

  it('AI アシスタント同士が本人を演じず、接点を探す契約を話者ごとに固定する', () => {
    // Issue 155/169（owner フィードバック）: 人間 2 人の会話シナリオを創作させず、
    // AI 同士がオーナーの接点を先に見つけておく対話にする。本人の台詞を捏造しない
    // 契約をターン毎プロンプトでも固定する。
    const ownerTurn = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: [],
      speaker: 'owner',
      turnIndex: 0,
      totalTurns: 4,
    });
    const peerTurn = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 1,
      totalTurns: 4,
    });

    for (const prompt of [ownerTurn, peerTurn]) {
      expect(prompt.systemPrompt).toContain(
        'dialogue between two AI assistants'
      );
      expect(prompt.systemPrompt).toContain('third person');
      expect(prompt.systemPrompt).toContain(
        'never impersonate the owners themselves'
      );
      expect(prompt.systemPrompt).toContain(
        'discover and confirm what the two owners have in common'
      );
    }
    expect(ownerTurn.systemPrompt).toContain('as the "owner" assistant');
    expect(peerTurn.systemPrompt).toContain('as the "peer" assistant');
  });

  it('owner 実機観測（相手の情報を自分のオーナーの事として話す取り違え）を踏まえ、owner/peer と profile text の対応を話者ごとに system prompt で明示する', () => {
    // owner 実機フィードバック: 会話例で「自分の TenkaCloud を作っている」という
    // owner 側の事実を、peer 側のターンが自分のオーナーの事として話し、どちらが
    // どちらか分からなくなった。「first person / second person」という抽象的な
    // 言い方だけでは 1.5B モデルが対応関係を推測できないため、話者ごとの指示で
    // 「今回の話者自身の profile text だけを使ってよい」ことを固定する。
    const ownerTurn = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: [],
      speaker: 'owner',
      turnIndex: 0,
      totalTurns: 4,
    });
    const peerTurn = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 1,
      totalTurns: 4,
    });

    expect(ownerTurn.systemPrompt).toContain(
      'your owner is the person described in ownerProfileText'
    );
    expect(ownerTurn.systemPrompt).toContain(
      "never state peerProfileText facts as your own owner's facts"
    );
    expect(peerTurn.systemPrompt).toContain(
      'your owner is the person described in peerProfileText'
    );
    expect(peerTurn.systemPrompt).toContain(
      "never state ownerProfileText facts as your own owner's facts"
    );
  });

  it('owner 実機観測（Issue 169: 3 ターン目が 1 ターン目の完全反復）を踏まえ、反復禁止と直前ターンへの応答を指示する', () => {
    const prompt = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 1,
      totalTurns: 4,
    });

    expect(prompt.systemPrompt).toContain(
      'Never repeat the same or nearly the same line as any earlier turn in the transcript.'
    );
    expect(prompt.systemPrompt).toContain(
      'Always respond to the content of the immediately preceding turn before developing the dialogue further.'
    );
  });

  it('直前ターンの本文が実際に userPrompt の transcript へ入っていることを検証する', () => {
    const prompt = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 1,
      totalTurns: 4,
    });

    // owner 実機観測で「反復ループ」が起きた根本原因の一つは、直前ターンが
    // 本当にモデルへ渡っているかを固定していなかったこと。文字列そのものが
    // userPrompt に含まれることまで assert する。
    expect(prompt.userPrompt).toContain(TRANSCRIPT_TURN_1_TEXT);
    const data = JSON.parse(prompt.userPrompt);
    expect(data.transcript).toEqual([
      { speaker: 'owner', text: TRANSCRIPT_TURN_1_TEXT },
    ]);
  });

  it('最終ターンは話題提案で締めさせ、途中ターンは残りターン数を伝える', () => {
    const finalTurn = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 3,
      totalTurns: 4,
    });
    const midTurn = buildConversationExampleTurnPrompt({
      input: VERIFIED_INPUT,
      transcript: TRANSCRIPT,
      speaker: 'peer',
      turnIndex: 1,
      totalTurns: 4,
    });

    expect(finalTurn.systemPrompt).toContain('This is the final turn');
    expect(finalTurn.systemPrompt).toContain(
      'suggesting one concrete first topic'
    );
    expect(midTurn.systemPrompt).not.toContain('This is the final turn');
    expect(midTurn.systemPrompt).toContain('2 more turns after this one');
  });

  it('英語 Locale では英語生成を指示し、空の Profile text は Field ごと省略する', () => {
    const verifiedEnglish = verifyConversationExampleInput({
      bridgeReason: 'You both care about accessibility.',
      bridgeOpener: 'What accessibility problem are you working on?',
      ownerProfileText: '   ',
      language: 'en',
    });
    const prompt = buildConversationExampleTurnPrompt({
      input: verifiedEnglish,
      transcript: [],
      speaker: 'owner',
      turnIndex: 0,
      totalTurns: 4,
    });
    const data = JSON.parse(prompt.userPrompt);

    expect(prompt.systemPrompt).toContain('natural English');
    expect(data).toMatchObject({
      language: 'en',
      commonPoint: 'You both care about accessibility.',
      firstQuestion: 'What accessibility problem are you working on?',
    });
    expect(data).not.toHaveProperty('ownerProfileText');
  });

  it('余分な氏名 Field を持つ Object からも氏名を Prompt へ列挙しない', () => {
    const inputWithNames = {
      ...VERIFIED_INPUT,
      ownerName: 'Alice',
      peerName: 'Bob',
      email: 'alice@example.com',
    };
    const prompt = buildConversationExampleTurnPrompt({
      input: inputWithNames,
      transcript: [],
      speaker: 'owner',
      turnIndex: 0,
      totalTurns: 4,
    });

    expect(prompt.userPrompt).not.toContain('Alice');
    expect(prompt.userPrompt).not.toContain('Bob');
    expect(prompt.userPrompt).not.toContain('alice@example.com');
    expect(Object.keys(JSON.parse(prompt.userPrompt))).toEqual([
      'language',
      'commonPoint',
      'firstQuestion',
      'ownerProfileText',
      'peerProfileText',
      'transcript',
      'turnIndex',
      'totalTurns',
      'nextSpeaker',
    ]);
  });

  it('JSON Schema は text だけを要求し、追加 Field を禁止する', () => {
    expect(CONVERSATION_EXAMPLE_TURN_RESPONSE_SCHEMA).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
        },
      },
    });
  });
});
