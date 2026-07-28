import {
  AgentModelProviderError,
  type AgentModelProviderOptions,
} from '../domain/agent-model-provider';
import type {
  ConversationExampleCompletionPort,
  ConversationExampleSession,
  ConversationExampleTurnModelRequest,
} from './conversation-example-generator';
import type {
  LocalModelCompletionPort,
  LocalModelRequest,
} from './model-safety-boundary';

/**
 * ADR-0057: Apple Intelligence（FoundationModels）Native Module（`modules/
 * apple-foundation-models/`）が公開する唯一の実行境界。`systemPrompt` /
 * `userPrompt` は検証済み Prompt 文字列、`schemaJson` は `responseFormat.schema`
 * を JSON 化した文字列で、Native 側の `AppleFoundationModelsSchemaConverter` が
 * `DynamicGenerationSchema` へ変換する。戻り値は Native からの生の JSON 文字列
 * （guided generation の場合）であり、`unknown` のまま受け取って必ず検証する。
 */
export interface AppleFoundationModelsNativePort {
  complete(
    systemPrompt: string,
    userPrompt: string,
    schemaJson: string,
    temperature: number
  ): Promise<unknown>;
}

type AppleModelRequest =
  | LocalModelRequest
  | ConversationExampleTurnModelRequest;

function cancelledError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'CANCELLED',
    'Apple Intelligence の実行は取り消されました。'
  );
}

function loadError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'LOAD_ERROR',
    'Apple Intelligence の Native 実行を完了できませんでした。'
  );
}

function schemaError(): AgentModelProviderError {
  return new AgentModelProviderError(
    'SCHEMA_ERROR',
    'Apple Intelligence の構造化 Output を解析できませんでした。'
  );
}

/** `signal` が既に abort 済みなら、他の判定より先に CANCELLED を投げる共有 Guard。 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError();
}

/**
 * レビュー指摘（high）: `ConversationExampleTurnModelRequest` だけが持つ
 * `generation.temperature`（会話例、ADR-0050 が意図的に `0.7` を指定）を
 * 無視すると、Native 側が常に決定的な `greedy` サンプリングへ倒れ、多様性が
 * 失われる（`llama-agent-model-provider.ts` の `completionParameters` と
 * 同じ `'generation' in request` 判定を踏襲する）。`LocalModelRequest`
 * （Bridge 判定）には `generation` が無く、既定は `0`（決定的）のまま。
 */
function temperatureForRequest(request: AppleModelRequest): number {
  return 'generation' in request ? request.generation.temperature : 0;
}

/** Native からの生値は JSON 文字列であることだけを信頼し、それ以外は fail-closed にする。 */
function parsedCompletionResult(result: unknown): unknown {
  if (typeof result !== 'string') {
    throw schemaError();
  }
  try {
    return JSON.parse(result);
  } catch {
    throw schemaError();
  }
}

/**
 * `llama.rn` 経路（`executeLlamaProvider`）と異なり、Apple の
 * `SystemLanguageModel` は Native 側に init/release lifecycle も execution
 * lease も持たない（ADR-0057 の設計判断 3 参照）。そのため、この関数 1 つが
 * 単発 `complete` とセッションの `completeTurn` の両方から共有される唯一の
 * 実行境界になる。Native 呼び出し自体を取り消す手段は無いため、abort は
 * 呼び出し前後でだけ観測し、結果が届いた時点で abort 済みなら結果を捨てる
 * （fire-and-forget。詳細は ADR-0057 の Known Limitation 節）。
 */
async function completeRequest(
  nativePort: AppleFoundationModelsNativePort,
  request: AppleModelRequest,
  signal: AbortSignal | undefined
): Promise<unknown> {
  throwIfAborted(signal);
  const [system, user] = request.messages;
  try {
    const raw = await nativePort.complete(
      system.content,
      user.content,
      JSON.stringify(request.responseFormat.schema),
      temperatureForRequest(request)
    );
    throwIfAborted(signal);
    return parsedCompletionResult(raw);
  } catch (error: unknown) {
    throwIfAborted(signal);
    throw error instanceof AgentModelProviderError ? error : loadError();
  }
}

/**
 * Apple Intelligence 版の Native Adapter。`LocalModelCompletionPort`
 * （単発 Bridge 判定）と `ConversationExampleCompletionPort`（会話例の
 * ターン毎生成）の両方を、同じ Native `complete` 呼び出しの繰り返しだけで
 * 満たす。セッションは Native 側に何も保持しないため `beginSession` は
 * 同期的に組み立てられ、`close()` は常に即解決する。
 */
export function createAppleFoundationModelsCompletionPort(
  nativePort: AppleFoundationModelsNativePort
): LocalModelCompletionPort & ConversationExampleCompletionPort {
  return {
    complete(request: LocalModelRequest, options?: AgentModelProviderOptions) {
      return completeRequest(nativePort, request, options?.signal);
    },
    beginSession(): ConversationExampleSession {
      return {
        completeTurn(request, options) {
          return completeRequest(nativePort, request, options?.signal);
        },
        close() {
          return Promise.resolve();
        },
      };
    },
  };
}
