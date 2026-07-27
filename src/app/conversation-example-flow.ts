import type {
  ConversationExample,
  ConversationExampleGenerator,
  ConversationExampleInput,
  ConversationExampleSpeaker,
  ConversationExampleTurn,
} from '../domain/conversation-example';

export const CONVERSATION_EXAMPLE_TIMEOUT_MS = 60_000;
export const CONVERSATION_EXAMPLE_ELAPSED_INTERVAL_MS = 1_000;

export type ConversationExampleViewState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'available' }
  | {
      readonly kind: 'generating';
      readonly elapsedSeconds: number;
      /** これまでに確定した（Content Guard 済みの）ターン列。ターン確定ごとに 1 件ずつ増える。 */
      readonly turns: readonly ConversationExampleTurn[];
      /**
       * まだ確定していない、次に生成中の話者（typing indicator の表示側）。
       * レビュー指摘の修正: 最終ターン確定後は次の話者がいないため `null` にする。
       * Native Context 解放（`session.close()`）待ちの間、存在しない 5 番目の話者の
       * typing indicator を出し続けないために区別する。
       */
      readonly nextSpeaker: ConversationExampleSpeaker | null;
    }
  | { readonly kind: 'shown'; readonly example: ConversationExample }
  | {
      /**
       * Issue 169: 途中失敗・途中キャンセル・タイムアウト・ターン単位 Guard 違反の
       * いずれでも、1 件以上確定済みならそのターンを残したまま終了する（全捨てしない）。
       */
      readonly kind: 'ended-early';
      readonly turns: readonly ConversationExampleTurn[];
    }
  | { readonly kind: 'failed' };

export const HIDDEN_CONVERSATION_EXAMPLE_STATE: ConversationExampleViewState = {
  kind: 'hidden',
};

