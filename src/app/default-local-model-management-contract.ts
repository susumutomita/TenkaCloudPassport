import type { LocalModelManagementPort } from '../local-agent/local-model-management';
import type { LocalModelStoragePort } from './local-data-control';
import type { LocalModelMutationLeasePort } from './local-model-mutation-lease';

export interface DefaultLocalModelManagementComposition {
  readonly management: LocalModelManagementPort;
  readonly mutationLeases: LocalModelMutationLeasePort;
  readonly modelStorage: LocalModelStoragePort;
}
