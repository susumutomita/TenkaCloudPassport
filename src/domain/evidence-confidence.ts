/**
 * `bridge-selection.ts`（Issue 12, N 者間 Bridge 選定）と `agent-model-provider.ts`
 * （Issue 13, Agent Model Provider Contract）が共有する Confidence 規則。両モジュールは
 * それぞれ別の Evidence 型（`BridgeEvidence` / `AgentModelEvidence`）を持つため、この
 * 共有関数は `kind` フィールドだけを見る最小限の形にし、`SelectedBridge` /
 * `AgentModelDecision` の形そのものは一切扱わない。
 *
 * 規則: Evidence が 2 件以上なら常に `promising`。1 件だけの場合は、呼び出し側が
 * 「単独でも今すぐ動ける具体的な理由になる」と判断した種別（`promisingSoloKinds`）だけを
 * `promising` とし、それ以外は `possible` とする。数値の人物 Score は一切扱わない。
 */
export type EvidenceConfidence = 'promising' | 'possible';

/**
 * 1 件以上の Evidence が必要な公開関数として、空 Evidence は呼び出し側が直接テストする
 * （`noUncheckedIndexedAccess` の下で到達不能な防御分岐を作らないため。
 * `bridge-selection.ts` / `agent-model-provider.ts` の同種の関数と同じ設計判断）。
 */
export function confidenceFromEvidence<Kind extends string>(
  evidence: readonly { readonly kind: Kind }[],
  promisingSoloKinds: ReadonlySet<Kind>
): EvidenceConfidence {
  const [only] = evidence;
  if (!only) {
    throw new Error('Confidence の判定には 1 件以上の Evidence が必要です。');
  }
  if (evidence.length >= 2) return 'promising';
  return promisingSoloKinds.has(only.kind) ? 'promising' : 'possible';
}
