/** Development Build から注入する、Model 固有 ID を持たない端末内 GGUF 設定。 */
export interface LocalModelConfiguration {
  readonly modelPath: string;
  readonly nCtx: number;
  readonly nGpuLayers: number;
  readonly nPredict: number;
}

export interface LocalModelConfigurationInput {
  readonly modelPath: string;
  readonly nCtx: string;
  readonly nGpuLayers: string;
  readonly nPredict: string;
}

export type LocalModelConfigurationErrorCode =
  | 'INVALID_MODEL_PATH'
  | 'INVALID_N_CTX'
  | 'INVALID_GPU_LAYERS'
  | 'INVALID_N_PREDICT';

export class LocalModelConfigurationError extends Error {
  readonly code: LocalModelConfigurationErrorCode;

  constructor(code: LocalModelConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'LocalModelConfigurationError';
    this.code = code;
  }
}

function isLocalGgufPath(modelPath: string): boolean {
  const localAbsolutePath = modelPath.startsWith('/');
  const localFileUri = modelPath.startsWith('file:///');
  return (
    (localAbsolutePath || localFileUri) &&
    modelPath.toLowerCase().endsWith('.gguf') &&
    !modelPath.includes('\0') &&
    !modelPath.toLowerCase().includes('%00') &&
    !modelPath.includes('?') &&
    !modelPath.includes('#')
  );
}

function boundedInteger(
  value: string,
  minimum: number,
  maximum: number,
  code: Exclude<LocalModelConfigurationErrorCode, 'INVALID_MODEL_PATH'>,
  fieldName: string
): number {
  if (!/^-?\d+$/.test(value)) {
    throw new LocalModelConfigurationError(
      code,
      `${fieldName} は整数である必要があります。`
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new LocalModelConfigurationError(
      code,
      `${fieldName} が許可範囲外です。`
    );
  }
  return parsed;
}

/** Native API を呼ぶ前に、Path と全 Resource 数値を fail closed で検証する。 */
export function parseLocalModelConfiguration(
  input: LocalModelConfigurationInput
): LocalModelConfiguration {
  if (!isLocalGgufPath(input.modelPath)) {
    throw new LocalModelConfigurationError(
      'INVALID_MODEL_PATH',
      'Model Path は端末内の GGUF File である必要があります。'
    );
  }
  return {
    modelPath: input.modelPath,
    nCtx: boundedInteger(input.nCtx, 256, 32_768, 'INVALID_N_CTX', 'n_ctx'),
    nGpuLayers: boundedInteger(
      input.nGpuLayers,
      -1,
      1024,
      'INVALID_GPU_LAYERS',
      'GPU Layer 数'
    ),
    nPredict: boundedInteger(
      input.nPredict,
      1,
      512,
      'INVALID_N_PREDICT',
      '最大生成 Token 数'
    ),
  };
}
