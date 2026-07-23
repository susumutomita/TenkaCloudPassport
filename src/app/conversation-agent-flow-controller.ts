import type { IntroCard } from '../domain/intro-card';

/**
 * Issue 104 PR #132（Codex 指摘 major）: `use-conversation-agent-flow.ts` の
 * 状態機械を実行するテストが無かった（この repo には React render harness が無く、
 * `useState`/`useCallback` を直接持つ hook 本体は実行テストできない。既存の
 * `local-model-management-controller.ts` と同じ流儀で、副作用の順序・discard
 * 判定という「間違えやすい部分」だけを DI 可能な純関数へ切り出し、hook 本体は
 * これらを呼ぶだけの配線に留める。切り出した関数は `bun test` で直接実行できる。
 */

export interface ConversationAgentCleanupInput {
  readonly activeEncounterKey: string | null;
  readonly forget: (encounterKey: string) => void;
}

/**
 * blocker（Issue 104 PR #132）: Agent からの全離脱経路（`open` による張り替え・
 * `close`・`onReset`・`onRemovePeer`、および Settings footer からの離脱）は
 * 必ずこの 1 関数を経由して `providerRunner.forget()` を呼ぶ。呼び出し側が
 * 個別に `if (key) forget(key)` を書く重複を無くし、経路の 1 つが forget() を
 * 呼び忘れる regression（`PassportApp.tsx` の Settings footer が `openSettings`
 * を直接呼び、session clear・forget() の両方を素通りしていた実障害）を
 * 構造的に防ぐ。
 */
export function performConversationAgentCleanup(
  input: ConversationAgentCleanupInput
): void {
  if (input.activeEncounterKey !== null) {
    input.forget(input.activeEncounterKey);
  }
}

export interface ResolveScannedPeerInput {
  /**
   * `useRef<number>` 等、`current` を書き換え可能な参照。`open`（session
   * 張り替え）・`close`・`onReset`・`onRemovePeer` のたびに 1 進む世代を保持する。
   * `/simplify` 指摘（reuse/simplification、Issue 104 PR #132）: 専用の
   * interface・factory 関数（旧 `ConversationAgentGenerationGuard`）を作らず、
   * 同じファイルの `resolveConversationAgentRun`（`activeRunKeyRef`）と同じ
   * 「呼び出し側の `useRef` をそのまま渡す」流儀に揃える。
   */
  readonly scanGenerationRef: { current: number };
  readonly generationAtStart: number;
  readonly scan: () => Promise<string>;
  readonly decode: (raw: string) => IntroCard;
  readonly addPeer: (card: IntroCard) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * major（Issue 104 PR #132、stale scan race）: `onScanPeer` 開始時の世代
 * （`generationAtStart`）を捕まえ、scan 完了時に世代が変わっていれば
 * （待機中に `close`/`onReset` → 再 `open` されていれば）結果を静かに破棄する。
 * 世代が変わっていなければ、既存どおり成功時は `addPeer`、失敗時は `onError` を呼ぶ。
 */
export async function resolveScannedPeer(
  input: ResolveScannedPeerInput
): Promise<void> {
  let raw: string;
  try {
    raw = await input.scan();
  } catch (error: unknown) {
    if (input.scanGenerationRef.current !== input.generationAtStart) return;
    input.onError(error);
    return;
  }
  if (input.scanGenerationRef.current !== input.generationAtStart) return;
  try {
    input.addPeer(input.decode(raw));
  } catch (error: unknown) {
    input.onError(error);
  }
}

export interface ResolveConversationAgentRunInput<TRunResult> {
  /** `useRef<string | null>` 等、`current` を書き換え可能な参照。 */
  readonly activeRunKeyRef: { current: string | null };
  readonly encounterKey: string;
  readonly run: () => Promise<TRunResult>;
  readonly onSuccess: (result: TRunResult) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * major（Issue 104 PR #132、遅延完了破棄）: `onStart` が起動した Provider 実行の
 * 完了を、`activeRunKeyRef.current`（`forgetActiveRun` が `close`/`onReset`/
 * `onRemovePeer`/次の `onStart` で null 化・張り替えする）と突き合わせてから
 * 反映する。セッションが破棄・やり直された後に届く遅延完了が古い結果で
 * 画面を上書きしない。
 */
export async function resolveConversationAgentRun<TRunResult>(
  input: ResolveConversationAgentRunInput<TRunResult>
): Promise<void> {
  try {
    const result = await input.run();
    if (input.activeRunKeyRef.current !== input.encounterKey) return;
    input.onSuccess(result);
  } catch (error: unknown) {
    if (input.activeRunKeyRef.current !== input.encounterKey) return;
    input.onError(error);
  }
}
