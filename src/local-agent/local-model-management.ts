import type { AgentModelProvider } from '../domain/agent-model-provider';
import type { ImportedLocalModel } from './local-model-manifest';
import type {
  LocalModelLifecycle,
  ModelImportCandidate,
} from './model-lifecycle';

export interface LocalModelManagementPort {
  readonly lifecycle: LocalModelLifecycle;
  readonly pickCandidate: () => Promise<ModelImportCandidate>;
  readonly createProvider: (
    model: ImportedLocalModel,
    onBenchmarkWriteFailure: () => void
  ) => AgentModelProvider;
}
