import type { AgentModelProvider } from '../domain/agent-model-provider';
import type { ImportedLocalModel } from '../local-agent/local-model-manifest';
import type {
  LocalModelLifecycle,
  ModelImportCandidate,
} from '../local-agent/model-lifecycle';
import type { TrustedModelSource } from '../local-agent/trusted-model-catalog';
import type { TrustedModelAcquisitionDependencies } from '../local-agent/trusted-model-download';

/** App Composition が GGUF lifecycle と安全化済み Provider の生成を束ねる。 */
export interface LocalModelManagementPort {
  readonly lifecycle: LocalModelLifecycle;
  readonly pickCandidate: () => Promise<ModelImportCandidate>;
  readonly createProvider: (
    model: ImportedLocalModel,
    onBenchmarkWriteFailure: () => void
  ) => AgentModelProvider;
  /**
   * Follow-up F-FDRGS4: Settings の「オンデバイス AI を有効化」ボタンが使う
   * 信頼済みダウンロード先の Model と Port。Document Picker 経由の
   * `pickCandidate` とは別の、通常ユーザー向け入手経路。
   */
  readonly trustedModelSource: TrustedModelSource;
  readonly trustedModelAcquisition: TrustedModelAcquisitionDependencies;
}
