import { isRunningInExpoGo } from 'expo';
import { completeWithNativeAppleFoundationModels } from '../../modules/apple-foundation-models';
import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';
import { createNativeAgentModelProvider } from './native-agent-model-provider-composition';

/**
 * ADR-0057: Apple Intelligence 一本化後、Native Context の execution lease は
 * 使わない（`SystemLanguageModel` に llama.rn の Context のような排他 lifecycle
 * が無いため）。`App.tsx` からは従来どおり `LocalModelContextLeaseRegistry` が
 * 渡ってくる（Model Lifecycle / Diagnostics 側はこの PR の scope 外で継続利用する）
 * ため、引数の形は変えずに未使用のまま受ける。
 */
export function createDefaultAgentModelProvider(
  _modelContexts: LocalModelExecutionLeasePort
) {
  return createNativeAgentModelProvider({
    runningInExpoGo: isRunningInExpoGo(),
    appleFoundationModels: {
      complete: completeWithNativeAppleFoundationModels,
    },
  });
}
