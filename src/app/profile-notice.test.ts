import { describe, expect, it } from 'bun:test';
import { LocalProfileStorageError } from './local-profile-storage';
import { profileNoticeFromStorageError } from './profile-notice';

function storageError(
  code: LocalProfileStorageError['code']
): LocalProfileStorageError {
  return new LocalProfileStorageError(
    code,
    `Storage error: ${code}`,
    new Error('OS error')
  );
}

describe('Local Profile の Storage Notice', () => {
  it('Storage 利用不可を読込失敗や保存失敗と区別する', () => {
    expect(
      profileNoticeFromStorageError(storageError('UNAVAILABLE'), 'load')
    ).toEqual({
      kind: 'storage-unavailable',
      message: 'Storage error: UNAVAILABLE',
    });
  });

  it('不正保存データを一般的な読込失敗と区別する', () => {
    expect(
      profileNoticeFromStorageError(storageError('INVALID_DATA'), 'load')
    ).toEqual({
      kind: 'invalid-data',
      message: 'Storage error: INVALID_DATA',
    });
  });

  it('実 Storage の読込失敗と保存失敗を操作別に表示する', () => {
    expect(
      profileNoticeFromStorageError(storageError('READ_FAILED'), 'load').kind
    ).toBe('read-error');
    expect(
      profileNoticeFromStorageError(storageError('WRITE_FAILED'), 'save').kind
    ).toBe('save-error');
  });

  it('型なし例外も操作別の固有状態と安全な文言へ変換する', () => {
    expect(
      profileNoticeFromStorageError(new Error('Web API failure'), 'load')
    ).toEqual({ kind: 'read-error', message: 'Web API failure' });
    expect(profileNoticeFromStorageError({}, 'save')).toEqual({
      kind: 'save-error',
      message: 'Storage の処理に失敗しました。もう一度実行してください。',
    });
  });
});
