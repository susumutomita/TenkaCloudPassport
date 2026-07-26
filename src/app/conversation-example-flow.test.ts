import { describe, expect, it } from 'bun:test';
import type {
  ConversationExample,
  ConversationExampleGenerator,
  ConversationExampleGeneratorOptions,
  ConversationExampleInput,
} from '../domain/conversation-example';
import {
  CONVERSATION_EXAMPLE_REVEAL_INTERVAL_MS,
  CONVERSATION_EXAMPLE_TIMEOUT_MS,
  type ConversationExampleScheduler,
  createConversationExampleFlowController,
} from './conversation-example-flow';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらも OSS に関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  language: 'ja',
};

const EXAMPLE: ConversationExample = {
  turns: [
    { speaker: 'owner', text: '最近触った OSS はありますか？' },
    { speaker: 'peer', text: '小さな CLI を直しています。' },
    { speaker: 'owner', text: 'どこを改善しているんですか？' },
    { speaker: 'peer', text: 'エラー表示を分かりやすくしています。' },
  ],
};

interface ScheduledTask {
  atMs: number;
  readonly callback: () => void;
  readonly intervalMs: number | null;
}

class ManualConversationExampleScheduler
  implements ConversationExampleScheduler
{
  private currentMs = 0;
  private nextHandle = 1;
  private readonly tasks = new Map<number, ScheduledTask>();
  readonly timeoutCallbacks: Array<() => void> = [];
  readonly intervalCallbacks: Array<() => void> = [];

  readonly now = (): number => this.currentMs;

  readonly setTimeout = (callback: () => void, delayMs: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.tasks.set(handle, {
      atMs: this.currentMs + delayMs,
      callback,
      intervalMs: null,
    });
    this.timeoutCallbacks.push(callback);
    return handle;
  };

  readonly clearTimeout = (handle: unknown): void => {
    this.tasks.delete(this.handleNumber(handle));
  };

  readonly setInterval = (callback: () => void, delayMs: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.tasks.set(handle, {
      atMs: this.currentMs + delayMs,
      callback,
      intervalMs: delayMs,
    });
    this.intervalCallbacks.push(callback);
    return handle;
  };

  readonly clearInterval = (handle: unknown): void => {
    this.tasks.delete(this.handleNumber(handle));
  };

  advanceBy(deltaMs: number): void {
    const targetMs = this.currentMs + deltaMs;
    while (true) {
      const next = this.nextTaskBefore(targetMs);
      if (!next) break;
      const [handle, task] = next;
      this.currentMs = task.atMs;
      if (task.intervalMs === null) {
        this.tasks.delete(handle);
      } else {
        this.tasks.set(handle, {
          ...task,
          atMs: task.atMs + task.intervalMs,
        });
      }
      task.callback();
    }
    this.currentMs = targetMs;
  }

  private handleNumber(handle: unknown): number {
    if (typeof handle !== 'number') {
      throw new TypeError('Manual scheduler handle must be a number.');
    }
    return handle;
  }

  private nextTaskBefore(
    targetMs: number
  ): readonly [number, ScheduledTask] | null {
    let selected: readonly [number, ScheduledTask] | null = null;
    for (const entry of this.tasks) {
      if (entry[1].atMs > targetMs) continue;
      if (selected === null || entry[1].atMs < selected[1].atMs) {
        selected = entry;
      }
    }
    return selected;
  }
}

interface PendingGeneration {
  readonly input: ConversationExampleInput;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (example: ConversationExample) => void;
  readonly reject: (error: Error) => void;
}

