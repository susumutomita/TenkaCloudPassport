import { clueById, type PassportField } from './clue-catalog';
import type { ConfirmedClue } from './passport';

export const OWNER_QUESTION_CATALOG = {
  'confirm-shared-clue': 'この手掛かりを今回の Lounge で利用してよいですか。',
} as const;

export type OwnerQuestionId = keyof typeof OWNER_QUESTION_CATALOG;

/**
 * Issue 11: Owner Question が持てる目的の閉じた集合。自由記述の質問文を持たず、
 * この 3 値だけを許可することで、人種・宗教・健康・政治・性的指向・住所・連絡先のような
 * Sensitive Attribute を尋ねる余地を構造的に排除する（尋ねられる語彙自体が存在しない）。
 */
export type OwnerQuestionPurpose = 'canOffer' | 'lookingFor' | 'currentGoal';

export interface OwnerQuestion {
  readonly schemaVersion: 1;
  readonly questionId: OwnerQuestionId;
  readonly displayText: (typeof OWNER_QUESTION_CATALOG)[OwnerQuestionId];
  readonly purpose: OwnerQuestionPurpose;
}

/**
 * `PassportField`（4 値: topics / offers / lookingFor / goal）を Owner Question の
 * 目的（3 値）へ全射する。`topics`（会話の話題）は「何を提供できるか」に近い性質のため
 * `canOffer` へ寄せる。自由記述からではなくカタログの固定分類だけから導出するため、
 * 呼び出し側が任意の目的を指定する余地はない。
 */
function ownerQuestionPurposeForField(
  field: PassportField
): OwnerQuestionPurpose {
  if (field === 'offers') return 'canOffer';
  if (field === 'lookingFor') return 'lookingFor';
  if (field === 'goal') return 'currentGoal';
  return 'canOffer';
}

export function ownerQuestionPurposeForClue(
  candidateClue: ConfirmedClue
): OwnerQuestionPurpose {
  return ownerQuestionPurposeForField(
    clueById(candidateClue.value).passportField
  );
}

/**
 * カタログ ID と候補手掛かりから表示文言・目的込みの Owner Question を組み立てる。1 回の
 * Lounge 参加につき最大 1 問という上限は呼び出し側（Pet Interaction の bounded protocol）が
 * 数える。
 */
export function ownerQuestion(
  questionId: OwnerQuestionId,
  candidateClue: ConfirmedClue
): OwnerQuestion {
  return {
    schemaVersion: 1,
    questionId,
    displayText: OWNER_QUESTION_CATALOG[questionId],
    purpose: ownerQuestionPurposeForClue(candidateClue),
  };
}

export const OWNER_ANSWER_NOTE_MAX_LENGTH = 140;

export type OwnerQuestionErrorCode = 'NOTE_TOO_LONG';

export class OwnerQuestionError extends Error {
  readonly code: OwnerQuestionErrorCode;

  constructor(code: OwnerQuestionErrorCode, message: string) {
    super(message);
    this.name = 'OwnerQuestionError';
    this.code = code;
  }
}

/**
 * Owner Question への回答に添える任意のメモを検証する。Peer へは送らず、Passport へも
 * 昇格しない、この Lounge の中だけで Owner 自身が確認に使う自由入力である。選択肢
 * （答える / 分からない / パス）だけでも完答できるため、空文字列は常に許可する。
 */
export function validateOwnerAnswerNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length > OWNER_ANSWER_NOTE_MAX_LENGTH) {
    throw new OwnerQuestionError(
      'NOTE_TOO_LONG',
      `メモは ${OWNER_ANSWER_NOTE_MAX_LENGTH} 文字以内にしてください。`
    );
  }
  return trimmed;
}
