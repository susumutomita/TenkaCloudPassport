import { describe, expect, it } from 'bun:test';
import type { PetInteractionState } from '../domain/pet-interaction';
import { interactionStatusNotice } from './interaction-status-notice';

const PHASES: readonly PetInteractionState['phase'][] = [
  'waiting',
  'discovering',
  'clarifying',
  'bridging',
  'no-signal',
  'retired',
];

const FORBIDDEN_INTERNAL_VOCABULARY = [
  'Chain of Thought',
  'Prompt',
  'candidateClue',
  'evidence',
  'reasoning',
];

describe('Pet Interaction の状態表示 (interactionStatusNotice)', () => {
  it('6 つのフェーズすべてに固定の状態文言を持つ', () => {
    for (const phase of PHASES) {
      const notice = interactionStatusNotice(phase);
      expect(notice.message.length).toBeGreaterThan(0);
    }
  });

  it('探しています / 確認しています という状態だけを discovering / clarifying に表示する', () => {
    expect(interactionStatusNotice('discovering').message).toContain(
      '探しています'
    );
    expect(interactionStatusNotice('clarifying').message).toContain(
      '確認しています'
    );
  });

  it('内部推論・Prompt・Evidence の語彙を一切含まない', () => {
    for (const phase of PHASES) {
      const notice = interactionStatusNotice(phase);
      for (const forbidden of FORBIDDEN_INTERNAL_VOCABULARY) {
        expect(notice.message).not.toContain(forbidden);
      }
    }
  });
});
