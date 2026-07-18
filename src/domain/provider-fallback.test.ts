import { describe, expect, it } from 'bun:test';
import type {
  AgentModelDecision,
  AgentModelInput,
  AgentModelProvider,
} from './agent-model-provider';
import {
  AgentModelProviderError,
  RULES_MODEL_PROVIDER,
  rulesAgentModelDecision,
} from './agent-model-provider';
import { publicPassportWithClues as passport } from './domain-test-kit';
import {
  attemptProvider,
  EMPTY_PROVIDER_RUN_LEDGER,
  type ProviderRunLedger,
  runProviderOnce,
} from './provider-fallback';

/**
 * Issue 13: Fallback-once semantics のテスト。ここで使う 4 つの Provider は本物の
 * `AgentModelProvider` Port 実装であり（vi.mock 等のモック・スタブではない）、
 * Timeout / Cancel / Schema Error / Load Error それぞれを実際に型付き例外として投げる。
 */
const INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source']),
  encounteredPassport: passport(['open-source']),
  deadlineAtWallClockMs: 45_000,
};

const SUCCESS_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  async provide(input) {
    return RULES_MODEL_PROVIDER.provide(input);
  },
};

const TIMEOUT_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<AgentModelDecision> {
    return Promise.reject(
      new AgentModelProviderError(
        'TIMEOUT',
        'Local Agent が締切内に応答しませんでした。'
      )
    );
  },
};

const SCHEMA_ERROR_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<AgentModelDecision> {
    return Promise.reject(
      new AgentModelProviderError(
        'SCHEMA_ERROR',
        'Local Agent の出力が Bridge Output Schema を満たしませんでした。'
      )
    );
  },
};

const CANCELLED_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<AgentModelDecision> {
    return Promise.reject(
      new AgentModelProviderError(
        'CANCELLED',
        'Local Agent の処理が取り消されました。'
      )
    );
  },
};

const LOAD_ERROR_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<AgentModelDecision> {
    return Promise.reject(
      new AgentModelProviderError(
        'LOAD_ERROR',
        'Local Agent Module を読み込めませんでした。'
      )
    );
  },
};

const UNKNOWN_ERROR_PROVIDER: AgentModelProvider = {
  kind: 'local-agent',
  provide(): Promise<AgentModelDecision> {
    return Promise.reject(new Error('想定外の例外'));
  },
};

function rulesFallback(): AgentModelDecision {
  return rulesAgentModelDecision(INPUT);
}

describe('attemptProvider: Primary Provider の結果を成功 / 型付き失敗へ正規化する', () => {
  it('正常系: 成功したら success として decision をそのまま返す', async () => {
    const result = await attemptProvider(SUCCESS_PROVIDER, INPUT);
    expect(result).toEqual({
      kind: 'success',
      providerKind: 'local-agent',
      decision: rulesAgentModelDecision(INPUT),
    });
  });

  it('期限切れ (timeout): AgentModelProviderError(TIMEOUT) を failure へ正規化する', async () => {
    const result = await attemptProvider(TIMEOUT_PROVIDER, INPUT);
    expect(result).toEqual({
      kind: 'failure',
      providerKind: 'local-agent',
      reason: 'timeout',
    });
  });

  it('Schema Error: AgentModelProviderError(SCHEMA_ERROR) を failure へ正規化する', async () => {
    const result = await attemptProvider(SCHEMA_ERROR_PROVIDER, INPUT);
    expect(result).toEqual({
      kind: 'failure',
      providerKind: 'local-agent',
      reason: 'schema-error',
    });
  });

  it('Cancel: AgentModelProviderError(CANCELLED) を failure へ正規化する', async () => {
    const result = await attemptProvider(CANCELLED_PROVIDER, INPUT);
    expect(result).toEqual({
      kind: 'failure',
      providerKind: 'local-agent',
      reason: 'cancelled',
    });
  });

  it('Load Error: AgentModelProviderError(LOAD_ERROR) を failure へ正規化する', async () => {
    const result = await attemptProvider(LOAD_ERROR_PROVIDER, INPUT);
    expect(result).toEqual({
      kind: 'failure',
      providerKind: 'local-agent',
      reason: 'load-error',
    });
  });

  it('AgentModelProviderError 以外の例外は無言で握り潰さず再送出する', async () => {
    await expect(
      attemptProvider(UNKNOWN_ERROR_PROVIDER, INPUT)
    ).rejects.toThrow('想定外の例外');
  });
});

