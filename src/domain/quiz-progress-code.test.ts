import { describe, expect, it } from 'bun:test';
import { QUIZ_QUESTION_IDS } from './quiz-catalog';
import { EMPTY_QUIZ_PROGRESS, withQuizQuestionCleared } from './quiz-progress';
import {
  decodeQuizProgressHex,
  encodeQuizProgressHex,
  QUIZ_PROGRESS_HEX_MAX_LENGTH,
  QuizProgressCodeError,
} from './quiz-progress-code';

function captureError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

describe('encodeQuizProgressHex', () => {
  it('空の進捗は 0 マスク（"0"）を返す', () => {
    expect(encodeQuizProgressHex(EMPTY_QUIZ_PROGRESS)).toBe('0');
  });

  it('最初の設問（bitIndex 0）だけクリアすると "1" を返す', () => {
    const progress = withQuizQuestionCleared(
      EMPTY_QUIZ_PROGRESS,
      'iam-explicit-deny'
    );

    expect(encodeQuizProgressHex(progress)).toBe('1');
  });

  it('2 番目の設問（bitIndex 1）だけクリアすると "2" を返す', () => {
    const progress = withQuizQuestionCleared(
      EMPTY_QUIZ_PROGRESS,
      'vpc-public-subnet'
    );

    expect(encodeQuizProgressHex(progress)).toBe('2');
  });

  it('全 16 問クリアすると 16 bit すべて 1 の "ffff" を返す', () => {
    const progress = QUIZ_QUESTION_IDS.reduce(
      (acc, id) => withQuizQuestionCleared(acc, id),
      EMPTY_QUIZ_PROGRESS
    );

    expect(encodeQuizProgressHex(progress)).toBe('ffff');
  });

  it('カタログに存在しない id は無視する（防御的）', () => {
    const progressWithUnknownId = new Set([
      ...EMPTY_QUIZ_PROGRESS,
      'not-a-real-question',
    ]) as unknown as typeof EMPTY_QUIZ_PROGRESS;

    expect(encodeQuizProgressHex(progressWithUnknownId)).toBe('0');
  });
});

describe('decodeQuizProgressHex', () => {
  it('"0" は空の集合を返す', () => {
    const progress = decodeQuizProgressHex('0');

    expect(progress.size).toBe(0);
  });

  it('"1" は bitIndex 0 の設問だけがクリア済みの集合を返す（round-trip）', () => {
    const progress = decodeQuizProgressHex('1');

    expect([...progress]).toEqual(['iam-explicit-deny']);
  });

  it('encode → decode の round-trip で同じクリア済み集合に戻る（部分クリア）', () => {
    const original = ['lambda-basics', 'xray-basics', 'vpc-basics'] as const;
    const progress = original.reduce(
      (acc, id) => withQuizQuestionCleared(acc, id),
      EMPTY_QUIZ_PROGRESS
    );

    const roundTripped = decodeQuizProgressHex(encodeQuizProgressHex(progress));

    expect([...roundTripped].sort()).toEqual([...original].sort());
  });

  it('encode → decode の round-trip で同じクリア済み集合に戻る（全問）', () => {
    const progress = QUIZ_QUESTION_IDS.reduce(
      (acc, id) => withQuizQuestionCleared(acc, id),
      EMPTY_QUIZ_PROGRESS
    );

    const roundTripped = decodeQuizProgressHex(encodeQuizProgressHex(progress));

    expect([...roundTripped].sort()).toEqual([...QUIZ_QUESTION_IDS].sort());
  });

  it('大文字の 16 進文字列も受け付ける', () => {
    const progress = decodeQuizProgressHex('FFFF');

    expect(progress.size).toBe(16);
  });

  it('現在のカタログより上位の未定義ビットは安全に無視する（将来拡張・旧アプリ互換）', () => {
    // bit 20 は現行 16 問（bitIndex 0..15）の外側。0x100001 は bit 0 と bit 20 を立てる。
    const progress = decodeQuizProgressHex('100001');

    expect([...progress]).toEqual(['iam-explicit-deny']);
  });

  it('空文字は QuizProgressCodeError を投げる（fail-closed）', () => {
    const error = captureError(() => decodeQuizProgressHex(''));

    expect(error).toBeInstanceOf(QuizProgressCodeError);
  });

  it('16 進以外の文字を含む場合 QuizProgressCodeError を投げる（fail-closed）', () => {
    const error = captureError(() => decodeQuizProgressHex('zzzz'));

    expect(error).toBeInstanceOf(QuizProgressCodeError);
  });

  it(`桁数が ${QUIZ_PROGRESS_HEX_MAX_LENGTH} を超える場合 QuizProgressCodeError を投げる（DoS 対策）`, () => {
    const tooLong = 'f'.repeat(QUIZ_PROGRESS_HEX_MAX_LENGTH + 1);

    const error = captureError(() => decodeQuizProgressHex(tooLong));

    expect(error).toBeInstanceOf(QuizProgressCodeError);
  });

  it(`桁数がちょうど ${QUIZ_PROGRESS_HEX_MAX_LENGTH} なら throw しない`, () => {
    const maxLength = 'f'.repeat(QUIZ_PROGRESS_HEX_MAX_LENGTH);

    expect(() => decodeQuizProgressHex(maxLength)).not.toThrow();
  });
});
