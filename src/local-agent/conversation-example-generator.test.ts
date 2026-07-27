import { describe, expect, it } from 'bun:test';
import type { AgentModelProviderOptions } from '../domain/agent-model-provider';
import {
  ConversationExampleError,
  type ConversationExampleInput,
  type ConversationExampleTurn,
} from '../domain/conversation-example';
import { verifyConversationExampleInput } from '../domain/conversation-example-prompt';
import {
  CONVERSATION_EXAMPLE_N_PREDICT,
  CONVERSATION_EXAMPLE_TEMPERATURE,
  CONVERSATION_EXAMPLE_TOTAL_TURNS,
  type ConversationExampleCompletionPort,
  type ConversationExampleSession,
  createConversationExampleGenerator,
  createConversationExampleTurnModelRequest,
} from './conversation-example-generator';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらもオープンソースに関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  language: 'ja',
};

const VERIFIED_INPUT = verifyConversationExampleInput(INPUT);

const TURN_TEXT_1 = '最近触った OSS はありますか？';
const TURN_TEXT_2 = '小さな CLI を直しています。';
const TURN_TEXT_3 = 'どこを改善しているんですか？';
const TURN_TEXT_4 = 'エラー表示を分かりやすくしています。';
const TURN_TEXTS = [TURN_TEXT_1, TURN_TEXT_2, TURN_TEXT_3, TURN_TEXT_4];

/** `beginSession` を 1 度だけ呼ばせ、以降は同じ Session を使い回す Recording Port。 */
class RecordingConversationExampleCompletionPort
  implements ConversationExampleCompletionPort
{
  sessionsOpened = 0;
  closeCalls = 0;
  readonly completeTurnCalls: Array<{
    readonly signal: AbortSignal | undefined;
  }> = [];
  private turnIndex = 0;

  constructor(
    private readonly outputs: readonly unknown[],
    private readonly options: {
      readonly duringTurn?: (turnIndex: number) => void;
      readonly closeError?: Error;
    } = {}
  ) {}

  beginSession(): ConversationExampleSession {
    this.sessionsOpened += 1;
    return {
      completeTurn: (_request, turnOptions) => {
        const index = this.turnIndex;
        this.turnIndex += 1;
        this.completeTurnCalls.push({ signal: turnOptions?.signal });
        this.options.duringTurn?.(index);
        return this.outputs[index];
      },
      close: async () => {
        this.closeCalls += 1;
        if (this.options.closeError) throw this.options.closeError;
      },
    };
  }
}

function validTurnOutputs(): unknown[] {
  return TURN_TEXTS.map((text) => ({ text }));
}

describe('createConversationExampleTurnModelRequest（Issue 169 のターン毎 bounded request）', () => {
  it('Strict JSON Schema・Tool 無し・128 token・temperature 0.7 を固定する', () => {
    const request = createConversationExampleTurnModelRequest(
      VERIFIED_INPUT,
      [],
      'owner',
      0,
      4
    );

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]).toMatchObject({
      role: 'system',
      trust: 'trusted-instruction',
    });
    expect(request.messages[1]).toMatchObject({
      role: 'user',
      trust: 'untrusted-data',
    });
    expect(request.responseFormat).toMatchObject({
      type: 'json_schema',
      name: 'conversation_example_turn_output',
      strict: true,
    });
    expect(request.tools).toEqual([]);
    expect(request.generation).toEqual({
      nPredict: CONVERSATION_EXAMPLE_N_PREDICT,
      temperature: CONVERSATION_EXAMPLE_TEMPERATURE,
    });
  });
});

