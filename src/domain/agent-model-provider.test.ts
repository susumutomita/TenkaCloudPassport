import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AgentModelDecision,
  type AgentModelEvidence,
  type AgentModelInput,
  agentModelConfidence,
  buildAgentModelDecisionFromEvidence,
  buildEncounterEvidence,
  RULES_MODEL_PROVIDER,
  rulesAgentModelDecision,
  validateAgentModelProviderOutput,
} from './agent-model-provider';
import {
  CLUE_CATALOG,
  type ClueId,
  isClueId,
  LANGUAGE_CATALOG,
} from './clue-catalog';
import { publicPassportWithClues as passport } from './domain-test-kit';
import type { OwnerAnswerValue } from './match-evidence';
import type { ConfirmedClue } from './passport';

/**
 * Issue 13: Rules Provider を基準実装にする Contract Test。
 * `docs/design/agent-model-provider-contract.md` を正本とする。
 */

interface FixtureInput {
  readonly ownerClueIds: readonly string[];
  readonly encounteredClueIds: readonly string[];
  readonly ownerLanguageCodes: readonly string[];
  readonly encounteredLanguageCodes: readonly string[];
  readonly ownerAnswer: {
    readonly candidateClue: ConfirmedClue;
    readonly answer: OwnerAnswerValue;
  } | null;
  readonly language: 'ja' | 'en';
  readonly deadlineAtWallClockMs: number;
}

interface Fixture {
  readonly name: string;
  readonly input: FixtureInput;
  readonly expected: AgentModelDecision;
}

const FIXTURES_DIR = fileURLToPath(
  new URL('./__fixtures__/agent-model-provider/', import.meta.url)
);

function loadFixtures(): readonly Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(
      (file) =>
        JSON.parse(
          readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')
        ) as Fixture
    );
}

function toAgentModelInput(fixture: FixtureInput): AgentModelInput {
  return {
    ownerPassport: passport(fixture.ownerClueIds, fixture.ownerLanguageCodes),
    encounteredPassport: passport(
      fixture.encounteredClueIds,
      fixture.encounteredLanguageCodes
    ),
    ...(fixture.ownerAnswer ? { ownerAnswer: fixture.ownerAnswer } : {}),
    language: fixture.language,
    deadlineAtWallClockMs: fixture.deadlineAtWallClockMs,
  };
}

const FIXTURES = loadFixtures();

