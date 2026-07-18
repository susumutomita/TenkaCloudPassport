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

/** Expo Go を常に Rules へ固定し、Development Build だけ設定済み Local Model を選ぶ。 */
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