describe('createConversationExampleGenerator（Issue 169 のターン毎生成・Context 1 度再利用）', () => {
  it('4 ターンを owner 開始で交互生成し、Session を 1 度だけ開いて 1 度だけ閉じる', async () => {
    const port = new RecordingConversationExampleCompletionPort(
      validTurnOutputs()
    );
    const confirmed: ConversationExampleTurn[] = [];
    const generator = createConversationExampleGenerator(port);

    const example = await generator.generate(INPUT, {
      onTurn: (turn) => confirmed.push(turn),
    });

    const expectedTurns: ConversationExampleTurn[] = [
      { speaker: 'owner', text: TURN_TEXT_1 },
      { speaker: 'peer', text: TURN_TEXT_2 },
      { speaker: 'owner', text: TURN_TEXT_3 },
      { speaker: 'peer', text: TURN_TEXT_4 },
    ];
    expect(example.turns).toEqual(expectedTurns);
    expect(confirmed).toEqual(expectedTurns);
    expect(port.sessionsOpened).toBe(1);
    expect(port.closeCalls).toBe(1);
    expect(port.completeTurnCalls).toHaveLength(
      CONVERSATION_EXAMPLE_TOTAL_TURNS
    );
  });

  it('onTurn の isFinalTurn は最終ターンだけ true にし、画面側の typing indicator 判定に使わせる', async () => {
    // レビュー指摘（ghost typing indicator）の回帰テスト。呼び出し側
    // （`app/conversation-example-flow.ts`）はこの真偽値だけを見て、次の話者が
    // いない最終ターン確定後に typing indicator を出さない。ターン数を知る
    // この生成側が正しく伝えることを固定する。
    const port = new RecordingConversationExampleCompletionPort(
      validTurnOutputs()
    );
    const isFinalTurnFlags: boolean[] = [];
    const generator = createConversationExampleGenerator(port);

    await generator.generate(INPUT, {
      onTurn: (_turn, isFinalTurn) => isFinalTurnFlags.push(isFinalTurn),
    });

    expect(isFinalTurnFlags).toEqual([false, false, false, true]);
  });

  it('開始前に Abort 済みなら Session を開始しない', async () => {
    const port = new RecordingConversationExampleCompletionPort(
      validTurnOutputs()
    );
    const generator = createConversationExampleGenerator(port);
    const controller = new AbortController();
    controller.abort();

    await expect(
      generator.generate(INPUT, { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(port.sessionsOpened).toBe(0);
  });

  it('不正な Prompt 入力は Session を開始する前に拒否する', async () => {
    const port = new RecordingConversationExampleCompletionPort(
      validTurnOutputs()
    );
    const generator = createConversationExampleGenerator(port);

    await expect(
      generator.generate({ ...INPUT, bridgeReason: 'a@example.com' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(port.sessionsOpened).toBe(0);
  });

  it('ターン単位の Content Guard 違反はそのターンで停止し、確定済みターンだけを onTurn へ通知する', async () => {
    const outputs = [
      { text: TURN_TEXT_1 },
      { text: '連絡は a@example.com へ' },
      { text: TURN_TEXT_3 },
      { text: TURN_TEXT_4 },
    ];
    const port = new RecordingConversationExampleCompletionPort(outputs);
    const confirmed: ConversationExampleTurn[] = [];
    const generator = createConversationExampleGenerator(port);

    await expect(
      generator.generate(INPUT, { onTurn: (turn) => confirmed.push(turn) })
    ).rejects.toBeInstanceOf(ConversationExampleError);

    expect(confirmed).toEqual([{ speaker: 'owner', text: TURN_TEXT_1 }]);
    expect(port.completeTurnCalls).toHaveLength(2);
    expect(port.closeCalls).toBe(1);
  });

  it('owner 実機観測（Issue 169: 3 ターン目が 1 ターン目の完全反復）を再現し、繰り返しターンで会話を終了する', async () => {
    // 3 ターン目（owner）が 1 ターン目（owner）とまったく同じ文を返した実観測を
    // そのまま再現する。2 ターン目（peer）までは確定させ、3 ターン目で Guard 違反
    // として会話を終了し、4 ターン目には進まない。
    const outputs = [
      { text: TURN_TEXT_1 },
      { text: TURN_TEXT_2 },
      { text: TURN_TEXT_1 },
      { text: TURN_TEXT_4 },
    ];
    const port = new RecordingConversationExampleCompletionPort(outputs);
    const confirmed: ConversationExampleTurn[] = [];
    const generator = createConversationExampleGenerator(port);

    await expect(
      generator.generate(INPUT, { onTurn: (turn) => confirmed.push(turn) })
    ).rejects.toBeInstanceOf(ConversationExampleError);

    expect(confirmed).toEqual([
      { speaker: 'owner', text: TURN_TEXT_1 },
      { speaker: 'peer', text: TURN_TEXT_2 },
    ]);
    expect(port.completeTurnCalls).toHaveLength(3);
    expect(port.closeCalls).toBe(1);
  });

  it('生成途中の Abort は Cancel エラーにし、確定済みターンだけを残して Session を閉じる', async () => {
    const controller = new AbortController();
    const outputs = validTurnOutputs();
    const port = new RecordingConversationExampleCompletionPort(outputs, {
      duringTurn: (index) => {
        if (index === 1) controller.abort();
      },
    });
    const confirmed: ConversationExampleTurn[] = [];
    const generator = createConversationExampleGenerator(port);

    await expect(
      generator.generate(INPUT, {
        signal: controller.signal,
        onTurn: (turn) => confirmed.push(turn),
      })
    ).rejects.toMatchObject({ code: 'CANCELLED' });

    expect(confirmed).toEqual([{ speaker: 'owner', text: TURN_TEXT_1 }]);
    expect(port.closeCalls).toBe(1);
  });

  it('Session Close の失敗は全ターン成功後でも Provider 失敗として伝える', async () => {
    const closeError = new Error('native release failed');
    const port = new RecordingConversationExampleCompletionPort(
      validTurnOutputs(),
      { closeError }
    );
    const generator = createConversationExampleGenerator(port);

    await expect(generator.generate(INPUT)).rejects.toBe(closeError);
    expect(port.closeCalls).toBe(1);
  });

  it('completeTurn へ渡す signal は Session 全体で同じ AbortSignal にする', async () => {
    const controller = new AbortController();
    const port = new RecordingConversationExampleCompletionPort(
      validTurnOutputs()
    );
    const generator = createConversationExampleGenerator(port);

    await generator.generate(INPUT, { signal: controller.signal });

    const signals: Array<AgentModelProviderOptions['signal']> =
      port.completeTurnCalls.map((call) => call.signal);
    expect(signals).toEqual([
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
    ]);
  });
});
