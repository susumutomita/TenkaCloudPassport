import { describe, expect, it } from 'bun:test';
import {
  createLocalAgentProviderCapability,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import type { ConversationExampleGenerator } from '../domain/conversation-example';
import {
  conversationExampleGeneratorForProvider,
  registerConversationExampleGenerator,
} from './conversation-example-capability';

const GENERATOR: ConversationExampleGenerator = {
  async generate() {
    return {
      turns: [
        { speaker: 'owner', text: 'こんにちは' },
        { speaker: 'peer', text: 'こんにちは' },
      ],
    };
  },
};

describe('会話例 Generator capability（Local Provider identity だけに付与）', () => {
  it('未登録の Local Provider は会話例を公開しない', () => {
    const provider = createLocalAgentProviderCapability(() => ({
      kind: 'no-signal',
    }));

    expect(conversationExampleGeneratorForProvider(provider)).toBeNull();
  });

  it('登録済み Local Provider は同じ Generator identity を返す', () => {
    const provider = createLocalAgentProviderCapability(() => ({
      kind: 'no-signal',
    }));

    expect(registerConversationExampleGenerator(provider, GENERATOR)).toBe(
      provider
    );
    expect(conversationExampleGeneratorForProvider(provider)).toBe(GENERATOR);
  });

  it('Rules Provider への登録は明示的に拒否する', () => {
    expect(() =>
      registerConversationExampleGenerator(RULES_MODEL_PROVIDER, GENERATOR)
    ).toThrow(TypeError);
    expect(
      conversationExampleGeneratorForProvider(RULES_MODEL_PROVIDER)
    ).toBeNull();
  });
});
