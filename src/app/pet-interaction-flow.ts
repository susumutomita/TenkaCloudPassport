import type {
  AgentModelDecision,
  AgentModelInput,
} from '../domain/agent-model-provider';
import type { ClockSnapshot } from '../domain/clock-guard';
import type { LanguageCode } from '../domain/clue-catalog';
import type { RulesInteractionDiscoveryProvider } from '../domain/interaction-discovery-provider';
import {
  type ActiveLounge,
  advanceLounge,
  type LoungeState,
} from '../domain/lounge';
import type { OwnerAnswerValue } from '../domain/match-evidence';
import {
  advanceInteraction,
  beginInteraction,
  type InteractionOutcome,
  type PetInteractionState,
  receiveDiscoveryResult,
  receiveOwnerAnswer,
  retireInteraction,
} from '../domain/pet-interaction';
import { materializeAgentModelOutcome } from './agent-model-live-outcome';

/**
 * Issue 11: `src/domain/pet-interaction.ts` の bounded protocol を、Active Lounge の
 * 実判定経路へ配線する App 層。`lounge-reducer.ts` が `lounge.ts` を包むのと同じ役割分担で、
 * Domain の Transition 関数をそのまま呼び出し、React には依存しない純粋関数として提供する。
 *
 * `discovering` は Rules Provider が同期的に確定するため、この Lounge では観測可能な
 * state として保持しない（`beginPetInteraction` の内部でだけ一瞬経由する）。`bridging` /
 * `no-signal` も同様に、確定した瞬間に `retireInteraction` へ委譲し、Lounge 本体の
 * `RetiredLounge` へ収束させる。App 層が実際に保持・表示する `PetInteractionState` は
 * `clarifying`（Owner Question の回答待ち）か `null`（未着手または確定済み）だけになる。
 */
export interface PetInteractionStep {
  readonly interaction: PetInteractionState | null;
  readonly lounge: LoungeState;
}

/**
 * 共通 Agent Model Decision を 2 者間 Live Outcome へ具体化する。Bridge を具体化できない
 * `no-signal` / Language-only は、既存の bounded Rules Discovery と Owner Question を残す。
 */
export function applyAgentModelDecision(
  active: ActiveLounge,
  input: AgentModelInput,
  decision: AgentModelDecision,
  provider: RulesInteractionDiscoveryProvider,
  clock: ClockSnapshot
): PetInteractionStep {
  const outcome = materializeAgentModelOutcome(input, decision);
  if (outcome.kind === 'no-signal') {
    return beginPetInteraction(active, provider, clock);
  }
  return {
    interaction: null,
    lounge: collapseToRetiredLounge(active, outcome),
  };
}

/**
 * 非同期 Provider の確定結果を適用する直前に Lounge 本体の満了を評価する。Provider の Deadline と
 * Lounge expiry が同時に到達した場合は最早の破棄を優先し、結果・Owner Question を生成しない。
 */
export function applyAgentModelDecisionBeforeLoungeExpiry(
  active: ActiveLounge,
  input: AgentModelInput,
  decision: AgentModelDecision,
  provider: RulesInteractionDiscoveryProvider,
  startedClock: ClockSnapshot,
  outcomeClock: ClockSnapshot
): PetInteractionStep {
  const current = advanceLounge(active, outcomeClock);
  if (current.status === 'destroyed') {
    return { interaction: null, lounge: current };
  }
  return applyAgentModelDecision(
    current,
    input,
    decision,
    provider,
    startedClock
  );
}

/**
 * 確定した `InteractionOutcome` を `RetiredLounge` へ収束させる。'cancelled' は
 * Lounge Exit / Expire を扱う `lounge-reducer.ts` / `lounge-room.ts` の Destroy 経路が
 * 既に処理するため、この App 層の 3 関数（`beginPetInteraction` /
 * `submitOwnerQuestionAnswer` / `applyPetInteractionTick`）が渡す `outcome` に
 * 'cancelled' が含まれることは構造的にない。到達したら呼び出し側の前提が壊れているため、
 * 無言で握り潰さず投げる（fail loudly）。
 */
