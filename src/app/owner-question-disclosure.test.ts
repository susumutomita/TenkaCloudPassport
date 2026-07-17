import { describe, expect, it } from 'bun:test';
import { ownerQuestionDisclosure } from './owner-question-disclosure';

describe('Owner Question の事前開示', () => {
  it('誰へ共有されるかを示す', () => {
    expect(ownerQuestionDisclosure().sharedWithMessage).toContain('相手');
  });

  it('いつ消えるかを示す', () => {
    expect(ownerQuestionDisclosure().deletedWhenMessage).toContain(
      '終了した時点で'
    );
  });

  it('Passport に残らないことを示す', () => {
    expect(ownerQuestionDisclosure().notSavedToPassportMessage).toContain(
      'Passport'
    );
    expect(ownerQuestionDisclosure().notSavedToPassportMessage).toContain(
      '自動保存しません'
    );
  });

  it('毎回同じ内容を返す（Chain of Thought のような都度生成の文言ではない）', () => {
    expect(ownerQuestionDisclosure()).toEqual(ownerQuestionDisclosure());
  });

  it('locale が en のとき、共有先・削除時期・Passport 非保存を英語で示す', () => {
    const disclosure = ownerQuestionDisclosure('en');

    expect(disclosure.sharedWithMessage).not.toBe(
      ownerQuestionDisclosure().sharedWithMessage
    );
    expect(disclosure.deletedWhenMessage.length).toBeGreaterThan(0);
    expect(disclosure.notSavedToPassportMessage).toContain('Passport');
  });
});
