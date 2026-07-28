import type { LocalModelExecutionLeasePort } from '../local-agent/llama-agent-model-provider';
import {
  type AgentModelProviderStartupResult,
  rulesOnlyAgentModelProviderStartupResult,
} from './native-agent-model-provider-composition';

/**
 * Web module graph は `llama.rn` を参照せず、常に Rules Provider を使う。
 * Follow-up F-983000: Native 版と戻り値の形（`Promise<AgentModelProviderStartupResult>`）を
 * 揃える。Web に Apple Intelligence の Native Module は無いため
 * `appleIntelligenceUnavailable` は常に `true`（会話画面は非対応端末向けの
 * 案内を表示する。Web も実際に Apple Intelligence を使えない端末なので、この
 * 表示は事実と一致する）。
 */
export function createDefaultAgentModelProvider(
  _modelContexts: LocalModelExecutionLeasePort
): Promise<AgentModelProviderStartupResult> {
  return Promise.resolve(rulesOnlyAgentModelProviderStartupResult());
}
