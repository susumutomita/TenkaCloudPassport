import { RULES_MODEL_PROVIDER } from '../domain/agent-model-provider';
import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';

/** Web module graph は `llama.rn` を参照せず、常に Rules Provider を使う。 */
export function createDefaultAgentModelProvider(
  _modelContexts: LocalModelExecutionLeasePort
) {
  return RULES_MODEL_PROVIDER;
}
