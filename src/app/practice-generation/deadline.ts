export interface GenerationClock {
  after(milliseconds: number, elapsed: () => void): () => void;
}
export const generationClock: GenerationClock = {
  after(milliseconds, elapsed) {
    const timer = setTimeout(elapsed, milliseconds);
    return () => clearTimeout(timer);
  },
};

/** Deadline/cancellation stop publication, and request the matching native Task to cancel. */
export function boundedGeneration<T>(
  operation: Promise<T>,
  cancel: () => Promise<void>,
  cancellationFailed: () => void,
  clock: GenerationClock,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    let stopTimer: (() => void) | undefined;
    const cleanup = () => {
      stopTimer?.();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      try {
        void cancel().catch(cancellationFailed);
      } catch {
        cancellationFailed();
      }
      reject(new Error('Generation cancelled or deadline exceeded.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    stopTimer = clock.after(30_000, abort);
    if (signal?.aborted) abort();
    operation.then(
      (value) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(error);
      }
    );
  });
}
