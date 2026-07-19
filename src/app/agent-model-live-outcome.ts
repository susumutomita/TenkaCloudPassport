import {
  type AgentModelDecision,
  type AgentModelEvidence,
  type AgentModelInput,
  buildEncounterEvidence,
} from '../domain/agent-model-provider';
import { createBridge, createComplementBridge } from '../domain/bridge';
import { type ClueId, clueById } from '../domain/clue-catalog';
import type { ConfirmedClue } from '../domain/passport';
import type { ParticipantOutcome } from '../domain/rules-provider';

function confirmedClue(clueId: ClueId): ConfirmedClue {
  return {
    value: clueId,
    category: clueById(clueId).category,
    source: 'owner-selected',
  };
}

function materializeEvidence(
  input: AgentModelInput,
  evidence: AgentModelEvidence
): ParticipantOutcome | undefined {
  switch (evidence.kind) {
    case 'shared-topic': {
      return {
        kind: 'bridge',
        bridge: createBridge(confirmedClue(evidence.clueId), input.language),
      };
    }
    case 'offer-need-complement': {
      return {
        kind: 'bridge',
        bridge: createComplementBridge(
          confirmedClue(evidence.offerClueId),
          confirmedClue(evidence.seekClueId),
          input.language
        ),
      };
    }
    case 'owner-confirmed':
      return {
        kind: 'bridge',
        bridge: createBridge(confirmedClue(evidence.clueId), input.language),
      };
    case 'shared-language':
      // Wire v1 の MatchEvidence では Language-only を表現できない。
      return undefined;
  }
}

/** 検証済み Evidence ID を、自由記述を使わず既存 Bridge constructor だけで具体化する。 */
export function materializeAgentModelOutcome(
  input: AgentModelInput,
  decision: AgentModelDecision
): ParticipantOutcome {
  if (decision.kind === 'no-signal') return decision;
  const selectedIds = new Set(decision.evidenceIds);
  for (const evidence of buildEncounterEvidence(input)) {
    if (!selectedIds.has(evidence.evidenceId)) continue;
    const outcome = materializeEvidence(input, evidence);
    if (outcome) return outcome;
  }
  return { kind: 'no-signal' };
}
