import type { AgentModelProvider } from '../domain/agent-model-provider';
import type { ConversationExampleGenerator } from '../domain/conversation-example';

/**
 * AgentModelProvider は Domain 側で freeze / brand されているため optional method を足さない。
 * Native Composition Root だけが、同じ Provider identity に対応する会話例 Generator を
 * WeakMap へ登録する。Prompt や生成結果は一切保持しない。
 */
const GENERATORS = new WeakMap<object, ConversationExampleGenerator>();

export function registerConversationExampleGenerator<
  Provider extends AgentModelProvider,
>(provider: Provider, generator: ConversationExampleGenerator): Provider {
  if (provider.kind !== 'local-agent') {
    throw new TypeError('Rules Provider へ会話例 Generator は登録できません。');
  }
  GENERATORS.set(provider, generator);
  return provider;
}

/** Rules / Web / Model 未導入 Provider は `null` となり、UI は feature 自体を隠す。 */
export function conversationExampleGeneratorForProvider(
  provider: AgentModelProvider
): ConversationExampleGenerator | null {
  return GENERATORS.get(provider) ?? null;
}
