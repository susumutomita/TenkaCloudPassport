import {
  type AgentModelProvider,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import { checkAppleFoundationModelsAvailability } from '../local-agent/apple-foundation-models-availability';
import {
  type AppleFoundationModelsNativePort,
  createAppleFoundationModelsCompletionPort,
} from '../local-agent/apple-foundation-models-provider';
import { createConversationExampleGenerator } from '../local-agent/conversation-example-generator';
import { createSafetyBoundLocalModelProvider } from '../local-agent/model-safety-boundary';
import { registerConversationExampleGenerator } from './conversation-example-capability';

export interface NativeAgentModelProviderComposition {
  readonly runningInExpoGo: boolean;
  readonly appleFoundationModels: AppleFoundationModelsNativePort;
}

/**
 * ADR-0057: Apple Intelligence（FoundationModels）を唯一の Primary Provider にする。
 *
 * ADR-0038（v1.0）はここを Rules 固定にしていた（オンデバイス LLM を消費者導線から
 * 外すため）。ADR-0043 は Qwen（GGUF ダウンロード型・llama.rn）を再導入したが、
 * v1.1.1〜v1.1.6 の実機不具合がほぼ全てダウンロード起因だったため、ADR-0057 で
 * Qwen を消費者導線から外し、OS 内蔵の Apple Intelligence へ一本化した
 * （`llama-agent-model-provider.ts` / `configured-agent-model-provider.ts` 等の
 * 実装は再導入口として残置し、この Composition からは呼ばない）。
 *
 * Apple Intelligence が使えない端末・iOS バージョンでは、Native 側
 * （`modules/apple-foundation-models/`）が型付き `AgentModelProviderError`
 * （LOAD_ERROR）を投げるだけでよい。この関数自体は Availability 事前チェックを
 * 行わず、Encounter ごとの Fallback-once（`runProviderOnce` /
 * `attemptProviderBeforeDeadline`）に委ねる。起動時 1 回だけ Availability を
 * 確定させたい呼び出し元（Follow-up F-983000）は、この関数を直接使わず
 * 下記 `resolveNativeAgentModelProviderAtStartup` を使う。
 */
export function createNativeAgentModelProvider(
  composition: NativeAgentModelProviderComposition
): AgentModelProvider {
  if (composition.runningInExpoGo) return RULES_MODEL_PROVIDER;
  const port = createAppleFoundationModelsCompletionPort(
    composition.appleFoundationModels
  );
  const provider = createSafetyBoundLocalModelProvider(port);
  return registerConversationExampleGenerator(
    provider,
    createConversationExampleGenerator(port)
  );
}

export interface AgentModelProviderStartupResult {
  readonly provider: AgentModelProvider;
  /**
   * Follow-up F-983000 / F-056000: 起動時に 1 回確定した「この端末は Apple
   * Intelligence を使えないか」を表す。Encounter ごとに揺れる旧
   * `onDeviceAiActive`（`conversationExampleGeneratorForProvider` の結果、
   * ADR-0058 で撤去済み）とは別物で、UI（会話画面の非対応端末向け案内）は
   * こちらだけを判定源にする。Web / Android / Expo Go も Native Module が無く
   * Availability が `unavailable` に丸まるため、これらのプラットフォームでも
   * `true` になる（意図した挙動。ADR-0058 参照）。`apple-intelligence-not-enabled`
   * / `model-not-ready` は同一セッション中に状態が変わりうるが、この値は
   * アプリ起動時に 1 回だけ確定し再判定しない（ADR-0058 Decision 3 の
   * code-reviewer 指摘、既知の制約）。
   */
  readonly appleIntelligenceUnavailable: boolean;
}

export interface AgentModelProviderStartupInput
  extends NativeAgentModelProviderComposition {
  /** Native `availability()` の生の戻り値を返す。テストでは差し替える。 */
  readonly checkAvailability: () => Promise<unknown>;
}

/**
 * `/simplify` 指摘（jscpd）: Apple Intelligence の Native Module 自体が無い
 * Platform（Web / Expo Go / bun test の既定 Composition）は、揃って
 * `{ provider: RULES_MODEL_PROVIDER, appleIntelligenceUnavailable: true }` を
 * 返すだけの薄い stub になる。この形を 1 箇所に集約し、
 * `default-agent-model-provider.{ts,web.ts}` はこれを呼ぶだけにする
 * （`resolveNativeAgentModelProviderAtStartup` 内の 2 分岐も同じ形を再利用する）。
 */
export function rulesOnlyAgentModelProviderStartupResult(): AgentModelProviderStartupResult {
  return { provider: RULES_MODEL_PROVIDER, appleIntelligenceUnavailable: true };
}

/**
 * Follow-up F-983000: 起動時に 1 回だけ Apple Intelligence の Availability を
 * 判定し、非対応端末では最初から `RULES_MODEL_PROVIDER`（`kind: 'rules'`）を
 * 返す。ADR-0057 の初版は「Availability 事前チェックを増設しない」判断だったが、
 * これは `agent-provider-session.ts` の `executeAgentProviderSession` が
 * `provider.kind === 'local-agent'` を条件に `local-started` イベントを
 * 発火する既存ロジックと組み合わさり、非対応端末では毎 Encounter で
 * Provider 状態通知（Local Model 読み込み中 → Rules へ切替）が一瞬表示される
 * 副作用があった（`docs/adr/0057-apple-intelligence-primary-provider.md` §4）。
 * ここで `provider.kind` を起動時に確定させることで、非対応端末は最初から
 * `rules` として振る舞い、この遷移自体が起きなくなる。
 *
 * Expo Go は Native Module が存在しないため `checkAvailability` を呼ばずに
 * 即座に確定する（`createNativeAgentModelProvider` の既存分岐と同じ理由）。
 */
export async function resolveNativeAgentModelProviderAtStartup(
  input: AgentModelProviderStartupInput
): Promise<AgentModelProviderStartupResult> {
  if (input.runningInExpoGo) {
    return rulesOnlyAgentModelProviderStartupResult();
  }
  const availability = await checkAppleFoundationModelsAvailability(
    input.checkAvailability
  );
  if (availability.status !== 'available') {
    return rulesOnlyAgentModelProviderStartupResult();
  }
  return {
    provider: createNativeAgentModelProvider({
      runningInExpoGo: false,
      appleFoundationModels: input.appleFoundationModels,
    }),
    appleIntelligenceUnavailable: false,
  };
}
