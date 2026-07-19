import { describe, expect, it } from 'bun:test';
import type {
  AgentModelDecision,
  AgentModelInput,
} from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { materializeAgentModelOutcome } from './agent-model-live-outcome';

function input(
  ownerClues: readonly string[],
  encounteredClues: readonly string[],
  ownerLanguages: readonly string[] = [],
  encounteredLanguages: readonly string[] = []
): AgentModelInput {
  return {
    ownerPassport: passport(ownerClues, ownerLanguages),
    encounteredPassport: passport(encounteredClues, encounteredLanguages),
    language: 'ja',
    deadlineAtWallClockMs: 4_102_444_800_000,
  };
}

function bridgeDecision(evidenceIds: readonly string[]): AgentModelDecision {
  return {
    kind: 'bridge',
    reason: '信頼側で再構築済み',
    opener: '信頼側で再構築済み',
    evidenceIds,
    confidence: 'promising',
  };
}

describe('Agent Model Decision の Live Outcome 変換', () => {
  it('選択済み shared-topic Evidence を既存 Bridge constructor で具体化する', () => {
    const outcome = materializeAgentModelOutcome(
      input(['open-source'], ['open-source']),
      bridgeDecision(['topic:open-source'])
    );

    expect(outcome.kind).toBe('bridge');
    if (outcome.kind === 'bridge') {
      expect(outcome.bridge.messageKey).toBe('shared-clue');
      expect(outcome.bridge.evidence.clues.map((clue) => clue.value)).toEqual([
        'open-source',
      ]);
    }
  });

  it('選択済み Offer / Need Evidence を既存 Complement Bridge で具体化する', () => {
    const encounter = input(['cloud-infrastructure'], ['product-design']);
    const evidenceId = 'complement:skill:cloud-infrastructure:product-design';
    const outcome = materializeAgentModelOutcome(
      encounter,
      bridgeDecision([evidenceId])
    );

    expect(outcome.kind).toBe('bridge');
    if (outcome.kind === 'bridge') {
      expect(outcome.bridge.messageKey).toBe('offer-need-complement');
      expect(outcome.bridge.evidence.clues).toHaveLength(2);
    }
  });

  it('Owner が同意した Evidence を既存 Bridge で具体化する', () => {
    const ownerPassport = passport(['open-source']);
    const candidateClue = ownerPassport.clues[0];
    if (!candidateClue) throw new Error('候補手掛かりが必要です。');
    const encounter: AgentModelInput = {
      ...input(['open-source'], ['accessibility']),
      ownerAnswer: { candidateClue, answer: 'yes' },
    };
    const outcome = materializeAgentModelOutcome(
      encounter,
      bridgeDecision(['owner-confirmed:open-source'])
    );

    expect(outcome.kind).toBe('bridge');
    if (outcome.kind === 'bridge') {
      expect(outcome.bridge.evidence.clues[0]?.value).toBe('open-source');
    }
  });

  it('Wire v1 が表現できない Language-only Evidence は no-signal にする', () => {
    const outcome = materializeAgentModelOutcome(
      input(['open-source'], ['regional-event-operations'], ['ja'], ['ja']),
      bridgeDecision(['language:ja'])
    );

    expect(outcome).toEqual({ kind: 'no-signal' });
  });

  it('no-signal と検証済み Input に存在しない Evidence は fail closed にする', () => {
    const encounter = input(['open-source'], ['open-source']);
    expect(
      materializeAgentModelOutcome(encounter, { kind: 'no-signal' })
    ).toEqual({ kind: 'no-signal' });
    expect(
      materializeAgentModelOutcome(
        encounter,
        bridgeDecision(['topic:accessibility'])
      )
    ).toEqual({ kind: 'no-signal' });
  });
});