describe('Golden Contract Fixture: RULES_MODEL_PROVIDER が期待どおりの Domain Output を再現する', () => {
  it('Fixture が 1 件以上ある', () => {
    expect(FIXTURES.length).toBeGreaterThan(0);
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.name}: 期待した AgentModelDecision と byte-for-byte 一致する`, () => {
      const actual = rulesAgentModelDecision(toAgentModelInput(fixture.input));
      expect(actual).toEqual(fixture.expected);
    });
  }
});

describe('正常系: Topic・Offer/Need・Language・Owner Answer を組み合わせて Evidence を作る', () => {
  it('Topic 共通と共通 Language の 2 件を組み合わせると promising になる', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['open-source'], ['ja', 'en']),
      encounteredPassport: passport(['open-source'], ['en']),
      language: 'ja',
      deadlineAtWallClockMs: 45_000,
    });
    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect(result.confidence).toBe('promising');
      expect(result.evidenceIds).toEqual(['topic:open-source', 'language:en']);
    }
  });
});

describe('no-signal: Evidence が 0 件のとき捏造せず no-signal を返す', () => {
  it('Topic・Offer/Need・Language・Owner Answer のいずれも無ければ no-signal になる', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
      deadlineAtWallClockMs: 45_000,
    });
    expect(result).toEqual({ kind: 'no-signal' });
  });
});

describe('Owner Pass（分からない / パス）: Evidence を追加しないが、既存 Evidence も打ち消さない', () => {
  it('他に Evidence が無い場合、Owner Pass は no-signal のままになる', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
      ownerAnswer: {
        candidateClue: {
          value: 'community-operations',
          category: 'activity',
          source: 'owner-selected',
        },
        answer: 'decline',
      },
      deadlineAtWallClockMs: 45_000,
    });
    expect(result).toEqual({ kind: 'no-signal' });
  });

  it('Topic 共通が既にある場合、Owner Pass はその Bridge を打ち消さない', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['open-source']),
      ownerAnswer: {
        candidateClue: {
          value: 'community-operations',
          category: 'activity',
          source: 'owner-selected',
        },
        answer: 'no',
      },
      deadlineAtWallClockMs: 45_000,
    });
    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect(result.evidenceIds).toEqual(['topic:open-source']);
    }
  });
});

describe('Owner Answer の去重: 既に計上済みの Clue を owner-confirmed として二重に数えない', () => {
  it('候補が Topic と同じ Clue のとき、Evidence は 1 件のまま Confidence を水増ししない', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['open-source']),
      ownerAnswer: {
        candidateClue: {
          value: 'open-source',
          category: 'interest',
          source: 'owner-selected',
        },
        answer: 'yes',
      },
      deadlineAtWallClockMs: 45_000,
    });
    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect(result.evidenceIds).toEqual(['topic:open-source']);
      expect(result.confidence).toBe('possible');
    }
  });
});

describe('決定性: 同一 Input から byte-for-byte 同じ Domain Output を生成する', () => {
  it('同じ Input を 2 回実行しても同じ結果になる', () => {
    const input: AgentModelInput = {
      ownerPassport: passport(['information-security'], ['ja']),
      encounteredPassport: passport(['product-design'], ['ja']),
      ownerAnswer: {
        candidateClue: {
          value: 'community-operations',
          category: 'activity',
          source: 'owner-selected',
        },
        answer: 'yes',
      },
      language: 'ja',
      deadlineAtWallClockMs: 45_000,
    };
    const first = rulesAgentModelDecision(input);
    const second = rulesAgentModelDecision(input);
    expect(first).toEqual(second);
  });

  it('Rules Provider は Clock を参照しないため、deadlineAtWallClockMs だけが異なる Input でも同じ結果になる', () => {
    const base: AgentModelInput = {
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['open-source']),
      deadlineAtWallClockMs: 45_000,
    };
    const withDifferentDeadline: AgentModelInput = {
      ...base,
      deadlineAtWallClockMs: 999_999_999,
    };
    expect(rulesAgentModelDecision(base)).toEqual(
      rulesAgentModelDecision(withDifferentDeadline)
    );
  });

  it('AgentModelProviderError を絶対に投げない', () => {
    expect(() =>
      rulesAgentModelDecision({
        ownerPassport: passport(['regional-event-operations']),
        encounteredPassport: passport(['accessibility']),
        deadlineAtWallClockMs: 45_000,
      })
    ).not.toThrow();
  });
});

const CLUE_LABELS = Object.entries(CLUE_CATALOG).map(([id, clue]) => ({
  id: id as ClueId,
  label: clue.label,
}));
const LANGUAGE_LABELS = Object.entries(LANGUAGE_CATALOG).map(
  ([code, language]) => ({ code, label: language.label })
);

describe('Input へ存在しない人物名・Skill・地域・関係を出力しない', () => {
  it('reason に登場するカタログ由来の語は、必ず入力（Clue または Language）に含まれる label である', () => {
    for (const fixture of FIXTURES) {
      const result = rulesAgentModelDecision(toAgentModelInput(fixture.input));
      if (result.kind !== 'bridge') continue;

      const inputClueIds = new Set<ClueId>([
        ...fixture.input.ownerClueIds.filter(isClueId),
        ...fixture.input.encounteredClueIds.filter(isClueId),
        ...(fixture.input.ownerAnswer?.answer === 'yes' &&
        isClueId(fixture.input.ownerAnswer.candidateClue.value)
          ? [fixture.input.ownerAnswer.candidateClue.value]
          : []),
      ]);
      const inputLanguageCodes = new Set([
        ...fixture.input.ownerLanguageCodes,
        ...fixture.input.encounteredLanguageCodes,
      ]);

      const mentionedClueLabels = CLUE_LABELS.filter(({ label }) =>
        result.reason.includes(label)
      );
      const mentionedLanguageLabels = LANGUAGE_LABELS.filter(({ label }) =>
        result.reason.includes(label)
      );
      expect(
        mentionedClueLabels.length + mentionedLanguageLabels.length
      ).toBeGreaterThan(0);
      for (const { id } of mentionedClueLabels) {
        expect(inputClueIds.has(id)).toBe(true);
      }
      for (const { code } of mentionedLanguageLabels) {
        expect(inputLanguageCodes.has(code)).toBe(true);
      }
    }
  });
});

describe('JA/EN 固定表現: language パラメータで文面が切り替わる（既定は ja）', () => {
  it('language 未指定のときは日本語になる', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['open-source']),
      deadlineAtWallClockMs: 45_000,
    });
    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect(result.reason).toContain('お互いが');
    }
  });

  it('language: en のときは英語になる', () => {
    const result = rulesAgentModelDecision({
      ownerPassport: passport(['open-source']),
      encounteredPassport: passport(['open-source']),
      language: 'en',
      deadlineAtWallClockMs: 45_000,
    });
    expect(result.kind).toBe('bridge');
    if (result.kind === 'bridge') {
      expect(result.reason).toContain('You both have published');
    }
  });
});

describe('agentModelConfidence / buildAgentModelDecisionFromEvidence: 空 Evidence は型付き失敗を投げる', () => {
  it('agentModelConfidence は空 Evidence で例外を投げる', () => {
    expect(() => agentModelConfidence([])).toThrow(
      'Confidence の判定には 1 件以上の Evidence が必要です。'
    );
  });

  it('buildAgentModelDecisionFromEvidence は空 Evidence で例外を投げる', () => {
    expect(() => buildAgentModelDecisionFromEvidence([], 'ja')).toThrow(
      'Bridge の生成には 1 件以上の Evidence が必要です。'
    );
  });

  it('buildEncounterEvidence は Evidence が無ければ空配列を返す', () => {
    const evidence: readonly AgentModelEvidence[] = buildEncounterEvidence({
      ownerPassport: passport(['regional-event-operations']),
      encounteredPassport: passport(['accessibility']),
      deadlineAtWallClockMs: 45_000,
    });
    expect(evidence).toEqual([]);
  });
});

describe('Provider Output Runtime Schema: Provider は既知 Evidence だけを選べる', () => {
  const input: AgentModelInput = {
    ownerPassport: passport(['open-source'], ['ja']),
    encounteredPassport: passport(['open-source'], ['ja']),
    language: 'ja',
    deadlineAtWallClockMs: 45_000,
  };

  it('Rules Provider の Output も Local Agent と同じ Validator で Decision へ昇格する', () => {
    const output = RULES_MODEL_PROVIDER.provide(input);
    expect(validateAgentModelProviderOutput(input, output)).toEqual(
      rulesAgentModelDecision(input)
    );
  });

  it('Provider が選んだ既知 Evidence から reason・opener・confidence を信頼側で再構築する', () => {
    const decision = validateAgentModelProviderOutput(input, {
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });

    expect(decision).toEqual({
      kind: 'bridge',
      confidence: 'possible',
      evidenceIds: ['topic:open-source'],
      reason:
        'お互いが「オープンソース」という確認済みの共通点を公開しています。',
      opener: '「オープンソース」について話しかけてみましょう。',
    });
  });

  it('URL・Tool Call・Contact・人物特定を未知 Field として Schema 境界で拒否する', () => {
    for (const forbiddenOutput of [
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        url: 'https://example.invalid',
      },
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        toolCall: { name: 'open_url' },
      },
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        contact: 'person@example.invalid',
      },
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        identifiedPerson: 'someone',
      },
    ]) {
      expect(() =>
        validateAgentModelProviderOutput(input, forbiddenOutput)
      ).toThrow('Provider Output Schema');
    }
  });

  it('入力から導出できない Evidence ID は Claim の根拠として採用しない', () => {
    expect(() =>
      validateAgentModelProviderOutput(input, {
        kind: 'bridge',
        evidenceIds: ['topic:information-security'],
      })
    ).toThrow('入力に存在しない Evidence');
  });

  it('空・重複 Evidence は Bridge として採用しない', () => {
    for (const evidenceIds of [
      [],
      ['topic:open-source', 'topic:open-source'],
    ]) {
      expect(() =>
        validateAgentModelProviderOutput(input, {
          kind: 'bridge',
          evidenceIds,
        })
      ).toThrow();
    }
  });

  it('no-signal は kind 以外の Field を持たない場合だけ受理する', () => {
    expect(
      validateAgentModelProviderOutput(input, { kind: 'no-signal' })
    ).toEqual({ kind: 'no-signal' });
    expect(() =>
      validateAgentModelProviderOutput(input, {
        kind: 'no-signal',
        reason: 'raw model output',
      })
    ).toThrow('Provider Output Schema');
  });
});

describe('Platform 非依存: react / react-native / expo に依存しない純 TypeScript の Contract Test', () => {
  it('agent-model-provider.ts のソーステキストは Platform package を import しない', async () => {
    const text = await Bun.file(
      new URL('./agent-model-provider.ts', import.meta.url)
    ).text();
    for (const forbidden of [
      "from 'react'",
      "from 'react-native'",
      "from 'expo",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
