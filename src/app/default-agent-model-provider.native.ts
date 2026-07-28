import { isRunningInExpoGo } from 'expo';
import {
  completeWithNativeAppleFoundationModels,
  getNativeAppleFoundationModelsAvailability,
} from '../../modules/apple-foundation-models';
import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';
import {
  type AgentModelProviderStartupResult,
  resolveNativeAgentModelProviderAtStartup,
} from './native-agent-model-provider-composition';

/**
 * ADR-0057: Apple Intelligence 一本化後、Native Context の execution lease は
 * 使わない（`SystemLanguageModel` に llama.rn の Context のような排他 lifecycle
 * が無いため）。`App.tsx` からは従来どおり `LocalModelContextLeaseRegistry` が
 * 渡ってくる（Model Lifecycle / Diagnostics 側はこの PR の scope 外で継続利用する）
 * ため、引数の形は変えずに未使用のまま受ける。
 *
 * Follow-up F-983000: 起動時に 1 回だけ Apple Intelligence の Availability を
 * 判定するため、戻り値は Promise になった（`App.tsx` は解決するまで
 * `PassportApp` をマウントしない）。判定・組み立ての実体は
 * `resolveNativeAgentModelProviderAtStartup`（`native-agent-model-provider-composition.ts`）
 * に集約し、この関数は Native Module の実引数を渡すだけの薄いラッパーに留める。
 */
export function createDefaultAgentModelProvider(
  _modelContexts: LocalModelExecutionLeasePort
): Promise<AgentModelProviderStartupResult> {
  return resolveNativeAgentModelProviderAtStartup({
    runningInExpoGo: isRunningInExpoGo(),
    appleFoundationModels: {
      complete: completeWithNativeAppleFoundationModels,
    },
    checkAvailability: getNativeAppleFoundationModelsAvailability,
  });
}
