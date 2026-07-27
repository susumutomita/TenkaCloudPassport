import { describe, expect, it } from 'bun:test';
import { LocalModelContextLeaseRegistry } from '../app/local-data-control';
import type { ConversationExampleInput } from '../domain/conversation-example';
import {
  CONVERSATION_EXAMPLE_N_PREDICT,
  CONVERSATION_EXAMPLE_TEMPERATURE,
  createConversationExampleGenerator,
} from './conversation-example-generator';
import {
  createLlamaCompletionPort,
  type LlamaCompletionParameters,
  type LlamaContextPort,
  type LlamaModulePort,
} from './llama-agent-model-provider';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらも OSS に関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  language: 'ja',
};

describe('llama.rn Adapter の会話例 Request 設定（Issue 155）', () => {
  it('既存 Context lifecycle で Request 単位の生成設定だけを上書きする', async () => {
    const captured: { parameters: LlamaCompletionParameters | null } = {
      parameters: null,
    };
    let releaseCalls = 0;
    const initializations: object[] = [];
    const context: LlamaContextPort = {
      async completion(nextParameters, onToken) {
        captured.parameters = nextParameters;
        onToken({ token: '{' });
        return {
          text: JSON.stringify({
            turns: [
              { speaker: 'owner', text: '最近触った OSS はありますか？' },
              { speaker: 'peer', text: '小さな CLI を直しています。' },
            ],
          }),
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

    await expect(generator.generate(INPUT)).resolves.toMatchObject({
      turns: [{ speaker: 'owner' }, { speaker: 'peer' }],
    });
    expect(captured.parameters?.n_predict).toBe(CONVERSATION_EXAMPLE_N_PREDICT);
    expect(captured.parameters?.temperature).toBe(
      CONVERSATION_EXAMPLE_TEMPERATURE
    );
    expect(captured.parameters?.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { strict: true },
    });
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
  });
});
