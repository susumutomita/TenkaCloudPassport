import { clueById, type LanguageCode } from './clue-catalog';
import type { MatchEvidence } from './match-evidence';
import type { ConfirmedClue } from './passport';

export interface Bridge {
  readonly schemaVersion: 1;
  readonly messageKey: 'shared-clue' | 'offer-need-complement';
  readonly message: string;
  /**
   * Issue 15: AC「異言語 Bridge は原文と端末内生成の補助文を区別する」を満たすための、
   * `message` に埋め込まれた Clue Label（原文）だけを独立に取り出したもの。カタログの
   * Label 自体は Issue 13 からの Known follow-up として翻訳しないため、`language` を
   * 問わず常に同じ値（カタログに記載された言語のまま）になる。`message` はこの Label を
   * `language` ごとの定型文（Rules の安全な定型 Fallback）で包んだ「端末内で今回生成した
   * 補助文」であり、Wire を越えて運ばれるのは `evidence`（Clue ID）だけで `message` 自体は
   * 送信されない（`src/protocol/schema.ts` の `parseBridge` を参照）。UI 側はこの 2 つを
   * 別々に提示し、どちらが原文でどちらが生成物かを利用者が区別できるようにする
   * （`docs/design/i18n-and-accessibility.md` の Bridge の原文と補助文の区別）。
   */
  readonly sourceLabels: readonly string[];
  readonly evidence: MatchEvidence;
}

/**
 * Issue 15: Bridge 文言を `language`（既定 `ja`）へ追従させる。既存呼び出しは省略時 `ja` の
 * まま Byte-for-byte 不変（`bridge.test.ts` 等の 100% カバレッジ済みテストを無変更で保つ）。
 * Clue Label 自体（`clue.label`）は Issue 13 と同じ Known follow-up として翻訳しない。
 * `agent-model-provider.ts`（Issue 13 の Golden Contract 専用モジュール）とは別に、この
 * 2 者間 Live 経路専用の英語テンプレートを持つ（`docs/design/i18n-and-accessibility.md`
 * の設計判断 4）。
 */
function sharedClueMessage(label: string, language: LanguageCode): string {
  return language === 'en'
    ? `You both published "${label}". Try starting a conversation about it.`
    : `お互いが公開した「${label}」をきっかけに、話してみませんか。`;
}

function complementMessage(
  offerLabel: string,
  seekLabel: string,
  language: LanguageCode
): string {
  return language === 'en'
    ? `Found someone who can offer "${offerLabel}" and someone looking for "${seekLabel}". Try starting a conversation.`
    : `「${offerLabel}」を提供できる相手と、「${seekLabel}」を探している相手が見つかりました。話してみませんか。`;
}

export function createBridge(
  sharedClue: ConfirmedClue,
  language: LanguageCode = 'ja'
): Bridge {
  const clue = clueById(sharedClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'shared-clue',
    message: sharedClueMessage(clue.label, language),
    sourceLabels: [clue.label],
    evidence: {
      schemaVersion: 1,
      clues: [sharedClue],
    },
  };
}

/**
 * Issue 12: Topic 共通の手掛かりが 1 件もなくても、一方が提供できる手掛かりと
 * もう一方が探している手掛かりが同じ category で相互補完するとき、その 2 件を Evidence
 * とする Bridge を組み立てる（`src/domain/bridge-selection.ts` の
 * `offerNeedComplementMatches` を根拠にする 2 者間 Live 経路専用の constructor）。
 */
export function createComplementBridge(
  offerClue: ConfirmedClue,
  seekClue: ConfirmedClue,
  language: LanguageCode = 'ja'
): Bridge {
  const offer = clueById(offerClue.value);
  const seek = clueById(seekClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'offer-need-complement',
    message: complementMessage(offer.label, seek.label, language),
    sourceLabels: [offer.label, seek.label],
    evidence: {
      schemaVersion: 1,
      clues: [offerClue, seekClue],
    },
  };
}

export function createBridgeFromEvidence(
  evidence: MatchEvidence,
  language: LanguageCode = 'ja'
): Bridge {
  const firstClue = evidence.clues[0];
  if (!firstClue) {
    throw new Error('Bridge には 1 件以上の Match Evidence が必要です。');
  }
  const clue = clueById(firstClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'shared-clue',
    message: sharedClueMessage(clue.label, language),
    sourceLabels: [clue.label],
    evidence,
  };
}
