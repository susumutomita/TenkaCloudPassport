import { describe, expect, it } from 'bun:test';
import {
  createLocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import { RULES_PROVIDER } from '../domain/rules-provider';
import { createLazyLocalAgent, LocalAgentError } from './lazy-local-agent';

function passport(clueId: string) {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: [clueId],
    selectedForPassportClueIds: [clueId],
    languageCodes: [],
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds: [clueId],
    languageCodes: [],
    ownerConfirmed: true,
  });
}

describe('Local Agent の遅延 loader 境界', () => {
  it('最初の同時判定まで module を読み込まず同じ instance で共有する', async () => {
    let loadCount = 0;
    const agent = createLazyLocalAgent(async () => {
      loadCount += 1;
      return {
        async decide(input) {
          return RULES_PROVIDER.decide(input);
        },
      };
    });
    const input = {
      ownerPassport: passport('open-source'),
      encounteredPassport: passport('open-source'),
    };

    expect(loadCount).toBe(0);
    const outcomes = await Promise.all([
      agent.decide(input),
      agent.decide(input),
    ]);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      'bridge',
      'bridge',
    ]);
    expect(loadCount).toBe(1);
  });

  it('module の読み込み失敗を型付きエラーにして次回は再試行する', async () => {
    let loadCount = 0;
    const agent = createLazyLocalAgent(async () => {
      loadCount += 1;
      if (loadCount === 1) throw new Error('Native module を読み込めません。');
      return {
        async decide(input) {
          return RULES_PROVIDER.decide(input);
        },
      };
    });
    const input = {
      ownerPassport: passport('open-source'),
      encounteredPassport: passport('open-source'),
    };

    try {
      await agent.decide(input);
      throw new Error('LocalAgentError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LocalAgentError);
      if (error instanceof LocalAgentError) {
        expect(error.code).toBe('MODULE_LOAD_FAILED');
      }
    }
    expect((await agent.decide(input)).kind).toBe('bridge');
    expect(loadCount).toBe(2);
  });

  it('判定失敗を型付きエラーにして読み込み済み module は再利用する', async () => {
    let loadCount = 0;
    let decisionCount = 0;
    const agent = createLazyLocalAgent(async () => {
      loadCount += 1;
      return {
        async decide(input) {
          decisionCount += 1;
          if (decisionCount === 1) throw new Error('判定に失敗しました。');
          return RULES_PROVIDER.decide(input);
        },
      };
    });
    const input = {
      ownerPassport: passport('open-source'),
      encounteredPassport: passport('open-source'),
    };

    try {
      await agent.decide(input);
      throw new Error('LocalAgentError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LocalAgentError);
      if (error instanceof LocalAgentError) {
        expect(error.code).toBe('DECISION_FAILED');
      }
    }
    expect((await agent.decide(input)).kind).toBe('bridge');
    expect(loadCount).toBe(1);
  });
});
