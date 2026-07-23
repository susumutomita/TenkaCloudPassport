import type { QuizQuestion, QuizQuestionId } from './quiz-catalog';
import { QUIZ_QUESTION_IDS } from './quiz-catalog';

/**
 * Issue 110: クイズの進捗は「クリア済み設問 id の集合」だけで表す。正誤の詳細・選択した
 * 回答・解答時刻・解答履歴は持たない（採点は自己申告のスタンプで十分という owner の判断、
 * `docs/design/2026-07-23-cloud-basics-quiz.md` 2 節）。この集合の bitIndex への変換は
 * `quiz-progress-code.ts` が担う（QR 共有用のビットマスク codec）ため、ここでは domain 層の
 * 純関数だけを持つ。
 */
export type QuizProgress = ReadonlySet<QuizQuestionId>;

export const EMPTY_QUIZ_PROGRESS: QuizProgress = new Set();

export interface QuizAnswerOutcome {
  readonly questionId: QuizQuestionId;
  readonly selectedIndex: 0 | 1 | 2 | 3;
  readonly correct: boolean;
}

/** 選択した選択肢が正解かどうかだけを判定する純関数（副作用なし）。 */
export function scoreQuizAnswer(
  question: QuizQuestion,
  selectedIndex: 0 | 1 | 2 | 3
): QuizAnswerOutcome {
  return {
    questionId: question.id,
    selectedIndex,
    correct: selectedIndex === question.correctIndex,
  };
}

export function isQuizQuestionCleared(
  progress: QuizProgress,
  id: QuizQuestionId
): boolean {
  return progress.has(id);
}

/**
 * 既にクリア済みなら同じ参照をそのまま返す（不要な再 render を避ける、
 * `src/app/intro-card-storage.ts` 系の不変更新と同じ流儀）。
 */
export function withQuizQuestionCleared(
  progress: QuizProgress,
  id: QuizQuestionId
): QuizProgress {
  if (progress.has(id)) return progress;
  return new Set([...progress, id]);
}

export function quizClearedCount(progress: QuizProgress): number {
  return progress.size;
}

export function isQuizComplete(progress: QuizProgress): boolean {
  return QUIZ_QUESTION_IDS.every((id) => progress.has(id));
}
