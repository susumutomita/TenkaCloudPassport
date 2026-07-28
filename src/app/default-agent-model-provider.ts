import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';
import {
  type AgentModelProviderStartupResult,
  rulesOnlyAgentModelProviderStartupResult,
} from './native-agent-model-provider-composition';

/**
 * Bun Test 用の既定 Composition（Native Build は `.native.ts`、Web は `.web.ts` へ
 * 差し替える）。Follow-up F-983000: 戻り値の形（`Promise<AgentModelProviderStartupResult>`）を
 * Native / Web と揃える。
 */
export function createDefaultAgentModelProvider(
  _modelContexts: LocalModelExecutionLeasePort
): Promise<AgentModelProviderStartupResult> {
  return Promise.resolve(rulesOnlyAgentModelProviderStartupResult());
}
