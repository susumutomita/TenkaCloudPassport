import { describe, expect, it } from 'bun:test';
import { EXPIRY_WARNING_THRESHOLD_MS, expiryNotice } from './expiry-notice';

describe('満了 1 分前の content-free 通知', () => {
  it('残り時間が 1 分を超えていれば warning を出さない', () => {
    const notice = expiryNotice(EXPIRY_WARNING_THRESHOLD_MS + 1);

    expect(notice.level).toBe('normal');
    expect(notice.message).toBe('');
  });

  it('残りちょうど 1 分になった瞬間から warning を出す', () => {
    const notice = expiryNotice(EXPIRY_WARNING_THRESHOLD_MS);

    expect(notice.level).toBe('warning');
    expect(notice.message.length).toBeGreaterThan(0);
  });

  it('残り時間が 0 秒でも warning のままにする', () => {
    const notice = expiryNotice(0);

    expect(notice.level).toBe('warning');
  });

  it('残り時間が負（期限超過）でも warning のままにする', () => {
    const notice = expiryNotice(-1_000);

    expect(notice.level).toBe('warning');
  });

  it('通知文言は Bridge、相手の手掛かり、判定結果の内容を含まない', () => {
    const notice = expiryNotice(0);

    for (const forbidden of [
      'Bridge',
      'no-signal',
      '手掛かり',
      'clue',
      'passport',
      'Passport',
    ]) {
      expect(notice.message).not.toContain(forbidden);
    }
  });

  it('locale が en のとき、英語の warning 文言を返す', () => {
    const notice = expiryNotice(0, 'en');

    expect(notice.level).toBe('warning');
    expect(notice.message.length).toBeGreaterThan(0);
    expect(notice.message).not.toBe(expiryNotice(0, 'ja').message);
  });

  it('locale が en でも通知文言は Bridge、相手の手掛かり、判定結果の内容を含まない', () => {
    const notice = expiryNotice(0, 'en');

    for (const forbidden of ['Bridge', 'no-signal', 'clue', 'Passport']) {
      expect(notice.message).not.toContain(forbidden);
    }
  });
});
