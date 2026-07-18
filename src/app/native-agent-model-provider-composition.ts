import {
  type AgentModelProvider,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import {
  createConfiguredNativeAgentModelProvider,
  type LocalModelEnvironment,
} from '../local-agent/configured-agent-model-provider';
import type { LlamaModuleLoader } from '../local-agent/llama-agent-model-provider';

export interface NativeAgentModelProviderComposition {
  readonly runningInExpoGo: boolean;
  readonly environment: LocalModelEnvironment;
  readonly loadModule: LlamaModuleLoader;
}

/** Expo Go を常に Rules へ固定し、Development Build だけ設定済み Local Model を選ぶ。 */
export function createNativeAgentModelProvider(
  composition: NativeAgentModelProviderComposition
): AgentModelProvider {
  if (composition.runningInExpoGo) return RULES_MODEL_PROVIDER;
  return createConfiguredNativeAgentModelProvider(
    composition.environment,
    composition.loadModule
  );
}
