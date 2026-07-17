import { describe, expect, it } from 'bun:test';
import { publicPassportWithClues as passport } from './domain-test-kit';
import { RULES_INTERACTION_PROVIDER } from './interaction-discovery-provider';

describe('Rules Interaction Provider の Discovery', () => {
  it('共通する確認済み手掛かりがあるとき候補と Owner Question を返す', () => {
    const result = RULES_INTERACTION_PROVIDER.discover({
      ownerPassport: passport(['regional-event-operations', 'open-source']),
      encounteredPassport: passport(['open-source', 'accessibility']),
    });

    expect(result.kind).toBe('candidate');
    if (result.kind === 'candidate') {
      expect(result.candidateClue.value).toBe('open-source');
      expect(result.question).toEqual({
        schemaVersion: 1,
        questionId: 'confirm-shared-clue',
        displayText: 'この手掛かりを今回の Lounge で利用してよいですか。',
        purpose: 'canOffer',
      });
    }
  });

  it('共通する確認済み手掛かりがないとき no-signal を返す', () => {
    const result = RULES_INTERACTION_PROVIDER.discover({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
    });

    expect(result).toEqual({ kind: 'no-signal' });
  });

  it('同じ入力には常に同じ結果を返す（決定性）', () => {
    const input = {
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['open-source']),
    };

    const first = RULES_INTERACTION_PROVIDER.discover(input);
    const second = RULES_INTERACTION_PROVIDER.discover(input);

    expect(first).toEqual(second);
  });
});
