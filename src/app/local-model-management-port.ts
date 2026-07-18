import type { AgentModelProvider } from '../domain/agent-model-provider';
import type { ImportedLocalModel } from '../local-agent/local-model-manifest';
import type {
  LocalModelLifecycle,
  ModelImportCandidate,
} from '../local-agent/model-lifecycle';

/** App Composition が GGUF lifecycle と安全化済み Provider の生成を束ねる。 */
export interface LocalModelManagementPort {
  readonly lifecycle: LocalModelLifecycle;
  readonly pickCandidate: () => Promise<ModelImportCandidate>;
  readonly createProvider: (
    model: ImportedLocalModel,
    onBenchmarkWriteFailure: () => void
  ) => AgentModelProvider;
}
