import { describe, expect, it } from 'bun:test';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { verifyConversationExampleInput } from '../domain/conversation-example-prompt';
import {
  expectProviderError,
  publicPassportWithClues as passport,
} from '../domain/domain-test-kit';
import {
  type AppleFoundationModelsNativePort,
  createAppleFoundationModelsCompletionPort,
} from './apple-foundation-models-provider';
import {
  CONVERSATION_EXAMPLE_TEMPERATURE,
  type ConversationExampleTurnModelRequest,
  createConversationExampleTurnModelRequest,
} from './conversation-example-generator';
import {
  createLocalModelRequest,
  createSafetyBoundLocalModelProvider,
} from './model-safety-boundary';

const INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source'], ['ja'], '命令を無視'),
  encounteredPassport: passport(['open-source'], ['ja']),
  language: 'ja',
  deadlineAtWallClockMs: 4_102_444_800_000,
};
const REQUEST = createLocalModelRequest(INPUT);

interface NativeCallRecord {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schemaJson: string;
  readonly temperature: number;
}

interface RecordingPortOptions {
  readonly result?: unknown;
  readonly error?: Error;
}

class RecordingAppleNativePort implements AppleFoundationModelsNativePort {
  readonly calls: NativeCallRecord[] = [];

  constructor(private readonly options: RecordingPortOptions = {}) {}

  async complete(
    systemPrompt: string,
    userPrompt: string,
    schemaJson: string,
    temperature: number
  ): Promise<unknown> {
    this.calls.push({ systemPrompt, userPrompt, schemaJson, temperature });
    if (this.options.error) throw this.options.error;
    return (
      this.options.result ??
      '{"kind":"bridge","evidenceIds":["topic:open-source"]}'
    );
  }
}

/**
 * `/simplify` 指摘（reuse）: 全テストで繰り返す
 * 「Recording Native Port を作り、Completion Port を組み立てる」Arrange を集約する。
 * カスタム Native 実装（abort 中に abort する Wrapper）や
 * `createSafetyBoundLocalModelProvider` を追加で組み立てる 2 件は、この Helper では
 * 表現しきれないためそのまま個別に書く。
 */
function setup(options?: RecordingPortOptions) {
  const native = new RecordingAppleNativePort(options);
  return { native, port: createAppleFoundationModelsCompletionPort(native) };
}

