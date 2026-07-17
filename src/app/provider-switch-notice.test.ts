import { describe, expect, it } from 'bun:test';
import type { ProviderSwitchReason } from '../domain/provider-fallback';
import { providerSwitchNotice } from './provider-switch-notice';

const REASONS: readonly ProviderSwitchReason[] = [
  'timeout',
  'schema-error',
  'load-error',
];

const FORBIDDEN_INTERNAL_VOCABULARY = [
  'Chain of Thought',
  'Prompt',
  'candidateClue',
  'evidence',
  'reasoning',
  'AgentModelProviderError',
];

describe('Provider 切替 Status 表示 (providerSwitchNotice)', () => {
  it('reason が null のとき、基準実装で判定中という固定文言を返す', () => {
    expect(providerSwitchNotice(null).message).toContain('Rules Provider');
  });

  it('3 種類の切替理由それぞれに固定文言を持つ', () => {
    for (const reason of REASONS) {
      const notice = providerSwitchNotice(reason);
      expect(notice.message.length).toBeGreaterThan(0);
      expect(notice.message).toContain('Rules Provider へ切り替えました。');
    }
  });

  it('内部推論・Prompt・Evidence・内部エラー型名の語彙を一切含まない', () => {
    for (const reason of [null, ...REASONS]) {
      const notice = providerSwitchNotice(reason);
      for (const forbidden of FORBIDDEN_INTERNAL_VOCABULARY) {
        expect(notice.message).not.toContain(forbidden);
      }
    }
  });

  it('locale が en のとき、reason が null なら英語で基準実装の判定中を返す', () => {
    expect(providerSwitchNotice(null, 'en').message).toContain(
      'Rules Provider'
    );
  });

  it('locale が en のとき、3 種類の切替理由それぞれに固定の英語文言を持つ', () => {
    for (const reason of REASONS) {
      const notice = providerSwitchNotice(reason, 'en');
      expect(notice.message.length).toBeGreaterThan(0);
      expect(notice.message).toContain('Rules Provider');
      expect(notice.message).not.toBe(providerSwitchNotice(reason).message);
    }
  });

  it('locale が en でも内部推論・Prompt・Evidence・内部エラー型名の語彙を一切含まない', () => {
    for (const reason of [null, ...REASONS]) {
      const notice = providerSwitchNotice(reason, 'en');
      for (const forbidden of FORBIDDEN_INTERNAL_VOCABULARY) {
        expect(notice.message).not.toContain(forbidden);
      }
    }
  });
});
