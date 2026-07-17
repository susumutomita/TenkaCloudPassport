import { describe, expect, it } from 'bun:test';
import type { ClockSnapshot } from '../domain/clock-guard';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { RULES_INTERACTION_PROVIDER } from '../domain/interaction-discovery-provider';
import { startLounge } from '../domain/lounge';
import {
  beginInteraction,
  INTERACTION_DEADLINE_MS,
  receiveDiscoveryResult,
} from '../domain/pet-interaction';
import {
  applyPetInteractionTick,
  beginPetInteraction,
  collapseToRetiredLounge,
  submitOwnerQuestionAnswer,
} from './pet-interaction-flow';

const CLOCK: ClockSnapshot = { wallClockMs: 1_000_000, monotonicMs: 5_000 };

function afterDeadline(clock: ClockSnapshot): ClockSnapshot {
  return {
    wallClockMs: clock.wallClockMs + INTERACTION_DEADLINE_MS,
    monotonicMs: clock.monotonicMs + INTERACTION_DEADLINE_MS,
  };
}

function activeLounge(
  ownerClues: readonly string[],
  encounteredClues: readonly string[]
) {
  const active = startLounge({
    ownerPassport: passport(ownerClues),
    encounteredPassport: passport(encounteredClues),
    clock: CLOCK,
  });
  if (active.status !== 'active') throw new Error('active が必要です。');
  return active;
}

