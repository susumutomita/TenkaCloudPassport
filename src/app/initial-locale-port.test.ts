import { describe, expect, it } from 'bun:test';
import {
  createInitialLocalePort,
  type InitialLocaleEnvironment,
  pickInitialLocale,
  resolveEffectiveStartupLocale,
} from './initial-locale-port';

/** 常に日本語優先を返す実際の別実装。 */
const JAPANESE_ENVIRONMENT: InitialLocaleEnvironment = {
  preferredLanguageTags: () => ['ja-JP', 'en-US'],
};

/** 常に英語優先を返す実際の別実装。 */
const ENGLISH_ENVIRONMENT: InitialLocaleEnvironment = {
  preferredLanguageTags: () => ['en-US'],
};

/** 判定手段が無く空配列を返す実際の別実装（Web で `navigator.languages` が空等）。 */
const UNKNOWN_ENVIRONMENT: InitialLocaleEnvironment = {
  preferredLanguageTags: () => [],
};

/** 取得自体が失敗する実際の別実装（権限拒否・未対応環境等）。 */
const FAILING_ENVIRONMENT: InitialLocaleEnvironment = {
  preferredLanguageTags: () => {
    throw new Error('locale unavailable');
  },
};

describe('pickInitialLocale', () => {
  it('先頭タグが ja なら ja を返す', () => {
    expect(pickInitialLocale(['ja'])).toBe('ja');
  });

  it('先頭タグが地域付き ja-JP でも ja を返す', () => {
    expect(pickInitialLocale(['ja-JP', 'en-US'])).toBe('ja');
  });

  it('先頭タグの大文字小文字を無視して判定する（JA-JP）', () => {
    expect(pickInitialLocale(['JA-JP'])).toBe('ja');
  });

  it('先頭タグが en なら en を返す', () => {
    expect(pickInitialLocale(['en-US'])).toBe('en');
  });

  it('LOCALES に無い言語（fr 等）は en へフォールバックする', () => {
    expect(pickInitialLocale(['fr-FR'])).toBe('en');
  });

  it('アンダースコア区切りのタグ（ja_JP）も同じサブタグ判定を適用する', () => {
    expect(pickInitialLocale(['ja_JP'])).toBe('ja');
  });

  it('空配列（判定手段が無い）は既存の既定値 ja を維持する', () => {
    expect(pickInitialLocale([])).toBe('ja');
  });

  it('先頭タグの言語サブタグが空（地域コードのみの "-JP"）なら既存の既定値 ja を維持する（Codex nit 指摘）', () => {
    expect(pickInitialLocale(['-JP'])).toBe('ja');
  });

  it('先頭タグの言語サブタグが空白のみ（" -JP"）でも trim 後に空として扱い ja を維持する', () => {
    expect(pickInitialLocale([' -JP'])).toBe('ja');
  });

  it('先頭タグ自体が空白のみでも判定手段が無いのと同じ扱いで ja を維持する', () => {
    expect(pickInitialLocale(['   '])).toBe('ja');
  });
});

describe('resolveEffectiveStartupLocale（Issue 111 major fix）', () => {
  it('保存済みの明示選択があれば、自動判定より保存済みを優先する', () => {
    expect(resolveEffectiveStartupLocale('ja', 'en')).toBe('en');
    expect(resolveEffectiveStartupLocale('en', 'ja')).toBe('ja');
  });

  it('保存済みの明示選択が無ければ（null）、自動判定の値をそのまま使う', () => {
    expect(resolveEffectiveStartupLocale('ja', null)).toBe('ja');
    expect(resolveEffectiveStartupLocale('en', null)).toBe('en');
  });

  it('自動判定と保存済みが同じ値でも保存済みを優先した結果は変わらない（冪等）', () => {
    expect(resolveEffectiveStartupLocale('ja', 'ja')).toBe('ja');
  });
});

describe('Initial Locale Port', () => {
  it('Environment が ja 優先を返せば ja を解決する', () => {
    const port = createInitialLocalePort(JAPANESE_ENVIRONMENT);

    expect(port.resolveInitialLocale()).toBe('ja');
  });

  it('Environment が en 優先を返せば en を解決する', () => {
    const port = createInitialLocalePort(ENGLISH_ENVIRONMENT);

    expect(port.resolveInitialLocale()).toBe('en');
  });

  it('Environment が空配列を返せば ja を解決する', () => {
    const port = createInitialLocalePort(UNKNOWN_ENVIRONMENT);

    expect(port.resolveInitialLocale()).toBe('ja');
  });

  it('Environment の取得が失敗しても既定値 ja へ fail-safe する', () => {
    const port = createInitialLocalePort(FAILING_ENVIRONMENT);

    expect(port.resolveInitialLocale()).toBe('ja');
  });
});