export interface ConversationExampleScheduler {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly setInterval: (callback: () => void, delayMs: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}

const DEFAULT_SCHEDULER: ConversationExampleScheduler = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface ConversationExampleFlowController {
  readonly getState: () => ConversationExampleViewState;
  readonly subscribe: (
    listener: (state: ConversationExampleViewState) => void
  ) => () => void;
  /** Bridge 確定時にだけ呼ぶ。Generator が無い Rules/Web では hidden へ収束する。 */
  readonly prepare: (input: ConversationExampleInput) => void;
  readonly generate: () => void;
  readonly cancel: () => void;
  readonly hide: () => void;
  readonly dispose: () => void;
}

interface ControllerOptions {
  readonly scheduler?: ConversationExampleScheduler;
  readonly timeoutMs?: number;
}

function nextSpeakerAfter(
  speaker: ConversationExampleSpeaker
): ConversationExampleSpeaker {
  return speaker === 'owner' ? 'peer' : 'owner';
}

/** 1 件以上確定済みならそのターンを残す。0 件なら Fallback 状態を使う。 */
function endedEarlyOrFallback(
  turns: readonly ConversationExampleTurn[],
  fallback: ConversationExampleViewState
): ConversationExampleViewState {
  return turns.length > 0 ? { kind: 'ended-early', turns } : fallback;
}

/**
 * React に依存しない会話例の非同期状態機械。Native Context は直前の Promise の settlement
 * 後にだけ次を開始し、Cancel 直後の再生成でも execution lease を競合させない。
 * Issue 169: ターン確定ごとに `generating` state を更新して 1 件ずつ公開し、途中失敗・
 * キャンセルでも確定済みターンを `ended-early` として残す。
 */
export function createConversationExampleFlowController(
  generator: ConversationExampleGenerator | null,
  options: ControllerOptions = {}
): ConversationExampleFlowController {
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const timeoutMs = options.timeoutMs ?? CONVERSATION_EXAMPLE_TIMEOUT_MS;
  const listeners = new Set<(state: ConversationExampleViewState) => void>();
  let state: ConversationExampleViewState = HIDDEN_CONVERSATION_EXAMPLE_STATE;
  let input: ConversationExampleInput | null = null;
  let generation = 0;
  let abortController: AbortController | null = null;
  let elapsedHandle: unknown = null;
  let timeoutHandle: unknown = null;
  let nativeLane: Promise<void> = Promise.resolve();

  function publish(next: ConversationExampleViewState): void {
    state = next;
    for (const listener of listeners) listener(next);
  }

  function clearElapsedAndTimeout(): void {
    if (elapsedHandle !== null) scheduler.clearInterval(elapsedHandle);
    if (timeoutHandle !== null) scheduler.clearTimeout(timeoutHandle);
    elapsedHandle = null;
    timeoutHandle = null;
  }

  function stopCurrentGeneration(): void {
    generation += 1;
    abortController?.abort();
    abortController = null;
    clearElapsedAndTimeout();
  }

  function availableOrHidden(): ConversationExampleViewState {
    return generator && input
      ? { kind: 'available' }
      : HIDDEN_CONVERSATION_EXAMPLE_STATE;
  }

  function prepare(nextInput: ConversationExampleInput): void {
    stopCurrentGeneration();
    input = nextInput;
    publish(availableOrHidden());
  }

  function hide(): void {
    stopCurrentGeneration();
    input = null;
    publish(HIDDEN_CONVERSATION_EXAMPLE_STATE);
  }

  function generate(): void {
    if (!generator || !input || state.kind === 'generating') return;
    const runGeneration = generation + 1;
    generation = runGeneration;
    const runInput = input;
    const controller = new AbortController();
    abortController = controller;
    const startedAt = scheduler.now();

    function onTurn(turn: ConversationExampleTurn, isFinalTurn: boolean): void {
      if (generation !== runGeneration || state.kind !== 'generating') return;
      publish({
        kind: 'generating',
        elapsedSeconds: state.elapsedSeconds,
        turns: [...state.turns, turn],
        // レビュー指摘の修正(ghost typing indicator): 最終ターン確定後は
        // session.close()（Native Context 解放）の完了待ちの間があっても、
        // 存在しない次の話者の typing indicator を出さない。
        nextSpeaker: isFinalTurn ? null : nextSpeakerAfter(turn.speaker),
      });
    }

    publish({
      kind: 'generating',
      elapsedSeconds: 0,
      turns: [],
      nextSpeaker: 'owner',
    });
    elapsedHandle = scheduler.setInterval(() => {
      if (generation !== runGeneration || state.kind !== 'generating') return;
      publish({
        ...state,
        elapsedSeconds: Math.max(
          0,
          Math.floor((scheduler.now() - startedAt) / 1_000)
        ),
      });
    }, CONVERSATION_EXAMPLE_ELAPSED_INTERVAL_MS);
    timeoutHandle = scheduler.setTimeout(() => {
      if (generation !== runGeneration || state.kind !== 'generating') return;
      const confirmedTurns = state.turns;
      generation += 1;
      controller.abort();
      if (abortController === controller) abortController = null;
      clearElapsedAndTimeout();
      publish(endedEarlyOrFallback(confirmedTurns, { kind: 'failed' }));
    }, timeoutMs);

    const run = nativeLane.then(() =>
      generator.generate(runInput, { signal: controller.signal, onTurn })
    );
    const settlement = run.then(
      (example) => {
        if (generation !== runGeneration) return;
        abortController = null;
        clearElapsedAndTimeout();
        publish({ kind: 'shown', example });
      },
      () => {
        if (generation !== runGeneration) return;
        const confirmedTurns = state.kind === 'generating' ? state.turns : [];
        abortController = null;
        clearElapsedAndTimeout();
        publish(endedEarlyOrFallback(confirmedTurns, { kind: 'failed' }));
      }
    );
    nativeLane = settlement;
  }

  function cancel(): void {
    if (state.kind !== 'generating') return;
    const confirmedTurns = state.turns;
    // レビュー指摘の修正: 最終ターンまで確定済み(nextSpeaker === null)の状態で
    // Cancel されても、実際には何も失われていない(session.close() の完了待ちを
    // やめさせただけ)ため ended-early ではなく shown として扱う。
    const allTurnsConfirmed = state.nextSpeaker === null;
    stopCurrentGeneration();
    if (allTurnsConfirmed) {
      publish({ kind: 'shown', example: { turns: confirmedTurns } });
      return;
    }
    publish(endedEarlyOrFallback(confirmedTurns, availableOrHidden()));
  }

  function subscribe(
    listener: (next: ConversationExampleViewState) => void
  ): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose(): void {
    stopCurrentGeneration();
    input = null;
    state = HIDDEN_CONVERSATION_EXAMPLE_STATE;
    listeners.clear();
  }

  return {
    getState: () => state,
    subscribe,
    prepare,
    generate,
    cancel,
    hide,
    dispose,
  };
}
