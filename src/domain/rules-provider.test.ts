import { describe, expect, it } from 'bun:test';
import {
  createLocalPrivateProfile,
  type PublicPassport,
  projectPublicPassport,
} from './passport';
import { RULES_PROVIDER } from './rules-provider';

function passport(clueIds: readonly string[]): PublicPassport {
  const profile = createLocalPrivateProfile({
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
  });
  return projectPublicPassport(profile, {
    clueIds,
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
      expect(outcome.bridge.evidence).toEqual(['open-source']);
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
      expect(outcome.bridge.evidence).toHaveLength(1);
      expect(outcome.bridge.evidence[0]).toBe('regional-event-operations');
    }
  });

  it('共通する確認済み手掛かりがないとき no-signal を返す', () => {
    const outcome = RULES_PROVIDER.decide({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
    });

    expect(outcome).toEqual({ kind: 'no-signal' });
  });
});
