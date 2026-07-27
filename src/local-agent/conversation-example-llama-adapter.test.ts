import { describe, expect, it } from 'bun:test';
import { LocalModelContextLeaseRegistry } from '../app/local-data-control';
import type {
  ConversationExampleInput,
  ConversationExampleTurn,
} from '../domain/conversation-example';
import {
  CONVERSATION_EXAMPLE_N_PREDICT,
  CONVERSATION_EXAMPLE_TEMPERATURE,
  CONVERSATION_EXAMPLE_TOTAL_TURNS,
  createConversationExampleGenerator,
} from './conversation-example-generator';
import {
  createLlamaCompletionPort,
  type LlamaCompletionParameters,
  type LlamaContextPort,
  type LlamaModulePort,
} from './llama-agent-model-provider';
import type {
  ModelBenchmarkRecorder,
  ModelBenchmarkSession,
} from './model-benchmark';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらも OSS に関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  language: 'ja',
};

const TURN_TEXT_1 = '最近触った OSS はありますか？';
const TURN_TEXT_2 = '小さな CLI を直しています。';
const TURN_TEXT_3 = 'どこを改善しているんですか？';
const TURN_TEXT_4 = 'エラー表示を分かりやすくしています。';
const TURN_TEXTS = [TURN_TEXT_1, TURN_TEXT_2, TURN_TEXT_3, TURN_TEXT_4];

