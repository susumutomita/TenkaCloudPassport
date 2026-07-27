import { describe, expect, it } from 'bun:test';
import type {
  ConversationExample,
  ConversationExampleGenerator,
  ConversationExampleGeneratorOptions,
  ConversationExampleInput,
  ConversationExampleTurn,
} from '../domain/conversation-example';
import {
  CONVERSATION_EXAMPLE_TIMEOUT_MS,
  type ConversationExampleScheduler,
  createConversationExampleFlowController,
} from './conversation-example-flow';

const INPUT: ConversationExampleInput = {
  bridgeReason: 'どちらも OSS に関心があります。',
  bridgeOpener: '最近触った OSS はありますか？',
  language: 'ja',
};

const TURN_1: ConversationExampleTurn = {
  speaker: 'owner',
  text: '最近触った OSS はありますか？',
};
const TURN_2: ConversationExampleTurn = {
  speaker: 'peer',
  text: '小さな CLI を直しています。',
};
const TURN_3: ConversationExampleTurn = {
  speaker: 'owner',
  text: 'どこを改善しているんですか？',
};
const TURN_4: ConversationExampleTurn = {
  speaker: 'peer',
  text: 'エラー表示を分かりやすくしています。',
};

const EXAMPLE: ConversationExample = {
  turns: [TURN_1, TURN_2, TURN_3, TURN_4],
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
  readonly options: ConversationExampleGeneratorOptions | undefined;
  readonly resolve: (example: ConversationExample) => void;
  readonly reject: (error: Error) => void;
}

/**
 * `generate` の Promise 決着を外部から制御しつつ、実装同様
 * `options.onTurn` を任意回数呼んでターン確定を模擬できる Fake。
 */
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
        options,
        resolve,
        reject,
      });
    });
  }
}

async function flushPromises(): Promise<void> {
  // nativeLane.then → async generate → settlement.then の採択で microtask が
  // 4 tick 以上要るため、固定 8 tick で全連鎖を確実に消化する。
  for (let tick = 0; tick < 8; tick += 1) {
    await Promise.resolve();
  }
}

