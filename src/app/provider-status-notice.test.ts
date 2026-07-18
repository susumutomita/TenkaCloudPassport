import { describe, expect, it } from 'bun:test';
import type { ProviderRuntimeStatus } from './agent-provider-session';
import { providerStatusNotice } from './provider-status-notice';

const STATUSES: readonly ProviderRuntimeStatus[] = [
  'rules',
  'loading-local-model',
  'local-model',
  'falling-back',
  'failed',
];

const FORBIDDEN_INTERNAL_VOCABULARY = [
  'Passport body',
  'Owner Answer',
  'Chain of Thought',
  'Prompt',
  'Model Output',
  'candidateClue',
  'evidence',
  'reasoning',
  'AgentModelProviderError',
];

describe('Provider Runtime Status 表示 (providerStatusNotice)', () => {
  it('Rules / Loading Local Model / Local Model / Falling Back / Failed の固定文言を持つ', () => {
    expect(
      STATUSES.map((status) => providerStatusNotice(status).message)
    ).toEqual([
      'Rules Provider（基準実装）で判定します。',
      'Local Model を端末内で読み込んでいます。',
      'Local Model を端末内だけで使用しています。',
      'Rules Provider へ安全に切り替えています。',
      '判定を完了できませんでした。',
    ]);
  });

  it('5 種類の Status それぞれに固定文言を持つ', () => {
    for (const status of STATUSES) {
      const notice = providerStatusNotice(status);
      expect(notice.message.length).toBeGreaterThan(0);
    }
  });

  it('Passport・回答・内部推論・Prompt・Model Output・内部エラー型名を一切含まない', () => {
    for (const status of STATUSES) {
      const notice = providerStatusNotice(status);
      for (const forbidden of FORBIDDEN_INTERNAL_VOCABULARY) {
        expect(notice.message).not.toContain(forbidden);
      }
    }
  });

  it('locale が en のとき、5 種類それぞれに固定の英語文言を持つ', () => {
    for (const status of STATUSES) {
      const notice = providerStatusNotice(status, 'en');
      expect(notice.message.length).toBeGreaterThan(0);
      expect(notice.message).not.toBe(providerStatusNotice(status).message);
    }
  });

  it('locale が en でも内部推論・Prompt・Evidence・内部エラー型名の語彙を一切含まない', () => {
    for (const status of STATUSES) {
      const notice = providerStatusNotice(status, 'en');
      for (const forbidden of FORBIDDEN_INTERNAL_VOCABULARY) {
        expect(notice.message).not.toContain(forbidden);
      }
    }
  });
});
