import {
  type AgentModelProvider,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import {
  type AppleFoundationModelsNativePort,
  createAppleFoundationModelsCompletionPort,
} from '../local-agent/apple-foundation-models-provider';
import { createConversationExampleGenerator } from '../local-agent/conversation-example-generator';
import { createSafetyBoundLocalModelProvider } from '../local-agent/model-safety-boundary';
import { registerConversationExampleGenerator } from './conversation-example-capability';

export interface NativeAgentModelProviderComposition {
  readonly runningInExpoGo: boolean;
  readonly appleFoundationModels: AppleFoundationModelsNativePort;
}

/**
 * ADR-0057: Apple Intelligence（FoundationModels）を唯一の Primary Provider にする。
 *
 * ADR-0038（v1.0）はここを Rules 固定にしていた（オンデバイス LLM を消費者導線から
 * 外すため）。ADR-0043 は Qwen（GGUF ダウンロード型・llama.rn）を再導入したが、
 * v1.1.1〜v1.1.6 の実機不具合がほぼ全てダウンロード起因だったため、ADR-0057 で
 * Qwen を消費者導線から外し、OS 内蔵の Apple Intelligence へ一本化した
 * （`llama-agent-model-provider.ts` / `configured-agent-model-provider.ts` 等の
 * 実装は再導入口として残置し、この Composition からは呼ばない）。
 *
 * Apple Intelligence が使えない端末・iOS バージョンでは、Native 側
 * （`modules/apple-foundation-models/`）が型付き `AgentModelProviderError`
 * （LOAD_ERROR）を投げるだけでよい。「使えるなら最優先、使えなければ Rules」は
 * 新しい Availability 事前チェックを増設せず、既存の Fallback-once
 * （`runProviderOnce` / `attemptProviderBeforeDeadline`）がそのまま実現する。
 */
export function createNativeAgentModelProvider(
  composition: NativeAgentModelProviderComposition
): AgentModelProvider {
  if (composition.runningInExpoGo) return RULES_MODEL_PROVIDER;
  const port = createAppleFoundationModelsCompletionPort(
    composition.appleFoundationModels
  );
  const provider = createSafetyBoundLocalModelProvider(port);
  return registerConversationExampleGenerator(
    provider,
    createConversationExampleGenerator(port)
  );
}
