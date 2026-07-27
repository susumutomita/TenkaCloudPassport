import {
  AgentModelProviderError,
  type AgentModelProviderOptions,
} from '../domain/agent-model-provider';
import {
  type ConversationExampleGenerator,
  type ConversationExampleInput,
  parseConversationExample,
} from '../domain/conversation-example';
import { buildConversationExamplePrompt } from '../domain/conversation-example-prompt';
import type { LocalModelMessage } from './model-safety-boundary';

export const CONVERSATION_EXAMPLE_N_PREDICT = 512;
export const CONVERSATION_EXAMPLE_TEMPERATURE = 0.7;

export interface ConversationExampleModelRequest {
  readonly messages: readonly [LocalModelMessage, LocalModelMessage];
  readonly responseFormat: {
    readonly type: 'json_schema';
    readonly name: 'conversation_example_output';
    readonly strict: true;
    readonly schema: object;
  };
  readonly tools: readonly [];
  readonly generation: {
    readonly nPredict: typeof CONVERSATION_EXAMPLE_N_PREDICT;
    readonly temperature: typeof CONVERSATION_EXAMPLE_TEMPERATURE;
  };
}

export interface ConversationExampleCompletionPort {
  complete(
    request: ConversationExampleModelRequest,
    options?: AgentModelProviderOptions
  ): unknown | Promise<unknown>;
}

/** Prompt Builder と JSON Schema を同じ request に束ねる、内容を保持しない Pure Factory。 */
export function createConversationExampleModelRequest(
  input: ConversationExampleInput
): ConversationExampleModelRequest {
  const prompt = buildConversationExamplePrompt(input);
  return {
    messages: [
      {
        role: 'system',
        trust: 'trusted-instruction',
        content: prompt.systemPrompt,
      },
      {
        role: 'user',
        trust: 'untrusted-data',
        content: prompt.userPrompt,
      },
    ],
    responseFormat: {
      type: 'json_schema',
      name: 'conversation_example_output',
      strict: true,
      schema: prompt.responseSchema,
    },
    tools: [],
    generation: {
      nPredict: CONVERSATION_EXAMPLE_N_PREDICT,
      temperature: CONVERSATION_EXAMPLE_TEMPERATURE,
    },
  };
}

function cancelledError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'CANCELLED',
    '会話例の端末内生成は取り消されました。'
  );
}

/**
 * 既存 Local Model Completion Port の Context / lease / release 境界を再利用する。
 * Native の unknown は必ず `parseConversationExample` を通し、検証前の値を返さない。
 */
export function createConversationExampleGenerator(
  completion: ConversationExampleCompletionPort
): ConversationExampleGenerator {
  return {
    async generate(input, options) {
      if (options?.signal?.aborted) throw cancelledError();
      const request = createConversationExampleModelRequest(input);
      const output = await completion.complete(request, options);
      if (options?.signal?.aborted) throw cancelledError();
      return parseConversationExample(output);
    },
  };
}
