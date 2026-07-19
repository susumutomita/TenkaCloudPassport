import { describe, expect, it } from 'bun:test';
import {
  LocalModelConfigurationError,
  parseLocalModelConfiguration,
} from './local-model-configuration';

function expectConfigurationError(
  input: Parameters<typeof parseLocalModelConfiguration>[0],
  code: LocalModelConfigurationError['code']
): void {
  try {
    parseLocalModelConfiguration(input);
    throw new Error('LocalModelConfigurationError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalModelConfigurationError);
    if (error instanceof LocalModelConfigurationError) {
      expect(error.code).toBe(code);
    }
  }
}

const VALID_INPUT = {
  modelPath: 'file:///data/user/0/cloud.tenka.passport/model.gguf',
  nCtx: '2048',
  nGpuLayers: '32',
  nPredict: '96',
} as const;

describe('Local Model 設定境界', () => {
  it('端末内 GGUF Path と Resource 数値を検証済み設定へ変換する', () => {
    expect(parseLocalModelConfiguration(VALID_INPUT)).toEqual({
      modelPath: VALID_INPUT.modelPath,
      nCtx: 2048,
      nGpuLayers: 32,
      nPredict: 96,
    });

    expect(
      parseLocalModelConfiguration({
        ...VALID_INPUT,
        modelPath: '/var/mobile/Containers/Data/model.GGUF',
        nGpuLayers: '-1',
      })
    ).toEqual({
      modelPath: '/var/mobile/Containers/Data/model.GGUF',
      nCtx: 2048,
      nGpuLayers: -1,
      nPredict: 96,
    });
  });

  it('相対 Path・Network URL・非 GGUF・Query・NUL を拒否する', () => {
    for (const modelPath of [
      'model.gguf',
      'https://example.invalid/model.gguf',
      'file:///data/model.bin',
      'file:///data/model.gguf?token=value',
      'file:///data/model.gguf#fragment',
      'file:///data/model\u0000.gguf',
      'file:///data/model%00.gguf',
      'file:///data/model.gguf\0hidden',
    ]) {
      expectConfigurationError(
        { ...VALID_INPUT, modelPath },
        'INVALID_MODEL_PATH'
      );
    }
  });

  it('n_ctx の非整数と範囲外を拒否する', () => {
    for (const nCtx of ['255', '32769', '2048.5', 'NaN', '']) {
      expectConfigurationError({ ...VALID_INPUT, nCtx }, 'INVALID_N_CTX');
    }
  });

  it('GPU Layer 数の非整数と範囲外を拒否する', () => {
    for (const nGpuLayers of ['-2', '1025', '1.5', 'all', '']) {
      expectConfigurationError(
        { ...VALID_INPUT, nGpuLayers },
        'INVALID_GPU_LAYERS'
      );
    }
  });

  it('最大生成 Token 数の非整数と範囲外を拒否する', () => {
    for (const nPredict of ['0', '513', '8.5', 'many', '']) {
      expectConfigurationError(
        { ...VALID_INPUT, nPredict },
        'INVALID_N_PREDICT'
      );
    }
  });
});
