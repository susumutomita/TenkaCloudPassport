import { describe, expect, it } from 'bun:test';
import { publicPassportWithClues as passport } from './domain-test-kit';
import { findFirstSharedConfirmedClue } from './shared-clue-match';

describe('共有された確認済み手掛かりの一致判定', () => {
  it('共通する確認済み手掛かりがあるときカタログ順で最初の 1 件を返す', () => {
    const clue = findFirstSharedConfirmedClue({
      ownerPassport: passport(['open-source', 'regional-event-operations']),
      encounteredPassport: passport([
        'regional-event-operations',
        'open-source',
      ]),
    });

    expect(clue?.value).toBe('regional-event-operations');
  });

  it('共通する確認済み手掛かりがなければ undefined を返す', () => {
    const clue = findFirstSharedConfirmedClue({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
    });

    expect(clue).toBeUndefined();
  });
});