class ControlledConversationExampleGenerator
  implements ConversationExampleGenerator
{
  readonly runs: PendingGeneration[] = [];

  generate(
    input: ConversationExampleInput,
    options?: ConversationExampleGeneratorOptions
  ): Promise<ConversationExample> {
    return new Promise((resolve, reject) => {
      this.runs.push({
        input,
        signal: options?.signal,
        resolve,
        reject,
      });
    });
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ConversationExampleFlowController（Issue 155 の状態機械）', () => {
  it('Generator が無い Rules/Web では prepare 後も hidden のままにする', () => {
    const controller = createConversationExampleFlowController(null);

    controller.prepare(INPUT);
    controller.generate();
    controller.cancel();

    expect(controller.getState()).toEqual({ kind: 'hidden' });
    controller.dispose();
  });

  it('prepare で available になり、購読解除後は Listener を呼ばない', () => {
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator);
    const states: string[] = [];
    const unsubscribe = controller.subscribe((state) => states.push(state.kind));

    controller.prepare(INPUT);
    unsubscribe();
    controller.hide();

    expect(states).toEqual(['available']);
    expect(controller.getState()).toEqual({ kind: 'hidden' });
    controller.dispose();
  });

  it('生成中の経過秒を更新し、全件検証済み結果を 300ms 間隔で順次表示する', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();

    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 0,
    });
    scheduler.advanceBy(2_500);
    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 2,
    });
    expect(generator.runs).toHaveLength(1);

    generator.runs[0]?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toMatchObject({
      kind: 'shown',
      visibleTurnCount: 1,
    });

    scheduler.advanceBy(CONVERSATION_EXAMPLE_REVEAL_INTERVAL_MS);
    expect(controller.getState()).toMatchObject({ visibleTurnCount: 2 });
    scheduler.advanceBy(CONVERSATION_EXAMPLE_REVEAL_INTERVAL_MS * 2);
    expect(controller.getState()).toMatchObject({ visibleTurnCount: 4 });

    scheduler.timeoutCallbacks[0]?.();
    expect(controller.getState()).toMatchObject({ kind: 'shown' });
    controller.hide();
    scheduler.intervalCallbacks.at(-1)?.();
    expect(controller.getState()).toEqual({ kind: 'hidden' });
    controller.dispose();
  });

  it('失敗後は Bridge を残すため failed にし、同じ入力で再試行できる', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    generator.runs[0]?.reject(new Error('generation failed'));
    await flushPromises();

    expect(controller.getState()).toEqual({ kind: 'failed' });
    controller.cancel();
    controller.generate();
    await flushPromises();
    expect(generator.runs).toHaveLength(2);
    expect(generator.runs[1]?.input).toEqual(INPUT);
    controller.dispose();
  });

  it('Cancel は Abort して available へ戻し、遅延完了を表示しない', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const firstRun = generator.runs[0];

    controller.cancel();
    scheduler.intervalCallbacks[0]?.();
    firstRun?.resolve(EXAMPLE);
    await flushPromises();

    expect(firstRun?.signal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({ kind: 'available' });
    controller.dispose();
  });

  it('Cancel 直後の再生成は前回 Promise の settlement 後まで Native 実行を直列化する', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    controller.cancel();
    controller.generate();
    await flushPromises();

    expect(generator.runs).toHaveLength(1);
    generator.runs[0]?.reject(new Error('cancelled run settled'));
    await flushPromises();
    expect(generator.runs).toHaveLength(2);
    controller.dispose();
  });

  it('60 秒 Timeout で Abort して failed にし、後から届く結果を破棄する', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];

    scheduler.advanceBy(CONVERSATION_EXAMPLE_TIMEOUT_MS);
    expect(run?.signal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({ kind: 'failed' });

    run?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toEqual({ kind: 'failed' });
    controller.dispose();
  });

  it('表示済み状態から同じ入力で別の会話例を再生成できる', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    generator.runs[0]?.resolve(EXAMPLE);
    await flushPromises();

    controller.generate();
    await flushPromises();

    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 0,
    });
    expect(generator.runs).toHaveLength(2);
    expect(generator.runs[1]?.input).toEqual(INPUT);
    controller.dispose();
  });

  it('新しい Bridge の prepare は表示中の例と Timer を破棄して available へ戻す', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    generator.runs[0]?.resolve(EXAMPLE);
    await flushPromises();

    const nextInput = {
      ...INPUT,
      bridgeReason: '別の共通点です。',
    };
    controller.prepare(nextInput);
    scheduler.intervalCallbacks.at(-1)?.();

    expect(controller.getState()).toEqual({ kind: 'available' });
    controller.generate();
    await flushPromises();
    expect(generator.runs[1]?.input).toEqual(nextInput);
    controller.dispose();
  });

  it('既定 Scheduler でも即時成功後に Timer を解放して dispose できる', async () => {
    const generator: ConversationExampleGenerator = {
      async generate() {
        return EXAMPLE;
      },
    };
    const controller = createConversationExampleFlowController(generator, {
      timeoutMs: 1_000,
      revealIntervalMs: 1_000,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();

    expect(controller.getState()).toMatchObject({ kind: 'shown' });
    controller.dispose();
    expect(controller.getState()).toEqual({ kind: 'hidden' });
  });
});
