import {
  type AgentModelDecision,
  type AgentModelInput,
  type AgentModelProvider,
  AgentModelProviderError,
  type AgentModelProviderOptions,
  assertAgentModelProviderCapability,
  normalizeAgentModelFailureCode,
  validateAgentModelProviderOutput,
} from './agent-model-provider';

/**
 * Local Agent の Timeout / Cancel / Schema Error / Load Error 後、重複 Bridge を出さず
 * Rules へ 1 回だけ切り替える Fallback-once semantics。`docs/design/agent-model-provider-contract.md`
 * の「失敗の 4 種類と Fallback-once」を正本とする。
 */

/** Provider 切替理由。内容を持たない閉じた enum で、UI（`provider-status-notice.ts`）は
 * この値だけを表示し、Evidence や Chain of Thought を一切表示しない。 */
export type ProviderSwitchReason =
  | 'timeout'
  | 'cancelled'
  | 'schema-error'
  | 'load-error';

/**
 * 網羅的な switch にすることで、`AgentModelFailureCode` へ将来新しい値が増えた場合に
 * このマッピングの更新漏れをコンパイルエラーとして検出する。
 */
function switchReasonFromFailureCode(value: unknown): ProviderSwitchReason {
  const code = normalizeAgentModelFailureCode(value);
  switch (code) {
    case 'TIMEOUT':
      return 'timeout';
    case 'CANCELLED':
      return 'cancelled';
    case 'SCHEMA_ERROR':
      return 'schema-error';
    case 'LOAD_ERROR':
      return 'load-error';
  }
}

export type ProviderAttemptResult =
  | {
      readonly kind: 'success';
      readonly providerKind: AgentModelProvider['kind'];
      readonly decision: AgentModelDecision;
    }
  | {
      readonly kind: 'failure';
      readonly providerKind: AgentModelProvider['kind'];
      readonly reason: ProviderSwitchReason;
      /** Native release が失敗し、Process 再起動まで次 Context を開始できない。 */
      readonly nativeLaneQuarantined?: true;
    };

/**
 * Primary Provider（将来の Local Agent）を 1 回呼び出し、成功か型付き失敗かへ正規化する
 * 非同期境界。`AgentModelProviderError` だけを Fallback 対象の型付き失敗として扱い、
 * それ以外の未知の例外は無言で握り潰さず再送出する（fail loudly）。
 */
export async function attemptProvider(
  provider: AgentModelProvider,
  input: AgentModelInput,
  options?: AgentModelProviderOptions
): Promise<ProviderAttemptResult> {
  try {
    assertAgentModelProviderCapability(provider);
    const output = await provider.provide(input, options);
    const decision = validateAgentModelProviderOutput(input, output);
    return { kind: 'success', providerKind: provider.kind, decision };
  } catch (error) {
    if (error instanceof AgentModelProviderError) {
      return {
        kind: 'failure',
        providerKind: provider.kind,
        reason: switchReasonFromFailureCode(error.code),
        ...(error.nativeLaneQuarantined
          ? { nativeLaneQuarantined: true as const }
          : {}),
      };
    }
    throw error;
  }
}

export interface ProviderRunOutcome {
  readonly decision: AgentModelDecision;
  readonly settledBy: 'primary' | 'rules-fallback';
  readonly providerKind: AgentModelProvider['kind'];
  /** `null` は Primary がそのまま採用されたことを示す（切替なし）。 */
  readonly switchReason: ProviderSwitchReason | null;
}

/** `encounterKey`（Lounge / Encounter を一意に指す文字列）ごとに確定済みの Outcome を持つ。 */
export type ProviderRunLedger = ReadonlyMap<string, ProviderRunOutcome>;

export const EMPTY_PROVIDER_RUN_LEDGER: ProviderRunLedger = new Map();

export interface ProviderRunStep {
  readonly ledger: ProviderRunLedger;
  readonly outcome: ProviderRunOutcome;
}

/**
 * Fallback-once の純粋な Runner（同期・副作用なし）。同じ `encounterKey` に対しては、
 * 一度確定した Outcome を二度と再計算・上書きしない。Local Agent の Timeout / Cancel /
 * Schema Error / Load Error 後に届く遅延イベントや重複イベントが、
 * 確定済みの Bridge / `no-signal` を上書きしたり Rules Provider を再度呼び出したりしない
 * （`pet-interaction.ts` の「最も早い Event が理由を決める」原則と同じ idempotency）。
 * `computeRulesFallback` は thunk のため、Primary が成功した経路では一度も呼ばれない。
 */
export function runProviderOnce(
  ledger: ProviderRunLedger,
  encounterKey: string,
  attempt: ProviderAttemptResult,
  computeRulesFallback: () => AgentModelDecision
): ProviderRunStep {
  const existing = ledger.get(encounterKey);
  if (existing) {
    return { ledger, outcome: existing };
  }
  const outcome: ProviderRunOutcome =
    attempt.kind === 'success'
      ? {
          decision: attempt.decision,
          settledBy: 'primary',
          providerKind: attempt.providerKind,
          switchReason: null,
        }
      : {
          decision: computeRulesFallback(),
          settledBy: 'rules-fallback',
          providerKind: 'rules',
          switchReason: attempt.reason,
        };
  const nextLedger = new Map(ledger);
  nextLedger.set(encounterKey, outcome);
  return { ledger: nextLedger, outcome };
}
