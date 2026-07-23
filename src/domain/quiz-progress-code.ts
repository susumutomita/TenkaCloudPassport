import { allQuizQuestions, type QuizQuestionId } from './quiz-catalog';
import type { QuizProgress } from './quiz-progress';

/**
 * Issue 110: クリア済み設問 id の集合 ⇄ 16 進ビットマスク文字列の codec。
 * QR（`src/protocol/intro-card-url.ts` の `q`）と `site/c/index.html` のビューアが、
 * この codec と同じアルゴリズムを共有する契約を持つ（ビューアは import できないため
 * BigInt ビット演算を独立に再実装し、`scripts/intro-card-viewer.test.ts` が定数の
 * drift を固定する）。
 *
 * `number` のビット演算子（`<<` / `|`）は 32bit 符号付き整数に丸められ、31 bit を超える
 * bitIndex を扱うと壊れる。現在は 16 問（16 bit）だが、将来カタログが拡張されても壊れない
 * よう最初から `BigInt` を使う（`docs/design/2026-07-23-cloud-basics-quiz.md` 3 節）。
 */

/**
 * fail-closed 用の粗い上限（32 桁 = 128 bit 相当、現行 16 問の 8 倍の余裕）。
 * DoS 目的の異常に長い手作り文字列を弾く。
 */
export const QUIZ_PROGRESS_HEX_MAX_LENGTH = 32;

const HEX_PATTERN = /^[0-9a-f]+$/i;

export class QuizProgressCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizProgressCodeError';
  }
}

/** クリア済み集合を 16 進ビットマスク文字列へ変換する（0 マスクは `'0'`）。 */
export function encodeQuizProgressHex(progress: QuizProgress): string {
  let mask = 0n;
  for (const question of allQuizQuestions()) {
    if (progress.has(question.id)) {
      mask |= 1n << BigInt(question.bitIndex);
    }
  }
  return mask.toString(16);
}

/**
 * 16 進ビットマスク文字列をクリア済み集合へ変換する。現在のカタログが知っている
 * bitIndex だけを走査するため、カタログにまだ存在しない高位ビットは自然に無視される
 * （将来の桁拡張・逆に旧アプリで新しい QR を開いた場合の両方で安全）。
 */
export function decodeQuizProgressHex(hex: string): QuizProgress {
  if (hex.length === 0 || hex.length > QUIZ_PROGRESS_HEX_MAX_LENGTH) {
    throw new QuizProgressCodeError(
      `進捗コードの桁数が不正です（1〜${QUIZ_PROGRESS_HEX_MAX_LENGTH} 桁）。`
    );
  }
  if (!HEX_PATTERN.test(hex)) {
    throw new QuizProgressCodeError(
      '進捗コードは 16 進文字列（0-9, a-f）である必要があります。'
    );
  }
  const mask = BigInt(`0x${hex}`);
  const cleared = new Set<QuizQuestionId>();
  for (const question of allQuizQuestions()) {
    const bit = 1n << BigInt(question.bitIndex);
    if ((mask & bit) !== 0n) cleared.add(question.id);
  }
  return cleared;
}