export function collapseToRetiredLounge(
  active: ActiveLounge,
  outcome: InteractionOutcome
): LoungeState {
  if (outcome.kind === 'cancelled') {
    throw new Error(
      'cancelled outcome は Lounge の Destroy 経路が扱うため、この関数の対象外です。'
    );
  }
  return {
    status: 'retired',
    outcome:
      outcome.kind === 'bridge'
        ? { kind: 'bridge', bridge: outcome.bridge }
        : { kind: 'no-signal' },
    expiresAtWallClockMs: active.expiresAtWallClockMs,
    startedAtMonotonicMs: active.startedAtMonotonicMs,
  };
}

/**
 * Owner の「会話の糸を探す」操作 1 回で、discovering → clarifying / no-signal まで進める。
 * Rules Provider は同期関数のため、この呼び出しの中だけで discovering を経由する。
 */
export function beginPetInteraction(
  active: ActiveLounge,
  provider: RulesInteractionDiscoveryProvider,
  clock: ClockSnapshot
): PetInteractionStep {
  const discovering = beginInteraction(clock);
  const result = provider.discover({
    ownerPassport: active.ownerPassport,
    encounteredPassport: active.encounteredPassport,
  });
  const { state } = receiveDiscoveryResult(discovering, result, clock);
  if (state.phase === 'clarifying') {
    return { interaction: state, lounge: active };
  }
  const retired = retireInteraction(state);
  return {
    interaction: null,
    lounge: collapseToRetiredLounge(active, retired.outcome),
  };
}

/**
 * Owner が Owner Question に回答した結果を適用する。`clarifying` 以外（すでに確定済み、
 * または未着手）で呼ばれても状態を変えない、二重送信に対する冪等な no-op。`clarifying` から
 * 呼んだ場合、`receiveOwnerAnswer` は必ず `bridging` か `no-signal`（timeout を含む）へ
 * 確定させる契約（`src/domain/pet-interaction.ts`）のため、この関数はその結果を
 * 直ちに `retireInteraction` で `retired` へ収束させ、Lounge 本体へ委譲する。
 *
 * `language`（既定 `ja`）は Bridge が確定する場合だけ `receiveOwnerAnswer` を経由して
 * Bridge 文言へ反映される。App の表示言語（`src/app/i18n/locale.ts`）をそのまま渡せるよう、
 * 型は Domain の `LanguageCode` を再輸出せずそのまま使う（Issue 15）。
 */
export function submitOwnerQuestionAnswer(
  interaction: PetInteractionState | null,
  active: ActiveLounge,
  answer: OwnerAnswerValue,
  clock: ClockSnapshot,
  language: LanguageCode = 'ja'
): PetInteractionStep {
  if (interaction?.phase !== 'clarifying') {
    return { interaction, lounge: active };
  }
  const { state } = receiveOwnerAnswer(interaction, answer, clock, language);
  const retired = retireInteraction(state);
  return {
    interaction: null,
    lounge: collapseToRetiredLounge(active, retired.outcome),
  };
}

/**
 * Provider / Owner の応答を待たずに 45 秒の締切だけを確認する。Lounge の 1 秒 tick /
 * Background 復帰から呼ぶ。`advanceInteraction` は状態が変化する場合、必ず
 * `no-signal`（timeout）を返す契約（`src/domain/pet-interaction.ts`）のため、締切超過は
 * Owner の応答なしに `retired` へ収束させ、Lounge 本体へ委譲する。
 */
export function applyPetInteractionTick(
  interaction: PetInteractionState | null,
  active: ActiveLounge,
  clock: ClockSnapshot
): PetInteractionStep {
  if (!interaction) return { interaction: null, lounge: active };
  const advanced = advanceInteraction(interaction, clock);
  if (advanced === interaction) return { interaction, lounge: active };
  const retired = retireInteraction(advanced);
  return {
    interaction: null,
    lounge: collapseToRetiredLounge(active, retired.outcome),
  };
}
