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
        messages.peerAiLabel('Sample Explorer'),
        messages.bubbleAccessibilityLabel(2, 'Peer', 'Hello'),
        messages.typingIndicatorLabel('Sample Explorer'),
        messages.endedEarlyNotice,
      ]) {
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('話者ラベルは本人名でなく AI であることを明示する（ADR-0050）', () => {
    for (const locale of LOCALES) {
      const messages = CONVERSATION_EXAMPLE_MESSAGES[locale];
      expect(messages.ownerLabel).toContain('AI');
      expect(messages.peerFallbackLabel).toContain('AI');
      const peerLabel = messages.peerAiLabel('Sample Explorer');
      expect(peerLabel).toContain('Sample Explorer');
      expect(peerLabel).toContain('AI');
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

  it('typing indicator の Accessibility label は誰が入力中かを含める（Issue 169）', () => {
    for (const locale of LOCALES) {
      const label =
        CONVERSATION_EXAMPLE_MESSAGES[locale].typingIndicatorLabel(
          'Sample Explorer'
        );
      expect(label).toContain('Sample Explorer');
    }
  });

  it('ended-early notice は ja / en で別々の自然な文言にする（Issue 169）', () => {
    expect(CONVERSATION_EXAMPLE_MESSAGES.ja.endedEarlyNotice).not.toBe(
      CONVERSATION_EXAMPLE_MESSAGES.en.endedEarlyNotice
    );
  });
});
