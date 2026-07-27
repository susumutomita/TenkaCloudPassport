import { strictRecord, stringValue } from '../protocol/validation';
import type { LanguageCode } from './clue-catalog';
import {
  containsContactLikeText,
  containsForbiddenTextUnicode,
  isSingleLineText,
} from './text-content-guards';

/** Issue 155: LINE 風 UI へ表示する会話例の bounded output contract。 */
export const CONVERSATION_EXAMPLE_DEFAULT_TURNS = 4;
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
  /**
   * Issue 169: ターン毎生成へ移行し、確定したターンを 1 件ずつ画面へ即時公開する。
   * `generate` は従来どおり全ターン確定後の `ConversationExample` へ解決するが、
   * 呼び出し側（`conversation-example-flow.ts`）はこの callback で確定順を追い、
   * 途中失敗・キャンセルでも確定済みターンを残せるようにする。
   *
   * `isFinalTurn`（レビュー指摘の修正）: このターンが最後の 1 件かどうかを、ターン数を
   * 知る生成側（`local-agent/conversation-example-generator.ts`）から呼び出し側へ伝える。
   * 最終ターン確定後は Native Context 解放（`session.close()`）待ちの間があっても、
   * 存在しない次の話者の typing indicator を画面に出さないために使う。
   */
  readonly onTurn?: (
    turn: ConversationExampleTurn,
    isFinalTurn: boolean
  ) => void;
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

/** JSON.parse 由来の data property だけを許し、Getter や Symbol field を拒否する。 */
function strictDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  path: string,
  keys: Keys
): { [Key in Keys[number]]: unknown } {
  const record = strictRecord(value, path, keys);
  const objectValue = value as object;
  const ownKeys = Reflect.ownKeys(objectValue);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some(
      (key) =>
        typeof key !== 'string' || !keys.some((candidate) => candidate === key)
    )
  ) {
    return invalidOutput('会話例に未知の Field は指定できません。');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    ) {
      return invalidOutput('会話例には通常の JSON Field だけを指定できます。');
    }
  }
  return record;
}

/** ターン毎生成が使う `text` 単体の fail-closed 検証。 */
function verifiedTurnText(rawValue: unknown, path: string): string {
  const rawText = stringValue(
    rawValue,
    `${path}.text`,
    CONVERSATION_EXAMPLE_TURN_MAX_CHARS
  );
  if (!isSingleLineText(rawText) || containsForbiddenTextUnicode(rawText)) {
    return invalidOutput('会話例の本文に表示できない文字が含まれています。');
  }
  const text = rawText.trim();
  if (text.length === 0) {
    return invalidOutput('会話例の本文は空にできません。');
  }
  if (containsContactLikeText(text)) {
    return invalidOutput('会話例の本文に連絡先らしい内容が含まれています。');
  }
  return text;
}

/**
 * owner 実機観測（Issue 169）: 4 ターン生成のうち 3 ターン目が 1 ターン目と
 * 完全に同一の文を返し、会話が transcript の上に積み上がらず繰り返しループした。
 * trim 後の完全一致を、話者を問わずこれまでの transcript 全体に対して検査する
 * fail-closed Guard として固定する（1 Turn だけを救済せず、そのターンで会話を終了する）。
 */
function assertNotRepeatingTranscript(
  text: string,
  transcript: readonly ConversationExampleTurn[]
): void {
  if (transcript.some((turn) => turn.text === text)) {
    invalidOutput('会話例の本文がこれまでのターンと完全に同じ繰り返しです。');
  }
}

/**
 * Issue 169: ターン毎生成の 1 応答を検証する。話者は Native 応答ではなく交互スケジュール
 * （呼び出し側の `turnIndex`）から決定的に決まるため、Schema・検証対象は `text` だけにする。
 * `transcript` はこれまでに確定済みの全ターンで、直前ターンとの一致だけでなく、
 * 話者を問わず transcript 全体との完全一致（trim 後）を拒否する。
 */
export function parseConversationExampleTurn(
  value: unknown,
  speaker: ConversationExampleSpeaker,
  transcript: readonly ConversationExampleTurn[]
): ConversationExampleTurn {
  try {
    const record = strictDataRecord(value, '$', ['text'] as const);
    const text = verifiedTurnText(record.text, '$');
    assertNotRepeatingTranscript(text, transcript);
    return { speaker, text };
  } catch (error: unknown) {
    if (error instanceof ConversationExampleError) throw error;
    throw new ConversationExampleError(
      'INVALID_OUTPUT',
      '会話例のターンを安全に検証できませんでした。'
    );
  }
}
