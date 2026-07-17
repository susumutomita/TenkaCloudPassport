import { describe, expect, it } from 'bun:test';
import {
  createLocalPrivateProfile,
  type PublicPassport,
  projectPublicPassport,
} from './passport';
import { RULES_PROVIDER } from './rules-provider';

function passport(clueIds: readonly string[]): PublicPassport {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
    languageCodes: [],
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });
}

describe('Rules Provider', () => {
  it('共通する確認済み手掛かりがあるとき主要 Bridge を 1 件返す', () => {
    const outcome = RULES_PROVIDER.decide({
      ownerPassport: passport(['regional-event-operations', 'open-source']),
      encounteredPassport: passport(['open-source', 'accessibility']),
    });

    expect(outcome.kind).toBe('bridge');
    if (outcome.kind === 'bridge') {
      expect(outcome.bridge.evidence.clues.map((clue) => clue.value)).toEqual([
        'open-source',
      ]);
    }
  });

  it('共通項目が複数でもカタログ順の主要 Bridge だけを返す', () => {
    const outcome = RULES_PROVIDER.decide({
      ownerPassport: passport(['open-source', 'regional-event-operations']),
      encounteredPassport: passport([
        'open-source',
        'regional-event-operations',
      ]),
    });

    expect(outcome.kind).toBe('bridge');
    if (outcome.kind === 'bridge') {
      expect(outcome.bridge.evidence.clues).toHaveLength(1);
      expect(outcome.bridge.evidence.clues[0]?.value).toBe(
        'regional-event-operations'
      );
    }
  });

  it('共通する確認済み手掛かりがないとき no-signal を返す', () => {
    const outcome = RULES_PROVIDER.decide({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
    });

    expect(outcome).toEqual({ kind: 'no-signal' });
  });

  describe('Issue 12: Topic 共通が無くても Offer/Need 相互補完で主要 Bridge を返す', () => {
    it('一方の offers ともう一方の lookingFor が同じ category なら Bridge を返す', () => {
      const outcome = RULES_PROVIDER.decide({
        ownerPassport: passport(['information-security']),
        encounteredPassport: passport(['product-design']),
      });

      expect(outcome.kind).toBe('bridge');
      if (outcome.kind === 'bridge') {
        expect(outcome.bridge.messageKey).toBe('offer-need-complement');
        expect(outcome.bridge.evidence.clues.map((clue) => clue.value)).toEqual(
          ['information-security', 'product-design']
        );
      }
    });

    it('category が異なる Offer/Need は相互補完とみなさず no-signal のままになる', () => {
      const outcome = RULES_PROVIDER.decide({
        ownerPassport: passport(['regional-event-operations']),
        encounteredPassport: passport(['product-design']),
      });

      expect(outcome).toEqual({ kind: 'no-signal' });
    });
  });
});
