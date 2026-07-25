import {
  type AgentModelProvider,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import {
  createConfiguredLocalModelCompletionPort,
  type LocalModelEnvironment,
} from '../local-agent/configured-agent-model-provider';
import type {
  LlamaModuleLoader,
  LocalModelExecutionLeasePort,
} from '../local-agent/llama-agent-model-provider';
import { createSafetyBoundLocalModelProvider } from '../local-agent/model-safety-boundary';

export interface NativeAgentModelProviderComposition {
  readonly runningInExpoGo: boolean;
  readonly environment: LocalModelEnvironment;
  readonly loadModule: LlamaModuleLoader;
  readonly modelContexts: LocalModelExecutionLeasePort;
}

/**
 * Expo Go を常に Rules へ固定し、Development Build だけ設定済み Local Model を選ぶ。
 *
 * ADR-0038（v1.0）はここを Rules 固定にしていた。オンデバイス LLM を消費者導線から
 * 外すためだったが、その状態では会話エージェントの「共通点」がカタログ checkbox の
 * 共通集合そのものになり、エージェントと呼べる実体が無かった（Issue 147）。
 * ADR-0043 でこの 1 点を supersede し、Model が実際に用意されている端末では
 * Local Model Completion Port を使う。Model が未設定なら従来どおり Rules を返し、
 * 実行時の Load Error / Timeout / Schema Error は `runProviderOnce` の
 * Fallback-once が Rules へ倒す（`provider-fallback.ts`）。
 */
export function createNativeAgentModelProvider(
  composition: NativeAgentModelProviderComposition
): AgentModelProvider {
  if (composition.runningInExpoGo) return RULES_MODEL_PROVIDER;
  const completionPort = createConfiguredLocalModelCompletionPort(
    composition.environment,
    composition.loadModule,
    composition.modelContexts
  );
  return completionPort
    ? createSafetyBoundLocalModelProvider(completionPort)
    : RULES_MODEL_PROVIDER;
}
