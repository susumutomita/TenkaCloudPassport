import type { LanguageCode } from './clue-catalog';
import {
  containsContactLikeText,
  containsForbiddenTextUnicode,
  isSingleLineText,
} from './text-content-guards';
import {
  arrayValue,
  assertOneOf,
  SchemaValidationError,
  strictRecord,
  stringValue,
} from '../protocol/validation';

/** Issue 155: LINE 風 UI へ表示する会話例の bounded output contract。 */
export const CONVERSATION_EXAMPLE_MIN_TURNS = 2;
export const CONVERSATION_EXAMPLE_DEFAULT_TURNS = 4;
export const CONVERSATION_EXAMPLE_MAX_TURNS = 6;
export const CONVERSATION_EXAMPLE_TURN_MAX_CHARS = 80;

export const CONVERSATION_EXAMPLE_SPEAKERS = ['owner', 'peer'] as const;
export type ConversationExampleSpeaker =
  (typeof CONVERSATION_EXAMPLE_SPEAKERS)[number];

export interface ConversationExampleTurn {
  readonly speaker: ConversationExampleSpeaker;
  readonly text: string;
}

export interface ConversationExample {
  readonly turns: readonly ConversationExampleTurn[];
}

/**
 * 生成プロンプトへ渡せる全情報。氏名・連絡先・URL を表す field 自体を持たない。
 * `ownerProfileText` / `peerProfileText` は title / organization / selfIntro の連結文だけで、
 * Prompt Builder が連絡先らしい内容と上限を再検証してから Native 境界へ渡す。
 */
export interface ConversationExampleInput {
  readonly bridgeReason: string;
  readonly bridgeOpener: string;
  readonly ownerProfileText?: string | undefined;
  readonly peerProfileText?: string | undefined;
  readonly language: LanguageCode;
}

export interface ConversationExampleGeneratorOptions {
  readonly signal?: AbortSignal;
}

export interface ConversationExampleGenerator {
  readonly generate: (
    input: ConversationExampleInput,
    options?: ConversationExampleGeneratorOptions
  ) => Promise<ConversationExample>;
}

export type ConversationExampleErrorCode = 'INVALID_INPUT' | 'INVALID_OUTPUT';

export class ConversationExampleError extends Error {
  readonly code: ConversationExampleErrorCode;

  constructor(code: ConversationExampleErrorCode, message: string) {
    super(message);
    this.name = 'ConversationExampleError';
    this.code = code;
  }
}

function invalidOutput(message: string): never {
  throw new ConversationExampleError('INVALID_OUTPUT', message);
}

function parseTurn(
  value: unknown,
  index: number
): ConversationExampleTurn {
  const path = `$.turns[${index}]`;
  const record = strictRecord(value, path, ['speaker', 'text'] as const);
  const speaker = assertOneOf(
    record.speaker,
    CONVERSATION_EXAMPLE_SPEAKERS,
    `${path}.speaker`
  );
  const expectedSpeaker: ConversationExampleSpeaker =
    index % 2 === 0 ? 'owner' : 'peer';
  if (speaker !== expectedSpeaker) {
    return invalidOutput('会話例は owner 開始で交互に話す必要があります。');
  }

  const text = stringValue(
    record.text,
    `${path}.text`,
    CONVERSATION_EXAMPLE_TURN_MAX_CHARS
  ).trim();
  if (text.length === 0) {
    return invalidOutput('会話例の本文は空にできません。');
  }
  if (!isSingleLineText(text) || containsForbiddenTextUnicode(text)) {
    return invalidOutput('会話例の本文に表示できない文字が含まれています。');
  }
  if (containsContactLikeText(text)) {
    return invalidOutput('会話例の本文に連絡先らしい内容が含まれています。');
  }
  return { speaker, text };
}

function parseConversationExampleUnchecked(value: unknown): ConversationExample {
  const record = strictRecord(value, '$', ['turns'] as const);
  const turns = arrayValue(
    record.turns,
    '$.turns',
    CONVERSATION_EXAMPLE_MIN_TURNS,
    CONVERSATION_EXAMPLE_MAX_TURNS
  );
  return { turns: turns.map(parseTurn) };
}

/**
 * Native 境界から来る unknown を、追加 field も許さない fail-closed contract で検証する。
 * 共通 Schema Validator の詳細は UI へ漏らさず、この機能専用の閉じた Error へ正規化する。
 */
export function parseConversationExample(value: unknown): ConversationExample {
  try {
    return parseConversationExampleUnchecked(value);
  } catch (error: unknown) {
    if (error instanceof ConversationExampleError) throw error;
    if (error instanceof SchemaValidationError) {
      throw new ConversationExampleError(
        'INVALID_OUTPUT',
        '会話例の構造化 Output を安全に検証できませんでした。'
      );
    }
    throw error;
  }
}
