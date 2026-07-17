import { describe, expect, it } from 'bun:test';
import {
  createBridge,
  createBridgeFromEvidence,
  createComplementBridge,
} from './bridge';
import { createLocalPrivateProfile, projectPublicPassport } from './passport';

describe('Bridge 生成', () => {
  it('確認済みの共通手掛かり 1 件から口頭会話の理由を生成する', () => {
    const profile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: ['regional-event-operations'],
      selectedForPassportClueIds: ['regional-event-operations'],
      languageCodes: [],
    });
    const passport = projectPublicPassport(profile, {
      includePetName: true,
      includePetEmoji: true,
      includeOwnerAlias: false,
      clueIds: ['regional-event-operations'],
      languageCodes: [],
      ownerConfirmed: true,
    });
    const clue = passport.clues[0];
    if (!clue) throw new Error('確認済みの手掛かりが必要です。');

    const bridge = createBridge(clue);

    expect(bridge.evidence.clues.map((item) => item.value)).toEqual([
      'regional-event-operations',
    ]);
    expect(bridge.message).toContain('地域イベントの運営');
    expect(bridge.message).toContain('話してみませんか');
    expect(bridge.sourceLabels).toEqual(['地域イベントの運営']);
  });

  it('Match Evidence が空の場合は Bridge を生成しない', () => {
    expect(() =>
      createBridgeFromEvidence({ schemaVersion: 1, clues: [] })
    ).toThrow('1 件以上');
  });

  it('Issue 12: Offer/Need 相互補完から双方の手掛かりを Evidence にした Bridge を生成する', () => {
    const offerClue = {
      value: 'information-security',
      category: 'skill',
      source: 'owner-selected',
    } as const;
    const seekClue = {
      value: 'product-design',
      category: 'skill',
      source: 'owner-selected',
    } as const;

    const bridge = createComplementBridge(offerClue, seekClue);

    expect(bridge.messageKey).toBe('offer-need-complement');
    expect(bridge.evidence.clues).toEqual([offerClue, seekClue]);
    expect(bridge.message).toContain('情報セキュリティ');
    expect(bridge.message).toContain('プロダクトデザイン');
    expect(bridge.message).toContain('話してみませんか');
    expect(bridge.sourceLabels).toEqual([
      '情報セキュリティ',
      'プロダクトデザイン',
    ]);
  });

  describe('Issue 15: language を指定すると英語の Bridge 文言を生成する', () => {
    it('createBridge は language 省略時は日本語のまま Byte-for-byte 不変', () => {
      const clue = {
        value: 'regional-event-operations',
        category: 'activity',
        source: 'owner-selected',
      } as const;

      expect(createBridge(clue).message).toBe(
        'お互いが公開した「地域イベントの運営」をきっかけに、話してみませんか。'
      );
    });

    it('createBridge に en を渡すと英語の文言を生成する', () => {
      const clue = {
        value: 'regional-event-operations',
        category: 'activity',
        source: 'owner-selected',
      } as const;

      const bridge = createBridge(clue, 'en');

      expect(bridge.message).toContain('conversation');
      expect(bridge.message).not.toContain('話してみませんか');
    });

    it('createComplementBridge に en を渡すと英語の文言を生成する', () => {
      const offerClue = {
        value: 'information-security',
        category: 'skill',
        source: 'owner-selected',
      } as const;
      const seekClue = {
        value: 'product-design',
        category: 'skill',
        source: 'owner-selected',
      } as const;

      const bridge = createComplementBridge(offerClue, seekClue, 'en');

      expect(bridge.message).toContain('offer');
      expect(bridge.message).toContain('looking for');
      expect(bridge.message).not.toContain('話してみませんか');
    });

    it('createBridgeFromEvidence に en を渡すと英語の文言を生成する', () => {
      const clue = {
        value: 'regional-event-operations',
        category: 'activity',
        source: 'owner-selected',
      } as const;

      const bridge = createBridgeFromEvidence(
        { schemaVersion: 1, clues: [clue] },
        'en'
      );

      expect(bridge.message).toContain('conversation');
    });
  });

  describe('Issue 15: 原文（sourceLabels）と端末内生成の補助文（message）を区別できる', () => {
    it('createBridge は language を変えても sourceLabels は変わらない（Clue Label は翻訳しない）', () => {
      const clue = {
        value: 'regional-event-operations',
        category: 'activity',
        source: 'owner-selected',
      } as const;

      const ja = createBridge(clue);
      const en = createBridge(clue, 'en');

      expect(ja.sourceLabels).toEqual(en.sourceLabels);
      expect(ja.sourceLabels).toEqual(['地域イベントの運営']);
      expect(ja.message).not.toBe(en.message);
    });

    it('createComplementBridge の sourceLabels は Offer・Need の順で 2 件とも原文のまま持つ', () => {
      const offerClue = {
        value: 'information-security',
        category: 'skill',
        source: 'owner-selected',
      } as const;
      const seekClue = {
        value: 'product-design',
        category: 'skill',
        source: 'owner-selected',
      } as const;

      const bridge = createComplementBridge(offerClue, seekClue, 'en');

      expect(bridge.sourceLabels).toEqual([
        '情報セキュリティ',
        'プロダクトデザイン',
      ]);
    });

    it('createBridgeFromEvidence の sourceLabels は Evidence の Clue Label をそのまま持つ', () => {
      const clue = {
        value: 'accessibility',
        category: 'skill',
        source: 'owner-selected',
      } as const;

      const bridge = createBridgeFromEvidence(
        { schemaVersion: 1, clues: [clue] },
        'en'
      );

      expect(bridge.sourceLabels).toEqual(['アクセシビリティ']);
      expect(bridge.message).toContain('アクセシビリティ');
    });
  });
});