describe('ConversationExampleFlowController（Issue 169: ターン毎生成の状態機械）', () => {
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
    const unsubscribe = controller.subscribe((state) =>
      states.push(state.kind)
    );

    controller.prepare(INPUT);
    unsubscribe();
    controller.hide();

    expect(states).toEqual(['available']);
    expect(controller.getState()).toEqual({ kind: 'hidden' });
    controller.dispose();
  });

  it('生成中はターン確定ごとに turns が 1 件ずつ増え、経過秒を保ったまま更新する', async () => {
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
      turns: [],
      nextSpeaker: 'owner',
    });
    scheduler.advanceBy(2_500);
    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 2,
      turns: [],
      nextSpeaker: 'owner',
    });

    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);
    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 2,
      turns: [TURN_1],
      nextSpeaker: 'peer',
    });
    run?.options?.onTurn?.(TURN_2, false);
    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 2,
      turns: [TURN_1, TURN_2],
      nextSpeaker: 'owner',
    });

    run?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toEqual({ kind: 'shown', example: EXAMPLE });

    controller.hide();
    expect(controller.getState()).toEqual({ kind: 'hidden' });
    controller.dispose();
  });

  it('最終ターン確定後、Session Close 完了待ちの間は typing indicator 用の nextSpeaker を出さない', async () => {
    // レビュー指摘（ghost typing indicator）の回帰テスト。生成器の実装
    // （`local-agent/conversation-example-generator.ts`）は最終ターンの
    // onTurn 通知後も `finally { await session.close(); }` の分だけ Promise の
    // 決着が遅れる。この間、画面には存在しない次の話者の typing indicator も
    // Cancel ボタンも「まだ生成中」の見た目のまま出てはいけない。
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];

    run?.options?.onTurn?.(TURN_1, false);
    run?.options?.onTurn?.(TURN_2, false);
    run?.options?.onTurn?.(TURN_3, false);
    run?.options?.onTurn?.(TURN_4, true);

    // Session Close（Native Context 解放）を模した非同期の間 = Promise 未決着。
    expect(controller.getState()).toEqual({
      kind: 'generating',
      elapsedSeconds: 0,
      turns: [TURN_1, TURN_2, TURN_3, TURN_4],
      nextSpeaker: null,
    });

    run?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toEqual({ kind: 'shown', example: EXAMPLE });
    controller.dispose();
  });

  it('全ターン確定後（nextSpeaker が null）の Cancel は、失われたものが無いため shown として扱う', async () => {
    // レビュー指摘の回帰テスト: 最終ターンまで確定した後の Cancel は
    // Session Close の完了待ちをやめさせるだけで、会話の内容は何も失われない。
    // ended-early（「途中で終了した」文言）ではなく shown にする。
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];

    run?.options?.onTurn?.(TURN_1, false);
    run?.options?.onTurn?.(TURN_2, false);
    run?.options?.onTurn?.(TURN_3, false);
    run?.options?.onTurn?.(TURN_4, true);

    controller.cancel();

    expect(controller.getState()).toEqual({
      kind: 'shown',
      example: { turns: [TURN_1, TURN_2, TURN_3, TURN_4] },
    });

    // 遅れて届く settlement（成功・失敗どちらでも）は世代が古いため無視される。
    run?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toEqual({
      kind: 'shown',
      example: { turns: [TURN_1, TURN_2, TURN_3, TURN_4] },
    });
    controller.dispose();
  });

  it('失敗後、確定ターンが 0 件なら Bridge を残すため failed にし、同じ入力で再試行できる', async () => {
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

  it('確定済みターンが 1 件以上ある途中失敗は ended-early にして確定分を残す', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);

    run?.reject(new Error('generation failed after first turn'));
    await flushPromises();

    expect(controller.getState()).toEqual({
      kind: 'ended-early',
      turns: [TURN_1],
    });
    controller.dispose();
  });

  it('ターン単位の Content Guard 違反も、確定分が 1 件以上あれば ended-early にする', async () => {
    // ターン単位の Guard 違反は Generator 内部で ConversationExampleError として
    // reject される（`local-agent/conversation-example-generator.ts` の責務）。
    // Controller から見ればこれも「途中失敗」であり、同じ ended-early 分岐を通る。
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);

    run?.reject(new Error('turn content guard violation'));
    await flushPromises();

    expect(controller.getState()).toEqual({
      kind: 'ended-early',
      turns: [TURN_1],
    });
    controller.dispose();
  });

  it('Cancel は確定ターンが 0 件なら Abort して available へ戻し、遅延完了を表示しない', async () => {
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

    expect(firstRun?.options?.signal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({ kind: 'available' });
    controller.dispose();
  });

  it('確定済みターンが 1 件以上あるキャンセルは ended-early にして確定分を残す', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);
    run?.options?.onTurn?.(TURN_2, false);

    controller.cancel();

    expect(run?.options?.signal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({
      kind: 'ended-early',
      turns: [TURN_1, TURN_2],
    });
    controller.dispose();
  });

  it('Cancel 後に遅れて届く stale な onTurn 通知は世代を検査して無視する', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);
    controller.cancel();
    expect(controller.getState()).toEqual({
      kind: 'ended-early',
      turns: [TURN_1],
    });

    // 世代の古い Generator が Abort に気づかず onTurn を呼んでも、画面は汚さない。
    run?.options?.onTurn?.(TURN_2, false);

    expect(controller.getState()).toEqual({
      kind: 'ended-early',
      turns: [TURN_1],
    });
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

  it('60 秒 Timeout で確定ターンが 0 件なら Abort して failed にし、後から届く結果を破棄する', async () => {
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
    expect(run?.options?.signal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({ kind: 'failed' });

    run?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toEqual({ kind: 'failed' });
    controller.dispose();
  });

  it('60 秒 Timeout でも確定ターンが 1 件以上あれば ended-early にして確定分を残す', async () => {
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);

    scheduler.advanceBy(CONVERSATION_EXAMPLE_TIMEOUT_MS);

    expect(controller.getState()).toEqual({
      kind: 'ended-early',
      turns: [TURN_1],
    });
    controller.dispose();
  });

  it('全ターン確定後（nextSpeaker が null）の 60 秒 Timeout は、失われたものが無いため shown として扱う', async () => {
    // レビュー指摘の回帰テスト: Cancel だけでなく Timeout も同じ「実際には成功
    // したのに ended-early と誤表示する」不具合を踏みうる。最終ターン確定から
    // session.close() 完了までの間にちょうど Timeout がまたがるケースを再現する。
    const scheduler = new ManualConversationExampleScheduler();
    const generator = new ControlledConversationExampleGenerator();
    const controller = createConversationExampleFlowController(generator, {
      scheduler,
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();
    const run = generator.runs[0];
    run?.options?.onTurn?.(TURN_1, false);
    run?.options?.onTurn?.(TURN_2, false);
    run?.options?.onTurn?.(TURN_3, false);
    run?.options?.onTurn?.(TURN_4, true);

    scheduler.advanceBy(CONVERSATION_EXAMPLE_TIMEOUT_MS);

    expect(controller.getState()).toEqual({
      kind: 'shown',
      example: { turns: [TURN_1, TURN_2, TURN_3, TURN_4] },
    });

    // 遅れて届く settlement は世代が古いため無視される。
    run?.resolve(EXAMPLE);
    await flushPromises();
    expect(controller.getState()).toEqual({
      kind: 'shown',
      example: { turns: [TURN_1, TURN_2, TURN_3, TURN_4] },
    });
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
      turns: [],
      nextSpeaker: 'owner',
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
    });
    controller.prepare(INPUT);
    controller.generate();
    await flushPromises();

    expect(controller.getState()).toEqual({ kind: 'shown', example: EXAMPLE });
    controller.dispose();
    expect(controller.getState()).toEqual({ kind: 'hidden' });
  });
});
