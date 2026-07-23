import { describe, expect, it } from 'bun:test';
import {
  findTrustedModelSource,
  QWEN2_5_1_5B_INSTRUCT_Q4_K_M,
  TRUSTED_MODEL_CATALOG,
} from './trusted-model-catalog';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

describe('信頼済み Model カタログ（Issue 104 PR #132、モデル入手経路）', () => {
  it('Qwen2.5-1.5B-Instruct（Q4_K_M）の URL が Hugging Face の resolve/main 安定 URL である', () => {
    expect(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.url).toBe(
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
    );
    expect(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.url.startsWith('https://')).toBe(true);
  });

  it('期待 SHA-256 が小文字 64 桁 hex の形式である', () => {
    expect(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.sha256).toMatch(SHA256_PATTERN);
  });

  it('ライセンスが Apache-2.0 である（qwen-research ライセンスの 3B 版と混同しない、ADR-0037）', () => {
    expect(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.license).toBe('Apache-2.0');
  });

  it('サイズが正の整数バイト数である', () => {
    expect(Number.isSafeInteger(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.sizeBytes)).toBe(
      true
    );
    expect(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.sizeBytes).toBeGreaterThan(0);
  });

  it('カタログに Qwen2.5-1.5B-Instruct を含む', () => {
    expect(TRUSTED_MODEL_CATALOG).toContain(QWEN2_5_1_5B_INSTRUCT_Q4_K_M);
  });

  it('findTrustedModelSource は既知 id で該当エントリを返す', () => {
    expect(findTrustedModelSource(QWEN2_5_1_5B_INSTRUCT_Q4_K_M.id)).toBe(
      QWEN2_5_1_5B_INSTRUCT_Q4_K_M
    );
  });

  it('findTrustedModelSource は未知 id で null を返す', () => {
    expect(findTrustedModelSource('unknown-model-id')).toBeNull();
  });
});
