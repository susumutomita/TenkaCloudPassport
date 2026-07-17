import { describe, expect, it } from 'bun:test';
import { CLUE_IDS, clueById } from './clue-catalog';
import {
  OWNER_ANSWER_NOTE_MAX_LENGTH,
  OWNER_QUESTION_CATALOG,
  OwnerQuestionError,
  type OwnerQuestionPurpose,
  ownerQuestion,
  ownerQuestionPurposeForClue,
  validateOwnerAnswerNote,
} from './owner-question';
import type { ConfirmedClue } from './passport';

const ALLOWED_PURPOSES: readonly OwnerQuestionPurpose[] = [
  'canOffer',
  'lookingFor',
  'currentGoal',
];

const FORBIDDEN_CLUE_TOPICS = [
  '人種',
  '民族',
  '宗教',
  '信仰',
  '健康',
  '病',
  '政治',
  '支持政党',
  '性的指向',
  '性自認',
  '住所',
  '電話',
  'メール',
  '連絡先',
];

function confirmedClue(value: ConfirmedClue['value']): ConfirmedClue {
  return {
    value,
    category: clueById(value).category,
    source: 'owner-selected',
  };
}

describe('Owner Question の組み立て', () => {
  it('カタログ ID と候補手掛かりから表示文言・目的込みの Owner Question を組み立てる', () => {
    const clue = confirmedClue('information-security');

    const question = ownerQuestion('confirm-shared-clue', clue);

    expect(question).toEqual({
      schemaVersion: 1,
      questionId: 'confirm-shared-clue',
      displayText: OWNER_QUESTION_CATALOG['confirm-shared-clue'],
      purpose: 'canOffer',
    });
  });

  describe('Question の目的は canOffer / lookingFor / currentGoal の閉じた集合だけになる', () => {
    it('offers の手掛かりは canOffer になる', () => {
      expect(
        ownerQuestionPurposeForClue(confirmedClue('information-security'))
      ).toBe('canOffer');
    });

    it('lookingFor の手掛かりは lookingFor になる', () => {
      expect(
        ownerQuestionPurposeForClue(confirmedClue('local-tournament'))
      ).toBe('lookingFor');
    });

    it('goal の手掛かりは currentGoal になる', () => {
      expect(
        ownerQuestionPurposeForClue(confirmedClue('community-operations'))
      ).toBe('currentGoal');
    });

    it('topics（会話の話題）は canOffer へ寄せる', () => {
      expect(ownerQuestionPurposeForClue(confirmedClue('open-source'))).toBe(
        'canOffer'
      );
    });

    it('版管理済みカタログの全手掛かりについて、目的は許可された 3 種類のいずれかだけになる', () => {
      for (const clueId of CLUE_IDS) {
        const purpose = ownerQuestionPurposeForClue(confirmedClue(clueId));
        expect(ALLOWED_PURPOSES).toContain(purpose);
      }
    });
  });

  describe('質問候補は版管理済みカタログの手掛かりだけから作られ、Sensitive Attribute を含まない', () => {
    it('カタログの表示ラベルに人種・宗教・健康・政治・性的指向・住所・連絡先の語彙を含まない', () => {
      for (const clueId of CLUE_IDS) {
        const label = clueById(clueId).label;
        for (const forbidden of FORBIDDEN_CLUE_TOPICS) {
          expect(label).not.toContain(forbidden);
        }
      }
    });

    it('Owner Question の表示文言は固定カタログだけから作られ、自由記述を受け付けない', () => {
      expect(Object.keys(OWNER_QUESTION_CATALOG)).toEqual([
        'confirm-shared-clue',
      ]);
    });
  });

  describe('回答に添える任意メモは 140 文字以内で検証する', () => {
    it('空文字列は選択肢だけで回答できることを示すため許可する', () => {
      expect(validateOwnerAnswerNote('')).toBe('');
    });

    it('前後の空白を取り除く', () => {
      expect(validateOwnerAnswerNote('  会えて嬉しいです  ')).toBe(
        '会えて嬉しいです'
      );
    });

    it(`${OWNER_ANSWER_NOTE_MAX_LENGTH} 文字ちょうどは許可する`, () => {
      const note = 'あ'.repeat(OWNER_ANSWER_NOTE_MAX_LENGTH);
      expect(validateOwnerAnswerNote(note)).toBe(note);
    });

    it(`${OWNER_ANSWER_NOTE_MAX_LENGTH} 文字を超えると型付きエラーになる`, () => {
      const note = 'あ'.repeat(OWNER_ANSWER_NOTE_MAX_LENGTH + 1);
      try {
        validateOwnerAnswerNote(note);
        throw new Error('OwnerQuestionError が必要です。');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(OwnerQuestionError);
        if (error instanceof OwnerQuestionError) {
          expect(error.code).toBe('NOTE_TOO_LONG');
        }
      }
    });
  });
});
