import { describe, expect, it } from 'bun:test';
import { IntroCardError } from '../domain/intro-card';
import { MESSAGES } from './i18n/messages';
import { resolveEffectiveStartupLocale } from './initial-locale-port';
import {
  buildInitialIntroCardNotice,
  introCardNoticeFromError,
} from './intro-card-notice';
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
      '名前を入力してください。',
      'name'
    );

    expect(introCardNoticeFromError(error, 'save')).toEqual({
      kind: 'validation-error',
      message: '名前を入力してください。',
      field: 'name',
    });
  });

  it('IntroCardError の field をそのまま Notice へ引き継ぐ（Issue 92: 保存失敗時の該当欄 focus に使う）', () => {
    const error = new IntroCardError(
      'INVALID_EMAIL',
      'メールアドレスの形式が不正です。',
      'email'
    );

    expect(introCardNoticeFromError(error, 'save')).toEqual({
      kind: 'validation-error',
      message: 'メールアドレスの形式が不正です。',
      field: 'email',
    });
  });

  it('field を持たない IntroCardError（CARD_TOO_LARGE 等）は field: undefined の validation-error になる', () => {
    const error = new IntroCardError(
      'CARD_TOO_LARGE',
      'vCard が QR の上限を超えています。'
    );

    expect(introCardNoticeFromError(error, 'save')).toEqual({
      kind: 'validation-error',
      message: 'vCard が QR の上限を超えています。',
      field: undefined,
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

describe('buildInitialIntroCardNotice（Issue 111 major fix）', () => {
  it('ja を渡すと empty kind・日本語の initialNotice を返す', () => {
    expect(buildInitialIntroCardNotice('ja')).toEqual({
      kind: 'empty',
      message: MESSAGES.ja.introCard.initialNotice,
    });
  });

  it('en を渡すと empty kind・英語の initialNotice を返す', () => {
    expect(buildInitialIntroCardNotice('en')).toEqual({
      kind: 'empty',
      message: MESSAGES.en.introCard.initialNotice,
    });
  });
});

describe('起動時の Intro Card Notice は effective locale で組み立てる（Codex Finding 1: 端末ロケール=ja だが保存済み選択=en のときの言語混在バグの回帰テスト）', () => {
  it('auto-detect=ja かつ persisted=en のとき、Intro Card Storage の読込が成功すれば初期 Notice は en になる（ja のままにならない）', () => {
    const effectiveLocale = resolveEffectiveStartupLocale('ja', 'en');

    const notice = buildInitialIntroCardNotice(effectiveLocale);

    expect(notice).toEqual({
      kind: 'empty',
      message: MESSAGES.en.introCard.initialNotice,
    });
    expect(notice.message).not.toBe(MESSAGES.ja.introCard.initialNotice);
  });

  it('auto-detect=ja かつ persisted=en のとき、Intro Card Storage の読込が失敗しても Notice は en になる（ja のままにならない）', () => {
    const effectiveLocale = resolveEffectiveStartupLocale('ja', 'en');

    const notice = introCardNoticeFromError(
      new Error('boom'),
      'load',
      effectiveLocale
    );

    expect(notice).toEqual({
      kind: 'read-error',
      message: 'boom',
    });
    // Error インスタンス自身の message ではなく Fallback 文言で比較したいケース
    // （型なし例外）も、effective locale が en になっていることを確認する。
    const fallbackNotice = introCardNoticeFromError(
      {},
      'load',
      effectiveLocale
    );
    expect(fallbackNotice).toEqual({
      kind: 'read-error',
      message: MESSAGES.en.introCard.readErrorFallback,
    });
    expect(fallbackNotice.message).not.toBe(
      MESSAGES.ja.introCard.readErrorFallback
    );
  });

  it('auto-detect=ja かつ persisted 無し（null）のときは、従来どおり ja のままになる（回帰確認）', () => {
    const effectiveLocale = resolveEffectiveStartupLocale('ja', null);

    expect(buildInitialIntroCardNotice(effectiveLocale)).toEqual({
      kind: 'empty',
      message: MESSAGES.ja.introCard.initialNotice,
    });
    expect(introCardNoticeFromError({}, 'load', effectiveLocale)).toEqual({
      kind: 'read-error',
      message: MESSAGES.ja.introCard.readErrorFallback,
    });
  });
});
