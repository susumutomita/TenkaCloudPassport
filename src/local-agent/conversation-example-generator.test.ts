import { describe, expect, it } from 'bun:test';
import type { AgentModelProviderOptions } from '../domain/agent-model-provider';
import {
  type ConversationExampleInput,
  ConversationExampleError,
} from '../domain/conversation-example';
import {
  CONVERSATION_EXAMPLE_N_PREDICT,
  CONVERSATION_EXAMPLE_TEMPERATURE,
  type ConversationExampleCompletionPort,
  type ConversationExampleModelRequest,
  createConversationExampleGenerator,
  createConversationExampleModelRequest,
} from './conversation-example-generator';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらもオープンソースに関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  language: 'ja',
};

const VALID_OUTPUT = {
  turns: [
    { speaker: 'owner', text: '最近触った OSS はありますか？' },
    { speaker: 'peer', text: '小さな CLI を直しています。' },
  ],
};

class RecordingConversationCompletionPort
  implements ConversationExampleCompletionPort
{
  readonly requests: ConversationExampleModelRequest[] = [];
  readonly signals: Array<AbortSignal | undefined> = [];

  constructor(
    private readonly output: unknown,
    private readonly duringComplete?: (
      options: AgentModelProviderOptions | undefined
    ) => void
  ) {}

  complete(
    request: ConversationExampleModelRequest,
    options?: AgentModelProviderOptions
  ): unknown {
    this.requests.push(request);
    this.signals.push(options?.signal);
    this.duringComplete?.(options);
    return this.output;
  }
}

describe('ConversationExampleModelRequest（端末内自由生成の bounded request）', () => {
  it('Strict JSON Schema・Tool 無し・512 token・temperature 0.7 を固定する', () => {
    const request = createConversationExampleModelRequest(INPUT);

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
      name: 'conversation_example_output',
      strict: true,
    });
    expect(request.tools).toEqual([]);
    expect(request.generation).toEqual({
      nPredict: CONVERSATION_EXAMPLE_N_PREDICT,
      temperature: CONVERSATION_EXAMPLE_TEMPERATURE,
    });
  });
});

describe('createConversationExampleGenerator', () => {
  it('Completion Output を全件検証してから返す', async () => {
    const port = new RecordingConversationCompletionPort(VALID_OUTPUT);
    const generator = createConversationExampleGenerator(port);

    await expect(generator.generate(INPUT)).resolves.toEqual(VALID_OUTPUT);
    expect(port.requests).toHaveLength(1);
    expect(port.signals).toEqual([undefined]);
  });

  it('開始前に Abort 済みなら Native Completion を呼ばない', async () => {
    const port = new RecordingConversationCompletionPort(VALID_OUTPUT);
    const generator = createConversationExampleGenerator(port);
    const controller = new AbortController();
    controller.abort();

    await expect(
      generator.generate(INPUT, { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(port.requests).toHaveLength(0);
  });

  it('Completion 中に Abort された場合は返却値を表示用へ昇格させない', async () => {
    const controller = new AbortController();
    const port = new RecordingConversationCompletionPort(
      VALID_OUTPUT,
      () => controller.abort()
    );
    const generator = createConversationExampleGenerator(port);

    await expect(
      generator.generate(INPUT, { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(port.requests).toHaveLength(1);
  });

  it('不正な Output は ConversationExampleError として全体を破棄する', async () => {
    const port = new RecordingConversationCompletionPort({
      turns: [{ speaker: 'peer', text: '順番が不正です' }],
    });
    const generator = createConversationExampleGenerator(port);

    await expect(generator.generate(INPUT)).rejects.toBeInstanceOf(
      ConversationExampleError
    );
  });

  it('不正な Prompt 入力は Completion を開始する前に拒否する', async () => {
    const port = new RecordingConversationCompletionPort(VALID_OUTPUT);
    const generator = createConversationExampleGenerator(port);

    await expect(
      generator.generate({ ...INPUT, bridgeReason: 'a@example.com' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(port.requests).toHaveLength(0);
  });
});
