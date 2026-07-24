import {
  type AgentModelProvider,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import type { LocalModelEnvironment } from '../local-agent/configured-agent-model-provider';
import type {
  LlamaModuleLoader,
  LocalModelExecutionLeasePort,
} from '../local-agent/llama-agent-model-provider';

export interface NativeAgentModelProviderComposition {
  readonly runningInExpoGo: boolean;
  readonly environment: LocalModelEnvironment;
  readonly loadModule: LlamaModuleLoader;
  readonly modelContexts: LocalModelExecutionLeasePort;
}

/**
 * v1.0（ADR-0038）: オンデバイス LLM（Qwen ダウンロード + llama.rn 推論）を消費者から
 * 無効化する。owner の実機（TestFlight）検証で、ダウンロードが 100% で完了せず
 * 固まる・未完了のまま会話 Agent を開くと native crash する（JS の Error Boundary で
 * 捕まらない）の 2 件が確認され、呼び出し元をこのセッションでは実機テストできない
 * ため、Expo Go / Development Build のどちらでも常に Rules Provider を返し、
 * `createConfiguredLocalModelCompletionPort`（Local LLM Completion Port の構築）を
 * 一切呼ばない。これにより llama.rn の実 module load も発生しない。
 * `composition` の各 field（Development Build 判定・Model 環境変数・Native Module
 * Loader・Execution Lease）は v1.1 で実機テストして再有効化するときにそのまま使う
 * 想定で、意図的に型・引数は変えていない。
 */
export function createNativeAgentModelProvider(
  _composition: NativeAgentModelProviderComposition
): AgentModelProvider {
  return RULES_MODEL_PROVIDER;
}
