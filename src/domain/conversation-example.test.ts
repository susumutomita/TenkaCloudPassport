import { describe, expect, it } from 'bun:test';
import {
  ConversationExampleError,
  parseConversationExample,
} from './conversation-example';

function validExample(turnCount = 4): {
  readonly turns: readonly {
    readonly speaker: string;
    readonly text: string;
  }[];
} {
  return {
    turns: Array.from({ length: turnCount }, (_, index) => ({
      speaker: index % 2 === 0 ? 'owner' : 'peer',
      text: index % 2 === 0 ? ` 質問 ${index + 1} ` : `回答 ${index + 1}`,
    })),
  };
}

function expectInvalidOutput(action: () => unknown): void {
  try {
    action();
    throw new Error('ConversationExampleError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConversationExampleError);
    if (!(error instanceof ConversationExampleError)) throw error;
    expect(error.code).toBe('INVALID_OUTPUT');
  }
}

describe('parseConversationExample（Issue 155 の fail-closed 出力契約）', () => {
  it.each([2, 4, 6])('%i ターンの owner 開始・交互会話を受理する', (count) => {
    const parsed = parseConversationExample(validExample(count));

    expect(parsed.turns).toHaveLength(count);
    expect(parsed.turns[0]).toEqual({ speaker: 'owner', text: '質問 1' });
  });

  it('turns が 1 件または 7 件なら全体を拒否する', () => {
    expectInvalidOutput(() => parseConversationExample(validExample(1)));
    expectInvalidOutput(() => parseConversationExample(validExample(7)));
  });

  it('owner 開始でない場合と同じ話者が連続する場合を拒否する', () => {
    expectInvalidOutput(() =>
      parseConversationExample({
        turns: [
          { speaker: 'peer', text: 'こんにちは' },
          { speaker: 'owner', text: 'こんにちは' },
        ],
      })
    );
    expectInvalidOutput(() =>
      parseConversationExample({
        turns: [
          { speaker: 'owner', text: 'こんにちは' },
          { speaker: 'owner', text: 'こんにちは' },
        ],
      })
    );
  });

  it('未知の speaker、Root・Turn の追加 Field、型違いを拒否する', () => {
    expectInvalidOutput(() =>
      parseConversationExample({
        turns: [
          { speaker: 'owner', text: 'こんにちは' },
          { speaker: 'assistant', text: 'こんにちは' },
        ],
      })
    );
    expectInvalidOutput(() =>
      parseConversationExample({ ...validExample(2), extra: true })
    );
    expectInvalidOutput(() =>
      parseConversationExample({
        turns: [
          { speaker: 'owner', text: 'こんにちは', extra: true },
          { speaker: 'peer', text: 'こんにちは' },
        ],
      })
    );
    expectInvalidOutput(() => parseConversationExample({ turns: 'not-array' }));
    expectInvalidOutput(() => parseConversationExample(null));
  });

  it('空文字、81 文字、改行、制御文字、不可視文字を拒否する', () => {
    for (const text of [
      '   ',
      'あ'.repeat(81),
      '1 行目\n2 行目',
      '末尾改行\n',
      '1 行目\u20282 行目',
      'a\u0000b',
      'a\u200bb',
    ]) {
      expectInvalidOutput(() =>
        parseConversationExample({
          turns: [
            { speaker: 'owner', text },
            { speaker: 'peer', text: '安全な本文' },
          ],
        })
      );
    }
  });

  it('メール、URL、電話番号らしい本文を拒否し、短い年号は受理する', () => {
    for (const text of [
      '連絡は a@example.com へ',
      'https://example.com を見てください',
      'www.example.com を見てください',
      '電話は 090-1234-5678 です',
    ]) {
      expectInvalidOutput(() =>
        parseConversationExample({
          turns: [
            { speaker: 'owner', text },
            { speaker: 'peer', text: '安全な本文' },
          ],
        })
      );
    }

    expect(
      parseConversationExample({
        turns: [
          { speaker: 'owner', text: '2026 年に 3 回参加しました' },
          { speaker: 'peer', text: 'その話を聞きたいです' },
        ],
      }).turns[0]?.text
    ).toBe('2026 年に 3 回参加しました');
  });

  it('Getter を実行せず、特殊 Prototype・Symbol Field・疎な Array を拒否する', () => {
    let getterCalls = 0;
    const accessorTurn: Record<string, unknown> = Object.create(null);
    Object.defineProperty(accessorTurn, 'speaker', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'owner';
      },
    });
    Object.defineProperty(accessorTurn, 'text', {
      enumerable: true,
      value: 'こんにちは',
    });
    expectInvalidOutput(() =>
      parseConversationExample({
        turns: [accessorTurn, { speaker: 'peer', text: 'こんにちは' }],
      })
    );
    expect(getterCalls).toBe(0);

    const specialTurn: Record<string, unknown> = Object.create({
      inherited: true,
    });
    specialTurn.speaker = 'owner';
    specialTurn.text = 'こんにちは';
    expectInvalidOutput(() =>
      parseConversationExample({
        turns: [specialTurn, { speaker: 'peer', text: 'こんにちは' }],
      })
    );

    const symbolRoot = validExample(2);
    Object.defineProperty(symbolRoot, Symbol('hidden'), { value: true });
    expectInvalidOutput(() => parseConversationExample(symbolRoot));

    const sparseTurns: unknown[] = [];
    sparseTurns.length = 2;
    sparseTurns[0] = { speaker: 'owner', text: 'こんにちは' };
    expectInvalidOutput(() => parseConversationExample({ turns: sparseTurns }));

    const specialArray = [
      { speaker: 'owner', text: 'こんにちは' },
      { speaker: 'peer', text: 'こんにちは' },
    ];
    Object.setPrototypeOf(specialArray, null);
    expectInvalidOutput(() =>
      parseConversationExample({ turns: specialArray })
    );
  });
});
