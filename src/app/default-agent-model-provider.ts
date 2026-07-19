import { RULES_MODEL_PROVIDER } from '../domain/agent-model-provider';
import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';

/** Bun Test / Expo Go の既定 Composition。Native Build だけが `.native.ts` へ差し替える。 */
export function createDefaultAgentModelProvider(
  _modelContexts: LocalModelExecutionLeasePort
) {
  return RULES_MODEL_PROVIDER;
}