describe('runProviderOnce: Fallback-once semantics', () => {
  it('正常系: Primary が成功したら switchReason は null で settledBy は primary になる', async () => {
    const attempt = await attemptProvider(SUCCESS_PROVIDER, INPUT);
    const step = runProviderOnce(
      EMPTY_PROVIDER_RUN_LEDGER,
      'encounter-1',
      attempt,
      rulesFallback
    );
    expect(step.outcome.settledBy).toBe('primary');
    expect(step.outcome.providerKind).toBe('local-agent');
    expect(step.outcome.switchReason).toBeNull();
  });

  it('Timeout / Cancel / Schema Error / Load Error のいずれでも Rules へ 1 回だけ切り替わる', async () => {
    for (const [provider, expectedReason] of [
      [TIMEOUT_PROVIDER, 'timeout'],
      [CANCELLED_PROVIDER, 'cancelled'],
      [SCHEMA_ERROR_PROVIDER, 'schema-error'],
      [LOAD_ERROR_PROVIDER, 'load-error'],
    ] as const) {
      const attempt = await attemptProvider(provider, INPUT);
      const step = runProviderOnce(
        EMPTY_PROVIDER_RUN_LEDGER,
        `encounter-${expectedReason}`,
        attempt,
        rulesFallback
      );
      expect(step.outcome.settledBy).toBe('rules-fallback');
      expect(step.outcome.providerKind).toBe('rules');
      expect(step.outcome.switchReason).toBe(expectedReason);
      expect(step.outcome.decision).toEqual(rulesAgentModelDecision(INPUT));
    }
  });

  it('Cancel 相当の遅延イベント: 同じ encounterKey に 2 回目を渡しても確定済み Outcome を上書きしない（idempotency）', async () => {
    const firstAttempt = await attemptProvider(TIMEOUT_PROVIDER, INPUT);
    const first = runProviderOnce(
      EMPTY_PROVIDER_RUN_LEDGER,
      'encounter-cancel',
      firstAttempt,
      rulesFallback
    );
    expect(first.outcome.settledBy).toBe('rules-fallback');

    let fallbackCallCount = 0;
    const secondAttempt = await attemptProvider(SUCCESS_PROVIDER, INPUT);
    const second = runProviderOnce(
      first.ledger,
      'encounter-cancel',
      secondAttempt,
      () => {
        fallbackCallCount += 1;
        return rulesFallback();
      }
    );

    expect(second.outcome).toEqual(first.outcome);
    expect(fallbackCallCount).toBe(0);
  });

  it('別の encounterKey は独立して確定する', async () => {
    const attemptA = await attemptProvider(TIMEOUT_PROVIDER, INPUT);
    const stepA = runProviderOnce(
      EMPTY_PROVIDER_RUN_LEDGER,
      'encounter-a',
      attemptA,
      rulesFallback
    );
    const attemptB = await attemptProvider(SUCCESS_PROVIDER, INPUT);
    const stepB = runProviderOnce(
      stepA.ledger,
      'encounter-b',
      attemptB,
      rulesFallback
    );

    expect(stepB.ledger.size).toBe(2);
    expect(stepB.outcome.settledBy).toBe('primary');
    const ledgerAfterBoth: ProviderRunLedger = stepB.ledger;
    expect(ledgerAfterBoth.get('encounter-a')?.settledBy).toBe(
      'rules-fallback'
    );
  });

  it('Rules Fallback は Primary が失敗したときだけ呼ばれる（成功経路では 1 度も呼ばれない）', async () => {
    let fallbackCallCount = 0;
    const attempt = await attemptProvider(SUCCESS_PROVIDER, INPUT);
    runProviderOnce(
      EMPTY_PROVIDER_RUN_LEDGER,
      'encounter-success-only',
      attempt,
      () => {
        fallbackCallCount += 1;
        return rulesFallback();
      }
    );
    expect(fallbackCallCount).toBe(0);
  });
});

describe('Platform 非依存: react / react-native / expo に依存しない純 TypeScript の Contract Test', () => {
  it('provider-fallback.ts のソーステキストは Platform package を import しない', async () => {
    const text = await Bun.file(
      new URL('./provider-fallback.ts', import.meta.url)
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
