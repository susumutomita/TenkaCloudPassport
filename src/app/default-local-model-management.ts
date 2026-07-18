import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';
import type { DefaultLocalModelManagementComposition } from './default-local-model-management-contract';
import type { LocalModelMutationLeasePort } from './local-model-mutation-lease';

/** Web / Bun Test / Expo Go では Rules Provider のまま Model 管理を表示しない。 */
export function createDefaultLocalModelManagement(
  _executionLeases: LocalModelExecutionLeasePort & LocalModelMutationLeasePort
): DefaultLocalModelManagementComposition | null {
  return null;
}
