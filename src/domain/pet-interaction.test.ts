import { describe, expect, it } from 'bun:test';
import type { ClockSnapshot } from './clock-guard';
import { publicPassportWithClues as passport } from './domain-test-kit';
import { RULES_INTERACTION_PROVIDER } from './interaction-discovery-provider';
import {
  advanceInteraction,
  beginInteraction,
  buildConsentedEvidence,
  cancelInteraction,
  INITIAL_PET_INTERACTION_STATE,
  INTERACTION_DEADLINE_MS,
  PetInteractionError,
  type PetInteractionState,
  receiveDiscoveryResult,
  receiveOwnerAnswer,
  reducePetInteraction,
  retireInteraction,
} from './pet-interaction';

const CLOCK: ClockSnapshot = { wallClockMs: 1_000_000, monotonicMs: 5_000 };

function afterDeadline(clock: ClockSnapshot): ClockSnapshot {
  return {
    wallClockMs: clock.wallClockMs + INTERACTION_DEADLINE_MS,
    monotonicMs: clock.monotonicMs + INTERACTION_DEADLINE_MS,
  };
}

function expectInteractionError(
  action: () => void,
  code: PetInteractionError['code']
): void {
  try {
    action();
    throw new Error('PetInteractionError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(PetInteractionError);
    if (error instanceof PetInteractionError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('Pet Interaction の bounded protocol', () => {
  describe('正常系: 共有手掛かりに Owner が同意すると bridging を経て retired になる', () => {
    it('waiting から discovering、clarifying、bridging、retired の順に遷移する', () => {
      const ownerPassport = passport([
        'regional-event-operations',
        'open-source',
      ]);
      const encounteredPassport = passport(['open-source', 'accessibility']);

      const discovering = reducePetInteraction(INITIAL_PET_INTERACTION_STATE, {
        type: 'begin',
        clock: CLOCK,
      });
      expect(discovering.phase).toBe('discovering');

      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport,
        encounteredPassport,
      });
      const clarifying = reducePetInteraction(discovering, {
        type: 'discovery-result',
        result: discoveryResult,
        clock: CLOCK,
      });
      expect(clarifying.phase).toBe('clarifying');
      if (clarifying.phase !== 'clarifying') throw new Error('unreachable');
      expect(clarifying.candidateClue.value).toBe('open-source');
      expect(clarifying.question.questionId).toBe('confirm-shared-clue');

      const bridging = reducePetInteraction(clarifying, {
        type: 'owner-answer',
        answer: 'yes',
        clock: CLOCK,
      });
      expect(bridging.phase).toBe('bridging');
      if (bridging.phase !== 'bridging') throw new Error('unreachable');
      expect(bridging.bridge.evidence.clues.map((clue) => clue.value)).toEqual([
        'open-source',
      ]);
      expect(bridging.bridge.evidence.ownerAnswer).toEqual({
        questionId: 'confirm-shared-clue',
        answer: 'yes',
        sharingConsent: true,
      });

      const retired = reducePetInteraction(bridging, { type: 'retire' });
      expect(retired).toEqual({
        phase: 'retired',
        outcome: { kind: 'bridge', bridge: bridging.bridge },
      });
    });
  });

  describe('情報不足: 共有手掛かりがないとき discovering から直接 no-signal になる', () => {
    it('candidate が見つからなければ clarifying を経由せず no-signal になる', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['regional-event-operations']),
        encounteredPassport: passport(['accessibility']),
      });

      const { state, applied } = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      );

      expect(applied).toBe(true);
      expect(state).toEqual({
        phase: 'no-signal',
        reason: 'insufficient-information',
      });
      expect(retireInteraction(state)).toEqual({
        phase: 'retired',
        outcome: { kind: 'no-signal', reason: 'insufficient-information' },
      });
    });
  });

  describe('根拠不足: 候補はあっても Owner が同意しないと no-signal になる', () => {
    it('Owner が no と答えると候補を Bridge Evidence へ昇格せず no-signal になる', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifyingApplication = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      );
      expect(clarifyingApplication.state.phase).toBe('clarifying');

      const { state, applied } = receiveOwnerAnswer(
        clarifyingApplication.state,
        'no',
        CLOCK
      );

      expect(applied).toBe(true);
      expect(state).toEqual({
        phase: 'no-signal',
        reason: 'insufficient-evidence',
      });
    });

    it('Owner が decline しても候補を Bridge Evidence へ昇格しない', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifying = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;

      const { state } = receiveOwnerAnswer(clarifying, 'decline', CLOCK);

      expect(state).toEqual({
        phase: 'no-signal',
        reason: 'insufficient-evidence',
      });
    });

    it('未確認情報（yes 以外の回答）を Bridge Evidence へ直接昇格させる呼び出しは型付きエラーになる', () => {
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      if (discoveryResult.kind !== 'candidate') throw new Error('unreachable');

      expectInteractionError(
        () => buildConsentedEvidence(discoveryResult.candidateClue, 'no'),
        'INVALID_TRANSITION'
      );
      expectInteractionError(
        () => buildConsentedEvidence(discoveryResult.candidateClue, 'decline'),
        'INVALID_TRANSITION'
      );
    });
  });

  describe('Provider Timeout: 45 秒経過時は必ず no-signal(timeout) へ収束する', () => {
    it('discovering 中に締切を超えると tick だけで no-signal(timeout) になる', () => {
      const discovering = beginInteraction(CLOCK);

      const advanced = advanceInteraction(discovering, afterDeadline(CLOCK));

      expect(advanced).toEqual({ phase: 'no-signal', reason: 'timeout' });
    });

    it('締切超過後に届いた discovering の結果は適用されず timeout として破棄される', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });

      const { state, applied } = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        afterDeadline(CLOCK)
      );

      expect(applied).toBe(false);
      expect(state).toEqual({ phase: 'no-signal', reason: 'timeout' });
    });

    it('clarifying 中に締切を超えると Owner の回答は適用されず timeout になる', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifying = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;

      const { state, applied } = receiveOwnerAnswer(
        clarifying,
        'yes',
        afterDeadline(CLOCK)
      );

      expect(applied).toBe(false);
      expect(state).toEqual({ phase: 'no-signal', reason: 'timeout' });
    });

    it('bridging / no-signal / retired / waiting では tick は状態を変えない', () => {
      const states: readonly PetInteractionState[] = [
        INITIAL_PET_INTERACTION_STATE,
        { phase: 'no-signal', reason: 'insufficient-information' },
        {
          phase: 'retired',
          outcome: { kind: 'no-signal', reason: 'insufficient-information' },
        },
      ];
      for (const state of states) {
        expect(advanceInteraction(state, afterDeadline(CLOCK))).toEqual(state);
      }
    });
  });

  describe('Cancel: Lounge Expire / Exit により直ちに retired へ収束し、遅延 Output を破棄する', () => {
    it('discovering 中の Cancel は直ちに retired(cancelled) になる', () => {
      const discovering = beginInteraction(CLOCK);

      const retired = cancelInteraction(discovering, 'lounge-expired');

      expect(retired).toEqual({
        phase: 'retired',
        outcome: { kind: 'cancelled', reason: 'lounge-expired' },
      });
    });

    it('bridging 中の Cancel は確定済みの Bridge を上書きせず retired(bridge) になる', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifying = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;
      const bridging = receiveOwnerAnswer(clarifying, 'yes', CLOCK).state;
      if (bridging.phase !== 'bridging') throw new Error('unreachable');

      const retired = cancelInteraction(bridging, 'lounge-expired');

      expect(retired).toEqual({
        phase: 'retired',
        outcome: { kind: 'bridge', bridge: bridging.bridge },
      });
    });

    it('no-signal 中の Cancel は確定済みの理由を上書きせず retired(no-signal) になる', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['regional-event-operations']),
        encounteredPassport: passport(['accessibility']),
      });

      const noSignal = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;
      const retired = cancelInteraction(noSignal, 'lounge-exit');

      expect(retired).toEqual({
        phase: 'retired',
        outcome: { kind: 'no-signal', reason: 'insufficient-information' },
      });
    });

    it('Cancel 後に届く discovering の結果は破棄され retired のままになる', () => {
      const discovering = beginInteraction(CLOCK);
      const cancelled = cancelInteraction(discovering, 'lounge-exit');
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });

      const { state, applied } = receiveDiscoveryResult(
        cancelled,
        discoveryResult,
        CLOCK
      );

      expect(applied).toBe(false);
      expect(state).toEqual(cancelled);
    });

    it('clarifying 中に Cancel された後の Owner 回答は破棄される', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifying = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;
      const cancelled = cancelInteraction(clarifying, 'lounge-expired');

      const { state, applied } = receiveOwnerAnswer(cancelled, 'yes', CLOCK);

      expect(applied).toBe(false);
      expect(state).toEqual(cancelled);
    });

    it('確定済みの結果より後に Cancel が届いても最初の終了理由を維持する', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifying = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;
      const bridging = receiveOwnerAnswer(clarifying, 'yes', CLOCK).state;
      const retired = retireInteraction(bridging);

      const cancelledAfterRetired = cancelInteraction(
        retired,
        'lounge-expired'
      );

      expect(cancelledAfterRetired).toEqual(retired);
      expect(retired.outcome.kind).toBe('bridge');
    });

    it('reducePetInteraction の cancel Action はどのフェーズからも retired へ収束する', () => {
      const discovering = reducePetInteraction(INITIAL_PET_INTERACTION_STATE, {
        type: 'begin',
        clock: CLOCK,
      });

      const cancelled = reducePetInteraction(discovering, {
        type: 'cancel',
        reason: 'lounge-expired',
      });

      expect(cancelled).toEqual({
        phase: 'retired',
        outcome: { kind: 'cancelled', reason: 'lounge-expired' },
      });
    });
  });

  describe('Invalid Transition: 各 State が受け付けない Input は無視または型付きエラーになる', () => {
    it('waiting 以外から begin すると型付きエラーになる', () => {
      const discovering = beginInteraction(CLOCK);

      expectInteractionError(
        () =>
          reducePetInteraction(discovering, { type: 'begin', clock: CLOCK }),
        'INVALID_TRANSITION'
      );
    });

    it('bridging / no-signal 以外から retire すると型付きエラーになる', () => {
      expectInteractionError(
        () => retireInteraction(INITIAL_PET_INTERACTION_STATE),
        'INVALID_TRANSITION'
      );
      expectInteractionError(
        () => retireInteraction(beginInteraction(CLOCK)),
        'INVALID_TRANSITION'
      );
    });

    it('すでに retired な結果へ retire しても同じ結果を保つ', () => {
      const retired = retireInteraction({
        phase: 'no-signal',
        reason: 'insufficient-information',
      });

      expect(retireInteraction(retired)).toEqual(retired);
    });

    it('無効な時計は INVALID_CLOCK になる', () => {
      const invalidClock: ClockSnapshot = {
        wallClockMs: Number.NaN,
        monotonicMs: 0,
      };

      expectInteractionError(
        () => beginInteraction(invalidClock),
        'INVALID_CLOCK'
      );
      expectInteractionError(
        () =>
          receiveDiscoveryResult(
            beginInteraction(CLOCK),
            { kind: 'no-signal' },
            invalidClock
          ),
        'INVALID_CLOCK'
      );
    });

    it('waiting 中に discovery-result / owner-answer を受け取っても何も適用されない', () => {
      const { state: afterDiscovery, applied: discoveryApplied } =
        receiveDiscoveryResult(
          INITIAL_PET_INTERACTION_STATE,
          { kind: 'no-signal' },
          CLOCK
        );
      const { state: afterAnswer, applied: answerApplied } = receiveOwnerAnswer(
        INITIAL_PET_INTERACTION_STATE,
        'yes',
        CLOCK
      );

      expect(discoveryApplied).toBe(false);
      expect(afterDiscovery).toEqual(INITIAL_PET_INTERACTION_STATE);
      expect(answerApplied).toBe(false);
      expect(afterAnswer).toEqual(INITIAL_PET_INTERACTION_STATE);
    });

    it('discovering 中に owner-answer を受け取っても適用されない（Schema で限定された Input）', () => {
      const discovering = beginInteraction(CLOCK);

      const { state, applied } = receiveOwnerAnswer(discovering, 'yes', CLOCK);

      expect(applied).toBe(false);
      expect(state).toEqual(discovering);
    });

    it('clarifying 中に discovery-result を受け取っても適用されない（Schema で限定された Input）', () => {
      const discovering = beginInteraction(CLOCK);
      const discoveryResult = RULES_INTERACTION_PROVIDER.discover({
        ownerPassport: passport(['open-source']),
        encounteredPassport: passport(['open-source']),
      });
      const clarifying = receiveDiscoveryResult(
        discovering,
        discoveryResult,
        CLOCK
      ).state;

      const { state, applied } = receiveDiscoveryResult(
        clarifying,
        discoveryResult,
        CLOCK
      );

      expect(applied).toBe(false);
      expect(state).toEqual(clarifying);
    });
  });

  describe('決定性: 同じ Input と Rules Provider では同じ Decision になる', () => {
    it('同じ Passport の組で 2 回実行しても同じ retired 結果になる', () => {
      function run(): PetInteractionState {
        const ownerPassport = passport([
          'regional-event-operations',
          'open-source',
        ]);
        const encounteredPassport = passport(['open-source', 'accessibility']);
        const discovering = reducePetInteraction(
          INITIAL_PET_INTERACTION_STATE,
          { type: 'begin', clock: CLOCK }
        );
        const result = RULES_INTERACTION_PROVIDER.discover({
          ownerPassport,
          encounteredPassport,
        });
        const clarifying = reducePetInteraction(discovering, {
          type: 'discovery-result',
          result,
          clock: CLOCK,
        });
        const bridging = reducePetInteraction(clarifying, {
          type: 'owner-answer',
          answer: 'yes',
          clock: CLOCK,
        });
        return reducePetInteraction(bridging, { type: 'retire' });
      }

      expect(run()).toEqual(run());
    });
  });
});
