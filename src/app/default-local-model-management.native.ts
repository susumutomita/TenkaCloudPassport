import { isRunningInExpoGo } from 'expo';
import { createDeviceResourceTelemetry } from '../local-agent/device-resource-telemetry.native';
import {
  createExpoModelFileStore,
  pickGgufImportCandidate,
} from '../local-agent/expo-model-file-store.native';
import { createLlamaAgentModelProvider } from '../local-agent/llama-agent-model-provider';
import { createLlamaModelInspector } from '../local-agent/llama-model-inspector.native';
import { loadLlamaModule } from '../local-agent/llama-module-loader.native';
import type { LocalModelManagementPort } from '../local-agent/local-model-management';
import { createModelBenchmarkRecorder } from '../local-agent/model-benchmark';
import { createLocalModelLifecycle } from '../local-agent/model-lifecycle';

function createNativeManagement(): LocalModelManagementPort {
  const telemetry = createDeviceResourceTelemetry();
  const lifecycle = createLocalModelLifecycle({
    fileStore: createExpoModelFileStore(),
    inspector: createLlamaModelInspector(),
    telemetry,
  });
  return {
    lifecycle,
    pickCandidate: pickGgufImportCandidate,
    createProvider(model, onBenchmarkWriteFailure) {
      const recorder = createModelBenchmarkRecorder({
        modelSha256: model.sha256,
        telemetry,
        appendReport: (report) => lifecycle.appendBenchmarkReport(report),
        onWriteFailure: onBenchmarkWriteFailure,
      });
      return createLlamaAgentModelProvider(
        {
          modelPath: model.privateUri,
          nCtx: model.configuration.nCtx,
          nGpuLayers: model.configuration.nGpuLayers,
          nPredict: model.configuration.nPredict,
        },
        loadLlamaModule,
        recorder
      );
    },
  };
}

/** Expo Go では Native module を要求せず、Development Build だけで管理 UI を有効化する。 */
export const DEFAULT_LOCAL_MODEL_MANAGEMENT = isRunningInExpoGo()
  ? null
  : createNativeManagement();