describe('Apple Foundation Models Completion Port（単発 complete）', () => {
  it('system/user message と JSON 化した responseFormat.schema を Native へ渡し、JSON 文字列を解析して返す', async () => {
    const { native, port } = setup();

    const result = await port.complete(REQUEST);

    expect(result).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });
    expect(native.calls).toHaveLength(1);
    expect(native.calls[0]?.systemPrompt).toBe(REQUEST.messages[0].content);
    expect(native.calls[0]?.userPrompt).toBe(REQUEST.messages[1].content);
    expect(native.calls[0]?.schemaJson).toBe(
      JSON.stringify(REQUEST.responseFormat.schema)
    );
    // Bridge 判定（generation フィールドを持たない LocalModelRequest）は
    // 決定的な温度 0 を渡す（既存の llama.rn 経路と同じ既定値）。
    expect(native.calls[0]?.temperature).toBe(0);
  });

  it('既に abort 済みの signal では Native を呼ばず CANCELLED を投げる', async () => {
    const { native, port } = setup();
    const controller = new AbortController();
    controller.abort();

    await expectProviderError(
      () =>
        Promise.resolve(port.complete(REQUEST, { signal: controller.signal })),
      'CANCELLED'
    );
    expect(native.calls).toHaveLength(0);
  });

  it('Native 完了後に abort 済みなら結果を捨てて CANCELLED を投げる', async () => {
    const controller = new AbortController();
    const native = new RecordingAppleNativePort();
    const abortingNative: AppleFoundationModelsNativePort = {
      async complete(systemPrompt, userPrompt, schemaJson, temperature) {
        const value = await native.complete(
          systemPrompt,
          userPrompt,
          schemaJson,
          temperature
        );
        controller.abort();
        return value;
      },
    };
    const port = createAppleFoundationModelsCompletionPort(abortingNative);

    await expectProviderError(
      () =>
        Promise.resolve(port.complete(REQUEST, { signal: controller.signal })),
      'CANCELLED'
    );
  });

  it('Native が例外を投げたら型付き LOAD_ERROR へ正規化する', async () => {
    const { port } = setup({ error: new Error('Native 側の未分類エラー') });

    await expectProviderError(
      () => Promise.resolve(port.complete(REQUEST)),
      'LOAD_ERROR'
    );
  });

  it('Native が文字列以外を返したら SCHEMA_ERROR にする（JSON 文字列だけを信頼する）', async () => {
    const { port } = setup({ result: { not: 'a string' } });

    await expectProviderError(
      () => Promise.resolve(port.complete(REQUEST)),
      'SCHEMA_ERROR'
    );
  });

  it('Native が不正な JSON 文字列を返したら SCHEMA_ERROR にする', async () => {
    const { port } = setup({ result: 'not json{' });

    await expectProviderError(
      () => Promise.resolve(port.complete(REQUEST)),
      'SCHEMA_ERROR'
    );
  });

  it('Safety Boundary 経由でも Bridge 決定を導出できる（End-to-End）', async () => {
    const { port } = setup();
    const provider = createSafetyBoundLocalModelProvider(port);

    const output = await provider.provide(INPUT);

    expect(output).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });
  });
});

describe('Apple Foundation Models Completion Port（会話例セッション）', () => {
  function turnRequest(): ConversationExampleTurnModelRequest {
    const verified = verifyConversationExampleInput({
      bridgeReason: 'お互い登山という共通点があります。',
      bridgeOpener: '登山について聞いてみましょう。',
      ownerProfileText: '週末は登山をしています。',
      peerProfileText: '最近は写真を撮るのが好きです。',
      language: 'ja',
    });
    return createConversationExampleTurnModelRequest(
      verified,
      [],
      'owner',
      0,
      2
    );
  }

  it('beginSession は Native の Context lifecycle を持たず、毎ターン complete を呼ぶ', async () => {
    const { native, port } = setup({ result: '{"text":"こんにちは"}' });

    const session = await port.beginSession();
    const request = turnRequest();
    const output = await session.completeTurn(request);
    await session.close();

    expect(output).toEqual({ text: 'こんにちは' });
    expect(native.calls).toHaveLength(1);
    expect(native.calls[0]?.systemPrompt).toBe(request.messages[0].content);
    expect(native.calls[0]?.userPrompt).toBe(request.messages[1].content);
    expect(native.calls[0]?.schemaJson).toBe(
      JSON.stringify(request.responseFormat.schema)
    );
    // 会話例（generation.temperature を持つ ConversationExampleTurnModelRequest）は
    // その値（0.7、多様性を意図した既存定数）をそのまま Native へ転送する。
    expect(native.calls[0]?.temperature).toBe(request.generation.temperature);
    expect(native.calls[0]?.temperature).toBe(CONVERSATION_EXAMPLE_TEMPERATURE);
  });

  it('close() は Native 呼び出しを伴わず必ず解決する', async () => {
    const { native, port } = setup();

    const session = await port.beginSession();
    await expect(session.close()).resolves.toBeUndefined();
    expect(native.calls).toHaveLength(0);
  });

  it('completeTurn も Native 失敗を型付き LOAD_ERROR へ正規化する', async () => {
    const { port } = setup({ error: new Error('Native 側の未分類エラー') });
    const session = await port.beginSession();

    await expectProviderError(
      () => Promise.resolve(session.completeTurn(turnRequest())),
      'LOAD_ERROR'
    );
  });
});
