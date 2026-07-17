import { clueById } from './clue-catalog';
import type { MatchEvidence } from './match-evidence';
import type { ConfirmedClue } from './passport';

export interface Bridge {
  readonly schemaVersion: 1;
  readonly messageKey: 'shared-clue' | 'offer-need-complement';
  readonly message: string;
  readonly evidence: MatchEvidence;
}

export function createBridge(sharedClue: ConfirmedClue): Bridge {
  const clue = clueById(sharedClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'shared-clue',
    message: `お互いが公開した「${clue.label}」をきっかけに、話してみませんか。`,
    evidence: {
      schemaVersion: 1,
      clues: [sharedClue],
    },
  };
}

/**
 * Issue 12: Topic 共通の手掛かりが 1 件もなくても、一方が提供できる手掛かりと
 * もう一方が探している手掛かりが同じ category で相互補完するとき、その 2 件を Evidence
 * とする Bridge を組み立てる（`src/domain/bridge-selection.ts` の
 * `offerNeedComplementMatches` を根拠にする 2 者間 Live 経路専用の constructor）。
 */
export function createComplementBridge(
  offerClue: ConfirmedClue,
  seekClue: ConfirmedClue
): Bridge {
  const offer = clueById(offerClue.value);
  const seek = clueById(seekClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'offer-need-complement',
    message: `「${offer.label}」を提供できる相手と、「${seek.label}」を探している相手が見つかりました。話してみませんか。`,
    evidence: {
      schemaVersion: 1,
      clues: [offerClue, seekClue],
    },
  };
}

export function createBridgeFromEvidence(evidence: MatchEvidence): Bridge {
  const firstClue = evidence.clues[0];
  if (!firstClue) {
    throw new Error('Bridge には 1 件以上の Match Evidence が必要です。');
  }
  const clue = clueById(firstClue.value);
  return {
    schemaVersion: 1,
    messageKey: 'shared-clue',
    message: `お互いが公開した「${clue.label}」をきっかけに、話してみませんか。`,
    evidence,
  };
}
