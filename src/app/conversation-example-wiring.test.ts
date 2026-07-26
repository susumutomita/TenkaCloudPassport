import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

function hookSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-conversation-agent-flow.ts');
}

function managedCompositionSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    'default-local-model-management.native.ts'
  );
}

function environmentCompositionSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    'native-agent-model-provider-composition.ts'
  );
}

function llamaSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    '../local-agent/llama-agent-model-provider.ts'
  );
}

describe('AI 会話例の一気通貫配線（Issue 155）', () => {
  it('Provider identity から optional Generator capability を取得する', async () => {
    const text = await hookSource();

    expectInOrder(text, [
      'const conversationExampleGenerator =',
      'conversationExampleGeneratorForProvider(provider)',
      'useConversationExample(conversationExampleGenerator)',
      'presentConversationAgentResult(result, {',
      'state: conversationExampleState',
      'onGenerate: generateConversationExample',
      'onCancel: cancelConversationExample',
    ]);
  });

  it('Local primary Bridge のときだけ会話例を prepare する', async () => {
    const text = await hookSource();

    expectInOrder(text, [
      "decision.kind !== 'bridge'",
      "outcome.settledBy === 'primary'",
      'conversationExampleGenerator !== null',
      'prepareConversationExample({',
      'bridgeReason: decision.reason',
      'bridgeOpener: decision.opener',
      'ownerProfileText: plan.input.ownerProfileText',
      'peerProfileText: plan.input.encounteredProfileText',
      'language: plan.input.language ?? locale',
    ]);
    const primaryGuard = text.slice(
      text.indexOf("outcome.settledBy === 'primary'"),
      text.indexOf(
        'setResult({',
        text.indexOf("outcome.settledBy === 'primary'")
      )
    );
    expect(primaryGuard).toContain('prepareConversationExample({');
    expect(primaryGuard).toContain('hideConversationExample();');
  });

  it('Prompt 入力へ相手名や連絡先 field を配線しない', async () => {
    const text = await hookSource();
    const prepareStart = text.indexOf('prepareConversationExample({');
    const prepareEnd = text.indexOf('});', prepareStart);
    const preparation = text.slice(prepareStart, prepareEnd);

    expect(prepareStart).toBeGreaterThan(-1);
    expect(preparation).not.toContain('partnerNames');
    expect(preparation).not.toContain('name:');
    expect(preparation).not.toContain('email');
    expect(preparation).not.toContain('phone');
    expect(preparation).not.toContain('link');
  });

  it('画面離脱・相手追加削除・Reset・再実行で会話例を破棄する', async () => {
    const text = await hookSource();
    const ranges = [
      ['const resetTransientState', 'const open'],
      ['const addPeer', 'const onSubmitPasteInput'],
      ['const onRemovePeer', 'const onReset'],
      ['const onReset', 'const onStart'],
      ['const onStart', 'const presentedResult'],
    ] as const;

    expect(text.match(/hideConversationExample\(\)/g)?.length).toBeGreaterThan(
      5
    );
    for (const [startMarker, endMarker] of ranges) {
      const start = text.indexOf(startMarker);
      const end = text.indexOf(endMarker, start + startMarker.length);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      expect(text.slice(start, end)).toContain('hideConversationExample();');
    }
  });

  it('管理 UI の Native Composition は Bridge と会話例で同じ Completion Port を共有する', async () => {
    const text = await managedCompositionSource();

    expectInOrder(text, [
      'const completion = createLlamaCompletionPort(',
      'const provider = createSafetyBoundLocalModelProvider(completion);',
      'registerConversationExampleGenerator(',
      'provider,',
      'createConversationExampleGenerator(completion)',
    ]);
  });

  it('環境変数経由の Development Build も同じ Completion Port に capability を登録する', async () => {
    const text = await environmentCompositionSource();

    expectInOrder(text, [
      'const completionPort = createConfiguredLocalModelCompletionPort(',
      'const provider = createSafetyBoundLocalModelProvider(completionPort);',
      'registerConversationExampleGenerator(',
      'provider,',
      'createConversationExampleGenerator(completionPort)',
    ]);
  });

  it('llama.rn Adapter は通常 Provider の既定値と会話例の Request override を両立する', async () => {
    const text = await llamaSource();

    expectInOrder(text, [
      "const generation = 'generation' in request",
      'n_predict: generation?.nPredict ?? configuration.nPredict',
      'temperature: generation?.temperature ?? 0',
      'schema: request.responseFormat.schema',
    ]);
  });
});
