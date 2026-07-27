import {
  AgentModelProviderError,
  type AgentModelProviderOptions,
} from '../domain/agent-model-provider';
import {
  CONVERSATION_EXAMPLE_DEFAULT_TURNS,
  type ConversationExample,
  type ConversationExampleGenerator,
  type ConversationExampleSpeaker,
  type ConversationExampleTurn,
  parseConversationExampleTurn,
} from '../domain/conversation-example';
import {
  buildConversationExampleTurnPrompt,
  type VerifiedConversationExampleInput,
  verifyConversationExampleInput,
} from '../domain/conversation-example-prompt';
import type { LocalModelMessage } from './model-safety-boundary';

/**
 * Issue 169: 単発 completion（全ターン一括生成）をやめ、ターン毎生成へ移行した。
 * 1 ターンの本文は 80 文字以内で収まるため、512 token だった旧 nPredict を
 * 1 ターン分の予算へ縮小する。temperature は既存どおり流用する。
 */
export const CONVERSATION_EXAMPLE_N_PREDICT = 128;
export const CONVERSATION_EXAMPLE_TEMPERATURE = 0.7;
export const CONVERSATION_EXAMPLE_TOTAL_TURNS =
  CONVERSATION_EXAMPLE_DEFAULT_TURNS;

export interface ConversationExampleTurnModelRequest {
  readonly messages: readonly [LocalModelMessage, LocalModelMessage];
  readonly responseFormat: {
    readonly type: 'json_schema';
    readonly name: 'conversation_example_turn_output';
    readonly strict: true;
    readonly schema: object;
  };
  readonly tools: readonly [];
  readonly generation: {
    readonly nPredict: typeof CONVERSATION_EXAMPLE_N_PREDICT;
    readonly temperature: typeof CONVERSATION_EXAMPLE_TEMPERATURE;
  };
}

/**
 * 会話 1 回（`generate` 呼び出し）につき Native Context を 1 度だけ確保し、
 * 全ターンで再利用してから解放する境界。Adapter（`llama-agent-model-provider.ts`）
 * が Context lifecycle・execution lease を実装し、この Domain 側は completion の
 * 入出力形だけを知る。
 */
export interface ConversationExampleSession {
  completeTurn(
    request: ConversationExampleTurnModelRequest,
    options?: AgentModelProviderOptions
  ): unknown | Promise<unknown>;
  close(): Promise<void>;
}

export interface ConversationExampleCompletionPort {
  beginSession(
    options?: AgentModelProviderOptions
  ): Promise<ConversationExampleSession> | ConversationExampleSession;
}

/**
 * Prompt Builder と JSON Schema を同じ request に束ねる、内容を保持しない Pure Factory。
 * `input` は呼び出し元（`generate`）が会話 1 回につき 1 度だけ検証済みの値を渡す
 * （ターンごとに同じ不変な入力を再検証しない）。
 */
export function createConversationExampleTurnModelRequest(
  input: VerifiedConversationExampleInput,
  transcript: readonly ConversationExampleTurn[],
  speaker: ConversationExampleSpeaker,
  turnIndex: number,
  totalTurns: number
): ConversationExampleTurnModelRequest {
  const prompt = buildConversationExampleTurnPrompt({
    input,
    transcript,
    speaker,
    turnIndex,
    totalTurns,
  });
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
      name: 'conversation_example_turn_output',
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

function speakerForTurn(turnIndex: number): ConversationExampleSpeaker {
  return turnIndex % 2 === 0 ? 'owner' : 'peer';
}

/**
 * 既存 Local Model Completion Port の Context / lease / release 境界を再利用する。
 * Native の unknown は必ず `parseConversationExampleTurn` を通し、検証前の値を返さない。
 * Context は `beginSession` で 1 度だけ確保し、`finally` で必ず 1 度だけ解放する
 * （途中失敗・Cancel でも Native Context を握ったままにしない）。
 */
export function createConversationExampleGenerator(
  port: ConversationExampleCompletionPort
): ConversationExampleGenerator {
  return {
    async generate(input, options) {
      if (options?.signal?.aborted) throw cancelledError();
      // Native Context を確保する前に、Prompt 入力全体を 1 度だけ検証して失敗を早める。
      // 会話全体で不変な入力のため、ターンごとに検証し直さず以後はこの値を使い回す。
      const verifiedInput = verifyConversationExampleInput(input);

      const totalTurns = CONVERSATION_EXAMPLE_TOTAL_TURNS;
      const session = await port.beginSession(options);
      const turns: ConversationExampleTurn[] = [];
      try {
        for (let turnIndex = 0; turnIndex < totalTurns; turnIndex += 1) {
          if (options?.signal?.aborted) throw cancelledError();
          const speaker = speakerForTurn(turnIndex);
          const request = createConversationExampleTurnModelRequest(
            verifiedInput,
            turns,
            speaker,
            turnIndex,
            totalTurns
          );
          const output = await session.completeTurn(request, options);
          if (options?.signal?.aborted) throw cancelledError();
          const turn = parseConversationExampleTurn(output, speaker, turns);
          turns.push(turn);
          options?.onTurn?.(turn, turnIndex === totalTurns - 1);
        }
        // turns は既にターン毎の fail-closed 検証を通った内部データであり、
        // Native からの unknown ではないため再検証しない（旧一括生成の
        // `parseConversationExample` は本経路から呼ばれなくなったため削除した）。
        return { turns } satisfies ConversationExample;
      } finally {
        await session.close();
      }
    },
  };
}