describe('llama.rn Adapter の会話例 Session（Issue 169: Context 1 会話 1 度再利用）', () => {
  it('4 ターンとも同じ Context を再利用し、初期化・解放をそれぞれ 1 度だけ行う', async () => {
    const capturedParameters: LlamaCompletionParameters[] = [];
    let completionCalls = 0;
    let releaseCalls = 0;
    const initializations: object[] = [];
    const context: LlamaContextPort = {
      async completion(nextParameters, onToken) {
        capturedParameters.push(nextParameters);
        onToken({ token: '{' });
        const text = TURN_TEXTS[completionCalls];
        completionCalls += 1;
        return { text: JSON.stringify({ text }) };
      },
      async stopCompletion() {
        return;
      },
      async release() {
        releaseCalls += 1;
      },
    };
    const module: LlamaModulePort = {
      async initLlama(initialization) {
        initializations.push(initialization);
        return context;
      },
    };
    const completion = createLlamaCompletionPort(
      {
        modelPath: 'file:///data/model.gguf',
        nCtx: 2048,
        nGpuLayers: 32,
        nPredict: 96,
      },
      async () => module,
      new LocalModelContextLeaseRegistry(false)
    );
    const generator = createConversationExampleGenerator(completion);

    const example = await generator.generate(INPUT);

    const expectedTurns: ConversationExampleTurn[] = [
      { speaker: 'owner', text: TURN_TEXT_1 },
      { speaker: 'peer', text: TURN_TEXT_2 },
      { speaker: 'owner', text: TURN_TEXT_3 },
      { speaker: 'peer', text: TURN_TEXT_4 },
    ];
    expect(example.turns).toEqual(expectedTurns);
    // Context の init/release は会話 1 回につき 1 度だけ（4 ターン分の completion は
    // 同じ Native Context を使い回す）。
    expect(initializations).toEqual([
      {
        model: 'file:///data/model.gguf',
        n_ctx: 2048,
        n_gpu_layers: 32,
        n_parallel: 1,
        use_mmap: true,
        use_mlock: false,
        no_extra_bufts: true,
      },
    ]);
    expect(releaseCalls).toBe(1);
    expect(completionCalls).toBe(CONVERSATION_EXAMPLE_TOTAL_TURNS);
    for (const parameters of capturedParameters) {
      expect(parameters.n_predict).toBe(CONVERSATION_EXAMPLE_N_PREDICT);
      expect(parameters.temperature).toBe(CONVERSATION_EXAMPLE_TEMPERATURE);
      expect(parameters.response_format).toMatchObject({
        type: 'json_schema',
        json_schema: { strict: true },
      });
    }
  });

  it('Session Close 失敗時も Context Release は 1 度だけ試み、Load Error にする', async () => {
    let releaseCalls = 0;
    const context: LlamaContextPort = {
      async completion(_parameters, onToken) {
        onToken({ token: '{' });
        return { text: JSON.stringify({ text: TURN_TEXT_1 }) };
      },
      async stopCompletion() {
        return;
      },
      async release() {
        releaseCalls += 1;
        throw new Error('native release failed');
      },
    };
    const module: LlamaModulePort = {
      async initLlama() {
        return context;
      },
    };
    const completion = createLlamaCompletionPort(
      {
        modelPath: 'file:///data/model.gguf',
        nCtx: 2048,
        nGpuLayers: 32,
        nPredict: 96,
      },
      async () => module,
      new LocalModelContextLeaseRegistry(false)
    );
    const generator = createConversationExampleGenerator(completion);

    await expect(generator.generate(INPUT)).rejects.toMatchObject({
      code: 'LOAD_ERROR',
    });
    expect(releaseCalls).toBe(1);
  });

  it('既に Model Context を握っている lease は会話例 Session 開始も Load Error にする', async () => {
    const leases = new LocalModelContextLeaseRegistry(false);
    const activeLease = leases.acquire();
    const completion = createLlamaCompletionPort(
      {
        modelPath: 'file:///data/model.gguf',
        nCtx: 2048,
        nGpuLayers: 32,
        nPredict: 96,
      },
      async () => {
        throw new Error('module load should not be attempted');
      },
      leases
    );
    const generator = createConversationExampleGenerator(completion);

    await expect(generator.generate(INPUT)).rejects.toMatchObject({
      code: 'LOAD_ERROR',
    });

    activeLease.release();
  });

  it('途中ターンの Native 失敗は Context Release 自体が成功しても Benchmark を failed で終える', async () => {
    // レビュー指摘（HIGH）の回帰テスト: `close()` は従来 `context.release()` 自体の
    // 成否だけを見て Benchmark outcome を決めていたため、2 ターン目の Native
    // completion が失敗しても Context の解放自体は正常に終わる場合、誤って
    // 'success' を記録していた。`executeLlamaProvider` と同じ考え方で、
    // completion の失敗・Cancel を outcome へ反映することを固定する。
    const outcomes: string[] = [];
    const recorder: ModelBenchmarkRecorder = {
      async start() {
        const session: ModelBenchmarkSession = {
          markLoaded: () => undefined,
          markFirstToken: () => undefined,
          markCompletion: () => undefined,
          async finish(outcome) {
            outcomes.push(outcome);
          },
        };
        return session;
      },
    };
    let completionCalls = 0;
    let releaseCalls = 0;
    const context: LlamaContextPort = {
      async completion(_parameters, onToken) {
        onToken({ token: '{' });
        completionCalls += 1;
        if (completionCalls === 2) {
          throw new Error('native completion failed on turn 2');
        }
        return {
          text: JSON.stringify({ text: TURN_TEXTS[completionCalls - 1] }),
        };
      },
      async stopCompletion() {
        return;
      },
      async release() {
        releaseCalls += 1;
      },
    };
    const module: LlamaModulePort = {
      async initLlama() {
        return context;
      },
    };
    const completion = createLlamaCompletionPort(
      {
        modelPath: 'file:///data/model.gguf',
        nCtx: 2048,
        nGpuLayers: 32,
        nPredict: 96,
      },
      async () => module,
      new LocalModelContextLeaseRegistry(false),
      recorder
    );
    const generator = createConversationExampleGenerator(completion);

    await expect(generator.generate(INPUT)).rejects.toMatchObject({
      code: 'LOAD_ERROR',
    });

    expect(releaseCalls).toBe(1);
    expect(outcomes).toEqual(['failed']);
  });

  it('途中ターンの Abort は Context Release 自体が成功しても Benchmark を cancelled で終える', async () => {
    // レビュー指摘の回帰テスト: 'failed' 分岐は上のテストで検証済みだが、
    // 'cancelled' 分岐は beginConversationExampleSession を実際に経由するテストが
    // 無かった（fake port を使う generator のテストだけが Cancel を再現していた）。
    const outcomes: string[] = [];
    const recorder: ModelBenchmarkRecorder = {
      async start() {
        const session: ModelBenchmarkSession = {
          markLoaded: () => undefined,
          markFirstToken: () => undefined,
          markCompletion: () => undefined,
          async finish(outcome) {
            outcomes.push(outcome);
          },
        };
        return session;
      },
    };
    const controller = new AbortController();
    let completionCalls = 0;
    let releaseCalls = 0;
    const context: LlamaContextPort = {
      async completion(_parameters, onToken) {
        completionCalls += 1;
        if (completionCalls === 2) controller.abort();
        onToken({ token: '{' });
        return {
          text: JSON.stringify({ text: TURN_TEXTS[completionCalls - 1] }),
        };
      },
      async stopCompletion() {
        return;
      },
      async release() {
        releaseCalls += 1;
      },
    };
    const module: LlamaModulePort = {
      async initLlama() {
        return context;
      },
    };
    const completion = createLlamaCompletionPort(
      {
        modelPath: 'file:///data/model.gguf',
        nCtx: 2048,
        nGpuLayers: 32,
        nPredict: 96,
      },
      async () => module,
      new LocalModelContextLeaseRegistry(false),
      recorder
    );
    const generator = createConversationExampleGenerator(completion);

    await expect(
      generator.generate(INPUT, { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'CANCELLED' });

    expect(releaseCalls).toBe(1);
    expect(outcomes).toEqual(['cancelled']);
  });

  it('Module 読込・Model 初期化の失敗は Session 開始時に Load Error にし、lease を解放する', async () => {
    const leases = new LocalModelContextLeaseRegistry(false);
    const completion = createLlamaCompletionPort(
      {
        modelPath: 'file:///data/model.gguf',
        nCtx: 2048,
        nGpuLayers: 32,
        nPredict: 96,
      },
      async () => {
        throw new Error('native module unavailable');
      },
      leases
    );
    const generator = createConversationExampleGenerator(completion);

    await expect(generator.generate(INPUT)).rejects.toMatchObject({
      code: 'LOAD_ERROR',
    });
    expect(leases.hasActiveContext()).toBe(false);
  });
});
