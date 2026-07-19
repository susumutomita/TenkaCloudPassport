import { AgentModelProviderError } from '../domain/agent-model-provider';
import {
  createLlamaCompletionPort,
  type LlamaModuleLoader,
  type LocalModelExecutionLeasePort,
} from './llama-agent-model-provider';
import { parseLocalModelConfiguration } from './local-model-configuration';
import type { LocalModelCompletionPort } from './model-safety-boundary';

export interface LocalModelEnvironment {
  readonly modelPath?: string;
  readonly nCtx?: string;
  readonly nGpuLayers?: string;
  readonly nPredict?: string;
}

const DEFAULT_N_CTX = '2048';
const DEFAULT_N_GPU_LAYERS = '0';
const DEFAULT_N_PREDICT = '96';

function unavailableCompletionPort(): LocalModelCompletionPort {
  return {
    complete() {
      throw new AgentModelProviderError(
        'LOAD_ERROR',
        'Local Model の設定を読み込めませんでした。'
      );
    },
  };
}

/** Model 未設定を正常な Rules 状態、不正設定を Fallback 可能な Local Load Error として構成する。 */
export function createConfiguredLocalModelCompletionPort(
  environment: LocalModelEnvironment,
  loadModule: LlamaModuleLoader,
  executionLeases: LocalModelExecutionLeasePort
): LocalModelCompletionPort | undefined {
  if (
    environment.modelPath === undefined ||
    environment.modelPath.length === 0
  ) {
    return undefined;
  }
  try {
    const configuration = parseLocalModelConfiguration({
      modelPath: environment.modelPath,
      nCtx: environment.nCtx ?? DEFAULT_N_CTX,
      nGpuLayers: environment.nGpuLayers ?? DEFAULT_N_GPU_LAYERS,
      nPredict: environment.nPredict ?? DEFAULT_N_PREDICT,
    });
    return createLlamaCompletionPort(
      configuration,
      loadModule,
      executionLeases
    );
  } catch {
    return unavailableCompletionPort();
  }
}
