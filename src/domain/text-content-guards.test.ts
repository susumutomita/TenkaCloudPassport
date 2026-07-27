import { describe, expect, it } from 'bun:test';
import {
  containsContactLikeText,
  containsForbiddenTextUnicode,
  isSingleLineText,
} from './text-content-guards';

describe('モデル由来表示文の共通 Content Guard（Issue 155）', () => {
  it('メールアドレスを連絡先として検出する', () => {
    expect(containsContactLikeText('連絡は a@example.com へ')).toBe(true);
  });

  it('http / www URL を大小文字に依存せず検出する', () => {
    expect(containsContactLikeText('HTTPS://example.com/path')).toBe(true);
    expect(containsContactLikeText('www.example.com')).toBe(true);
  });

  it('7 桁以上の電話番号らしい数字列を検出する', () => {
    expect(containsContactLikeText('090-1234-5678')).toBe(true);
    expect(containsContactLikeText('+81 (90) 1234 5678')).toBe(true);
  });

  it('年号や件数のような短い数字は連絡先扱いしない', () => {
    expect(containsContactLikeText('2026 年に 3 回参加')).toBe(false);
  });

  it('制御文字・書式制御・Default Ignorable を拒否対象として検出する', () => {
    expect(containsForbiddenTextUnicode('a\u0000b')).toBe(true);
    expect(containsForbiddenTextUnicode('a\u200bb')).toBe(true);
    expect(containsForbiddenTextUnicode('通常の文章')).toBe(false);
  });

  it('CR/LF と Unicode の行・段落区切りを単一行ではないと判定する', () => {
    expect(isSingleLineText('1 行目\n2 行目')).toBe(false);
    expect(isSingleLineText('1 行目\r2 行目')).toBe(false);
    expect(isSingleLineText('1 行目\u20282 行目')).toBe(false);
    expect(isSingleLineText('1 行目\u20292 行目')).toBe(false);
    expect(isSingleLineText('単一行です')).toBe(true);
  });
});
