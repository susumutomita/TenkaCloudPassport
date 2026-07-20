import { describe, expect, it } from 'bun:test';
import { IntroCardError } from '../domain/intro-card';
import { introCardNoticeFromError } from './intro-card-notice';
import { IntroCardStorageError } from './intro-card-storage';

function storageError(
  code: IntroCardStorageError['code']
): IntroCardStorageError {
  return new IntroCardStorageError(
    code,
    `Storage error: ${code}`,
    new Error('OS error')
  );
}

describe('Intro Card の Notice', () => {
  it('IntroCardError（入力検証）を validation-error として扱う', () => {
    const error = new IntroCardError(
      'NAME_REQUIRED',
      '名前を入力してください。'
    );

    expect(introCardNoticeFromError(error, 'save')).toEqual({
      kind: 'validation-error',
      message: '名前を入力してください。',
    });
  });

  it('Storage 利用不可を読込失敗や保存失敗と区別する', () => {
    expect(
      introCardNoticeFromError(storageError('UNAVAILABLE'), 'load')
    ).toEqual({
      kind: 'storage-unavailable',
      message: 'Storage error: UNAVAILABLE',
    });
  });

  it('不正保存データを一般的な読込失敗と区別する', () => {
    expect(
      introCardNoticeFromError(storageError('INVALID_DATA'), 'load')
    ).toEqual({
      kind: 'invalid-data',
      message: 'Storage error: INVALID_DATA',
    });
  });

  it('実 Storage の読込失敗・保存失敗・削除失敗を操作別に表示する', () => {
    expect(
      introCardNoticeFromError(storageError('READ_FAILED'), 'load').kind
    ).toBe('read-error');
    expect(
      introCardNoticeFromError(storageError('WRITE_FAILED'), 'save').kind
    ).toBe('save-error');
    expect(
      introCardNoticeFromError(storageError('DELETE_FAILED'), 'delete').kind
    ).toBe('delete-error');
  });

  it('カード削除失敗は保存失敗の文言を流用せず delete-error として区別する', () => {
    expect(
      introCardNoticeFromError(storageError('DELETE_FAILED'), 'delete')
    ).toEqual({
      kind: 'delete-error',
      message: 'Storage error: DELETE_FAILED',
    });
    expect(introCardNoticeFromError({}, 'delete')).toEqual({
      kind: 'delete-error',
      message: 'Storage の処理に失敗しました。もう一度実行してください。',
    });
    expect(introCardNoticeFromError({}, 'delete', 'en')).toEqual({
      kind: 'delete-error',
      message: 'Storage operation failed. Please try again.',
    });
  });

  it('型なし例外も操作別の固有状態と安全な文言へ変換する', () => {
    expect(
      introCardNoticeFromError(new Error('Web API failure'), 'load')
    ).toEqual({ kind: 'read-error', message: 'Web API failure' });
    expect(introCardNoticeFromError({}, 'save')).toEqual({
      kind: 'save-error',
      message: 'Storage の処理に失敗しました。もう一度実行してください。',
    });
  });

  it('locale を省略すると既定で日本語の Fallback を返す（既存呼び出しとの後方互換）', () => {
    expect(introCardNoticeFromError({}, 'load')).toEqual({
      kind: 'read-error',
      message: 'Storage の処理に失敗しました。もう一度実行してください。',
    });
  });

  it('locale が en のとき、型なし例外の Fallback を英語で返す', () => {
    expect(introCardNoticeFromError({}, 'load', 'en')).toEqual({
      kind: 'read-error',
      message: 'Storage operation failed. Please try again.',
    });
    expect(introCardNoticeFromError({}, 'save', 'en')).toEqual({
      kind: 'save-error',
      message: 'Storage operation failed. Please try again.',
    });
  });

  it('locale が en でも Error インスタンス自身の message はそのまま使う', () => {
    expect(
      introCardNoticeFromError(new Error('Web API failure'), 'load', 'en')
    ).toEqual({ kind: 'read-error', message: 'Web API failure' });
  });
});
