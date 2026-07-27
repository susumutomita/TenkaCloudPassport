import { isRunningInExpoGo } from 'expo';
import { createConversationExampleGenerator } from '../local-agent/conversation-example-generator';
import { createDeviceResourceTelemetry } from '../local-agent/device-resource-telemetry.native';
import {
  createExpoModelFileStore,
  pickGgufImportCandidate,
} from '../local-agent/expo-model-file-store.native';
import { createExpoTrustedModelDownloadPort } from '../local-agent/expo-trusted-model-download.native';
import {
  createLlamaCompletionPort,
  type LocalModelExecutionLeasePort,
} from '../local-agent/llama-agent-model-provider';
import { createLlamaModelInspector } from '../local-agent/llama-model-inspector.native';
import { loadLlamaModule } from '../local-agent/llama-module-loader.native';
import { createModelBenchmarkRecorder } from '../local-agent/model-benchmark';
import {
  createLocalModelLifecycle,
  ModelLifecycleError,
} from '../local-agent/model-lifecycle';
import { createSafetyBoundLocalModelProvider } from '../local-agent/model-safety-boundary';
import {
  QWEN2_5_1_5B_INSTRUCT_Q4_K_M,
  TRUSTED_MODEL_CATALOG,
} from '../local-agent/trusted-model-catalog';
import { registerConversationExampleGenerator } from './conversation-example-capability';
import type { DefaultLocalModelManagementComposition } from './default-local-model-management-contract';
import { createLocalModelLifecycleStorageAdapter } from './local-model-lifecycle-storage-adapter';
import type { LocalModelManagementPort } from './local-model-management-port';
import type { LocalModelMutationLeasePort } from './local-model-mutation-lease';

function createNativeManagement(
  executionLeases: LocalModelExecutionLeasePort & LocalModelMutationLeasePort
): DefaultLocalModelManagementComposition {
  const telemetry = createDeviceResourceTelemetry();
  const fileStore = createExpoModelFileStore();
  const lifecycle = createLocalModelLifecycle({
    fileStore,
    inspector: createLlamaModelInspector(),
    telemetry,
    // ADR-0053 追補: 信頼済みダウンロード経由で import された Model
    // （catalog 上の pinned sha256 と一致するもの）は、activate 時も import 時
    // と同じネイティブ MD5 照合を使い、フル SHA-256 の二重計算を避ける。
    trustedModelMd5For: (sha256) =>
      TRUSTED_MODEL_CATALOG.find((source) => source.sha256 === sha256)?.md5 ??
      null,
  });
  const management: LocalModelManagementPort = {
    lifecycle,
    pickCandidate: pickGgufImportCandidate,
    createProvider(model, onBenchmarkWriteFailure) {
      const recorder = createModelBenchmarkRecorder({
        modelSha256: model.sha256,
        telemetry,
        appendReport: (report) => lifecycle.appendBenchmarkReport(report),
        onWriteFailure: onBenchmarkWriteFailure,
      });
      const completion = createLlamaCompletionPort(
        {
          modelPath: model.privateUri,
          nCtx: model.configuration.nCtx,
          nGpuLayers: model.configuration.nGpuLayers,
          nPredict: model.configuration.nPredict,
        },
        loadLlamaModule,
        executionLeases,
        recorder
      );
      const provider = createSafetyBoundLocalModelProvider(completion);
      return registerConversationExampleGenerator(
        provider,
        createConversationExampleGenerator(completion)
      );
    },
    trustedModelSource: QWEN2_5_1_5B_INSTRUCT_Q4_K_M,
    trustedModelAcquisition: {
      downloadPort: createExpoTrustedModelDownloadPort(),
      capacity: { availableDiskSpaceBytes: fileStore.availableDiskSpaceBytes },
    },
  };
  return {
    management,
    mutationLeases: {
      acquireMutation() {
        try {
          return executionLeases.acquireMutation();
        } catch {
          throw new ModelLifecycleError(
            'NATIVE_CONTEXT_UNAVAILABLE',
            'Native Context の解放を確認できないため Model を変更できません。'
          );
        }
      },
    },
    modelStorage: createLocalModelLifecycleStorageAdapter(lifecycle, fileStore),
  };
}

/** Expo Go では Native module を要求せず、Development Build だけで管理 UI を有効化する。 */
export function createDefaultLocalModelManagement(
  executionLeases: LocalModelExecutionLeasePort & LocalModelMutationLeasePort
): DefaultLocalModelManagementComposition | null {
  return isRunningInExpoGo() ? null : createNativeManagement(executionLeases);
}
