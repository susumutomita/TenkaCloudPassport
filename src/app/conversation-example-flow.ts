import type {
  ConversationExample,
  ConversationExampleGenerator,
  ConversationExampleInput,
} from '../domain/conversation-example';

export const CONVERSATION_EXAMPLE_TIMEOUT_MS = 60_000;
export const CONVERSATION_EXAMPLE_REVEAL_INTERVAL_MS = 300;
export const CONVERSATION_EXAMPLE_ELAPSED_INTERVAL_MS = 1_000;

export type ConversationExampleViewState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'available' }
  | { readonly kind: 'generating'; readonly elapsedSeconds: number }
  | {
      readonly kind: 'shown';
      readonly example: ConversationExample;
      readonly visibleTurnCount: number;
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
  readonly revealIntervalMs?: number;
}

/**
 * React に依存しない会話例の非同期状態機械。Native Context は直前の Promise の settlement
 * 後にだけ次を開始し、Cancel 直後の再生成でも execution lease を競合させない。
 */
export function createConversationExampleFlowController(
  generator: ConversationExampleGenerator | null,
  options: ControllerOptions = {}
): ConversationExampleFlowController {
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const timeoutMs = options.timeoutMs ?? CONVERSATION_EXAMPLE_TIMEOUT_MS;
  const revealIntervalMs =
    options.revealIntervalMs ?? CONVERSATION_EXAMPLE_REVEAL_INTERVAL_MS;
  const listeners = new Set<(state: ConversationExampleViewState) => void>();
  let state: ConversationExampleViewState = HIDDEN_CONVERSATION_EXAMPLE_STATE;
  let input: ConversationExampleInput | null = null;
  let generation = 0;
  let abortController: AbortController | null = null;
  let elapsedHandle: unknown = null;
  let timeoutHandle: unknown = null;
  let revealHandle: unknown = null;
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

  function clearReveal(): void {
    if (revealHandle !== null) scheduler.clearInterval(revealHandle);
    revealHandle = null;
  }

  function stopCurrentGeneration(): void {
    generation += 1;
    abortController?.abort();
    abortController = null;
    clearElapsedAndTimeout();
    clearReveal();
  }

  function availableOrHidden(): ConversationExampleViewState {
    return generator && input
      ? { kind: 'available' }
      : HIDDEN_CONVERSATION_EXAMPLE_STATE;
  }

  function reveal(example: ConversationExample, runGeneration: number): void {
    publish({ kind: 'shown', example, visibleTurnCount: 1 });
    revealHandle = scheduler.setInterval(() => {
      if (generation !== runGeneration || state.kind !== 'shown') {
        clearReveal();
        return;
      }
      const visibleTurnCount = Math.min(
        state.visibleTurnCount + 1,
        state.example.turns.length
      );
      publish({ ...state, visibleTurnCount });
      if (visibleTurnCount === state.example.turns.length) clearReveal();
    }, revealIntervalMs);
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
    clearReveal();
    const runGeneration = generation + 1;
    generation = runGeneration;
    const runInput = input;
    const controller = new AbortController();
    abortController = controller;
    const startedAt = scheduler.now();
    publish({ kind: 'generating', elapsedSeconds: 0 });
    elapsedHandle = scheduler.setInterval(() => {
      if (generation !== runGeneration || state.kind !== 'generating') return;
      publish({
        kind: 'generating',
        elapsedSeconds: Math.max(
          0,
          Math.floor((scheduler.now() - startedAt) / 1_000)
        ),
      });
    }, CONVERSATION_EXAMPLE_ELAPSED_INTERVAL_MS);
    timeoutHandle = scheduler.setTimeout(() => {
      if (generation !== runGeneration || state.kind !== 'generating') return;
      generation += 1;
      controller.abort();
      if (abortController === controller) abortController = null;
      clearElapsedAndTimeout();
      publish({ kind: 'failed' });
    }, timeoutMs);

    const run = nativeLane.then(() =>
      generator.generate(runInput, { signal: controller.signal })
    );
    const settlement = run.then(
      (example) => {
        if (generation !== runGeneration) return;
        abortController = null;
        clearElapsedAndTimeout();
        reveal(example, runGeneration);
      },
      () => {
        if (generation !== runGeneration) return;
        abortController = null;
        clearElapsedAndTimeout();
        publish({ kind: 'failed' });
      }
    );
    nativeLane = settlement;
  }

  function cancel(): void {
    if (state.kind !== 'generating') return;
    stopCurrentGeneration();
    publish(availableOrHidden());
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
