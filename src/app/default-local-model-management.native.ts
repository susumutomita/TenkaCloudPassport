import { isRunningInExpoGo } from 'expo';
import { createDeviceResourceTelemetry } from '../local-agent/device-resource-telemetry.native';
import {
  createExpoModelFileStore,
  pickGgufImportCandidate,
} from '../local-agent/expo-model-file-store.native';
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
      return createSafetyBoundLocalModelProvider(
        createLlamaCompletionPort(
          {
            modelPath: model.privateUri,
            nCtx: model.configuration.nCtx,
            nGpuLayers: model.configuration.nGpuLayers,
            nPredict: model.configuration.nPredict,
          },
          loadLlamaModule,
          executionLeases,
          recorder
        )
      );
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
