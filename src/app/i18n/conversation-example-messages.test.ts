import { describe, expect, it } from 'bun:test';
import { CONVERSATION_EXAMPLE_MESSAGES } from './conversation-example-messages';
import { LOCALES } from './locale';

describe('会話例 Message Catalog（Issue 155）', () => {
  it('ja / en の固定文言と動的文言がすべて非空である', () => {
    for (const locale of LOCALES) {
      const messages = CONVERSATION_EXAMPLE_MESSAGES[locale];
      for (const text of [
        messages.sectionTitle,
        messages.disclosureBanner,
        messages.privacyNotice,
        messages.generateButton,
        messages.generateButtonHint,
        messages.cancelButton,
        messages.cancelButtonHint,
        messages.failedNotice,
        messages.retryButton,
        messages.retryButtonHint,
        messages.regenerateButton,
        messages.regenerateButtonHint,
        messages.ownerLabel,
        messages.peerFallbackLabel,
        messages.generatingStatus(12),
        messages.bubbleAccessibilityLabel(2, 'Peer', 'Hello'),
      ]) {
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('ja / en は Disclosure と経過時間を別々の自然な文言で表す', () => {
    expect(CONVERSATION_EXAMPLE_MESSAGES.ja.disclosureBanner).not.toBe(
      CONVERSATION_EXAMPLE_MESSAGES.en.disclosureBanner
    );
    expect(CONVERSATION_EXAMPLE_MESSAGES.ja.generatingStatus(12)).toContain(
      '12 秒'
    );
    expect(CONVERSATION_EXAMPLE_MESSAGES.en.generatingStatus(12)).toContain(
      '12s'
    );
  });

  it('吹き出しの Accessibility label に順番・話者・本文を含める', () => {
    for (const locale of LOCALES) {
      const label = CONVERSATION_EXAMPLE_MESSAGES[
        locale
      ].bubbleAccessibilityLabel(3, 'Sample Explorer', 'Hello');
      expect(label).toContain('3');
      expect(label).toContain('Sample Explorer');
      expect(label).toContain('Hello');
    }
  });
});