describe('Pet Interaction を Active Lounge の実判定経路へ配線する App 層', () => {
  describe('beginPetInteraction: 開始操作 1 回で discovering → clarifying / no-signal(retired) まで進める', () => {
    it('共有手掛かりに候補があれば clarifying を保ったまま Lounge は active のまま', () => {
      const active = activeLounge(
        ['regional-event-operations', 'open-source'],
        ['open-source', 'accessibility']
      );

      const step = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      );

      expect(step.interaction?.phase).toBe('clarifying');
      expect(step.lounge).toBe(active);
      if (step.interaction?.phase === 'clarifying') {
        expect(step.interaction.candidateClue.value).toBe('open-source');
        expect(step.interaction.question.purpose).toBe('canOffer');
      }
    });

    it('共有手掛かりがなければ discovering から直接 retired(no-signal) へ収束し Lounge も retired になる', () => {
      const active = activeLounge(
        ['regional-event-operations'],
        ['accessibility']
      );

      const step = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      );

      expect(step.interaction).toBeNull();
      expect(step.lounge.status).toBe('retired');
      if (step.lounge.status === 'retired') {
        expect(step.lounge.outcome).toEqual({ kind: 'no-signal' });
        expect(step.lounge.expiresAtWallClockMs).toBe(
          active.expiresAtWallClockMs
        );
        expect(step.lounge.startedAtMonotonicMs).toBe(
          active.startedAtMonotonicMs
        );
      }
    });
  });

  describe('submitOwnerQuestionAnswer: 答えが Peer 共有（yes）なら Bridge を伴う retired へ収束する', () => {
    it('yes は Bridge Evidence へ昇格し retired(bridge) の Lounge を返す', () => {
      const active = activeLounge(['open-source'], ['open-source']);
      const clarifying = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      ).interaction;
      if (clarifying?.phase !== 'clarifying') throw new Error('unreachable');

      const step = submitOwnerQuestionAnswer(clarifying, active, 'yes', CLOCK);

      expect(step.interaction).toBeNull();
      expect(step.lounge.status).toBe('retired');
      if (step.lounge.status === 'retired') {
        expect(step.lounge.outcome.kind).toBe('bridge');
      }
    });

    it('分からない（no）は Agent を止めずに retired(no-signal) へ進む', () => {
      const active = activeLounge(['open-source'], ['open-source']);
      const clarifying = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      ).interaction;
      if (clarifying?.phase !== 'clarifying') throw new Error('unreachable');

      const step = submitOwnerQuestionAnswer(clarifying, active, 'no', CLOCK);

      expect(step.interaction).toBeNull();
      expect(step.lounge.status).toBe('retired');
      if (step.lounge.status === 'retired') {
        expect(step.lounge.outcome).toEqual({ kind: 'no-signal' });
      }
    });

    it('パス（decline）も Agent を止めずに retired(no-signal) へ進む', () => {
      const active = activeLounge(['open-source'], ['open-source']);
      const clarifying = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      ).interaction;
      if (clarifying?.phase !== 'clarifying') throw new Error('unreachable');

      const step = submitOwnerQuestionAnswer(
        clarifying,
        active,
        'decline',
        CLOCK
      );

      expect(step.interaction).toBeNull();
      expect(step.lounge.status).toBe('retired');
      if (step.lounge.status === 'retired') {
        expect(step.lounge.outcome).toEqual({ kind: 'no-signal' });
      }
    });

    describe('二重送信: すでに確定した後に再送しても状態を変えない（Question Budget を超えない）', () => {
      it('interaction が null（すでに確定済み）なら何もしない', () => {
        const active = activeLounge(['open-source'], ['open-source']);

        const step = submitOwnerQuestionAnswer(null, active, 'yes', CLOCK);

        expect(step).toEqual({ interaction: null, lounge: active });
      });

      it('clarifying 以外の phase では何もしない（waiting のまま）', () => {
        const active = activeLounge(['open-source'], ['open-source']);
        const discovering = beginInteraction(CLOCK);

        const step = submitOwnerQuestionAnswer(
          discovering,
          active,
          'yes',
          CLOCK
        );

        expect(step).toEqual({ interaction: discovering, lounge: active });
      });
    });
  });

  describe('applyPetInteractionTick: 45 秒締切超過は Owner の応答を待たず timeout(no-signal) へ収束する', () => {
    it('締切超過で timeout の retired へ収束し Lounge も retired になる', () => {
      const active = activeLounge(['open-source'], ['open-source']);
      const clarifying = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      ).interaction;
      if (clarifying?.phase !== 'clarifying') throw new Error('unreachable');

      const step = applyPetInteractionTick(
        clarifying,
        active,
        afterDeadline(CLOCK)
      );

      expect(step.interaction).toBeNull();
      expect(step.lounge.status).toBe('retired');
      if (step.lounge.status === 'retired') {
        expect(step.lounge.outcome).toEqual({ kind: 'no-signal' });
      }
    });

    it('締切前は状態を変えない', () => {
      const active = activeLounge(['open-source'], ['open-source']);
      const clarifying = beginPetInteraction(
        active,
        RULES_INTERACTION_PROVIDER,
        CLOCK
      ).interaction;
      if (clarifying?.phase !== 'clarifying') throw new Error('unreachable');

      const step = applyPetInteractionTick(clarifying, active, CLOCK);

      expect(step).toEqual({ interaction: clarifying, lounge: active });
    });

    it('interaction が null（未開始）なら何もしない', () => {
      const active = activeLounge(['open-source'], ['open-source']);

      const step = applyPetInteractionTick(null, active, CLOCK);

      expect(step).toEqual({ interaction: null, lounge: active });
    });

    it('discovering のまま締切を超えても no-signal(timeout) へ収束する', () => {
      const active = activeLounge(['open-source'], ['open-source']);
      const discovering = beginInteraction(CLOCK);

      const step = applyPetInteractionTick(
        discovering,
        active,
        afterDeadline(CLOCK)
      );

      expect(step.interaction).toBeNull();
      expect(step.lounge.status).toBe('retired');
    });
  });

  describe('決定性: 同じ入力からは同じ Lounge 結果になる', () => {
    it('discover から Owner の yes までの一連の遷移を 2 回実行しても同じ Bridge になる', () => {
      function run() {
        const active = activeLounge(['open-source'], ['open-source']);
        const clarifying = beginPetInteraction(
          active,
          RULES_INTERACTION_PROVIDER,
          CLOCK
        ).interaction;
        if (clarifying?.phase !== 'clarifying') throw new Error('unreachable');
        return submitOwnerQuestionAnswer(clarifying, active, 'yes', CLOCK);
      }

      expect(run().lounge).toEqual(run().lounge);
    });
  });
});

describe('collapseToRetiredLounge: cancelled outcome はこの関数の対象外である', () => {
  it("'cancelled' な outcome を渡すと fail loudly（無言で握り潰さず throw）する", () => {
    const active = activeLounge(['open-source'], ['open-source']);

    expect(() =>
      collapseToRetiredLounge(active, {
        kind: 'cancelled',
        reason: 'lounge-exit',
      })
    ).toThrow('この関数の対象外です');
  });
});

describe('receiveDiscoveryResult との一貫性（回帰防止）', () => {
  it('beginPetInteraction は discover の結果をそのまま clarifying へ渡す', () => {
    const active = activeLounge(['open-source'], ['open-source']);
    const discovering = beginInteraction(CLOCK);
    const result = RULES_INTERACTION_PROVIDER.discover({
      ownerPassport: active.ownerPassport,
      encounteredPassport: active.encounteredPassport,
    });
    const expected = receiveDiscoveryResult(discovering, result, CLOCK).state;

    const step = beginPetInteraction(active, RULES_INTERACTION_PROVIDER, CLOCK);

    expect(step.interaction).toEqual(expected);
  });
});
