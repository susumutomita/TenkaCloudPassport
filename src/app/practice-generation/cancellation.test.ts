import { expect, test } from 'bun:test';
import { boundedGeneration, type GenerationClock } from './deadline';
import { generationProvider } from './provider';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture(cancelFails = false) {
  let elapsed: (() => void) | undefined;
  let stopped = 0;
  let finish: ((value: unknown) => void) | undefined;
  const ids: string[] = [];
  const cancelled: string[] = [];
  const clock: GenerationClock = {
    after(ms, callback) {
      expect(ms).toBe(30_000);
      elapsed = callback;
      return () => {
        stopped++;
      };
    },
  };
  const provider = generationProvider(
    {
      prepare: async () => undefined,
      availability: async () => 'available',
      generate: async (id) => {
        ids.push(id);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      cancel: async (id) => {
        cancelled.push(id);
        if (cancelFails) throw new Error('cancel transport failed');
      },
    },
    clock
  );
  return {
    provider,
    ids,
    cancelled,
    expire: () => {
      if (!elapsed) throw new Error('Timer not scheduled');
      elapsed();
    },
    finish: () => {
      if (!finish) throw new Error('Missing task');
      finish({ kind: 'field', first: 1, second: 2 });
    },
    stopped: () => stopped,
  };
}
test('pre-cancelled requests never invoke native generation', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(f.provider.generate(controller.signal)).rejects.toThrow(
    'cancelled'
  );
  expect(f.ids).toHaveLength(0);
});
test('abort while native reservation is awaiting acknowledgment cancels it afterward without dispatching generation', async () => {
  let acknowledge: (() => void) | undefined;
  let starts = 0;
  let cancels = 0;
  const provider = generationProvider({
    availability: async () => 'available',
    prepare: () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    generate: async () => {
      starts++;
      return null;
    },
    cancel: async () => {
      cancels++;
    },
  });
  const controller = new AbortController();
  const pending = provider.generate(controller.signal);
  await flush();
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  expect(cancels).toBe(0);
  if (!acknowledge) throw new Error('Missing reservation acknowledgment');
  acknowledge();
  await flush();
  expect(starts).toBe(0);
  expect(cancels).toBe(1);
});
test('native reservation rejection never dispatches model generation and permits retry', async () => {
  let fails = true;
  let starts = 0;
  const provider = generationProvider({
    availability: async () => 'available',
    prepare: async () => {
      if (fails) throw new Error('reservation failure');
    },
    generate: async () => {
      starts++;
      return { kind: 'field', first: 1, second: 2 };
    },
    cancel: async () => undefined,
  });
  await expect(provider.generate()).rejects.toThrow('reservation failure');
  expect(starts).toBe(0);
  fails = false;
  expect(await provider.generate()).toEqual({
    kind: 'field',
    first: 1,
    second: 2,
  });
});
test('abort during preflight never starts model generation after a late availability result', async () => {
  let ready: ((value: string) => void) | undefined;
  let starts = 0;
  const controller = new AbortController();
  const provider = generationProvider({
    prepare: async () => undefined,
    availability: () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
    generate: async () => {
      starts++;
      return null;
    },
    cancel: async () => undefined,
  });
  const pending = provider.generate(controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  if (!ready) throw new Error('Missing preflight');
  ready('available');
  await flush();
  expect(starts).toBe(0);
});
test('the deadline includes a stalled preflight and rejects late available admission', async () => {
  let ready: ((value: string) => void) | undefined;
  let expire: () => void = () => undefined;
  let starts = 0;
  const provider = generationProvider(
    {
      prepare: async () => undefined,
      availability: () =>
        new Promise((resolve) => {
          ready = resolve;
        }),
      generate: async () => {
        starts++;
        return null;
      },
      cancel: async () => undefined,
    },
    {
      after: (ms, callback) => {
        expect(ms).toBe(30_000);
        expire = callback;
        return () => undefined;
      },
    }
  );
  const pending = provider.generate();
  expire();
  await expect(pending).rejects.toThrow('deadline');
  if (!ready) throw new Error('Missing preflight');
  ready('available');
  await flush();
  expect(starts).toBe(0);
});
test('a previous cancellation RPC failure cannot mark a newer owned generation uncertain', async () => {
  const results: ((value: unknown) => void)[] = [];
  let cancelFailure: ((error: Error) => void) | undefined;
  const provider = generationProvider({
    prepare: async () => undefined,
    availability: async () => 'available',
    generate: () =>
      new Promise((resolve) => {
        results.push(resolve);
      }),
    cancel: () =>
      new Promise((_resolve, reject) => {
        cancelFailure = reject;
      }),
  });
  const controller = new AbortController();
  const first = provider.generate(controller.signal);
  await flush();
  controller.abort();
  await expect(first).rejects.toThrow('cancelled');
  const finishOld = results[0];
  if (!finishOld) throw new Error('Missing original');
  finishOld({ kind: 'field', first: 1, second: 2 });
  await flush();
  const newer = provider.generate();
  await flush();
  if (!cancelFailure) throw new Error('Missing cancel RPC');
  cancelFailure(new Error('late cancellation failure'));
  await flush();
  expect(await provider.availability()).toBe('available');
  const finishNew = results[1];
  if (!finishNew) throw new Error('Missing new request');
  finishNew({ kind: 'rsa', first: 4, second: 0 });
  expect(await newer).toEqual({ kind: 'rsa', first: 4, second: 0 });
});
test('synchronous cancellation transport failure still rejects and quarantines only its owner', async () => {
  let finish: ((value: unknown) => void) | undefined;
  const controller = new AbortController();
  const provider = generationProvider({
    prepare: async () => undefined,
    availability: async () => 'available',
    generate: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    cancel() {
      throw new Error('sync native dispatch failure');
    },
  });
  const pending = provider.generate(controller.signal);
  await flush();
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  await expect(provider.availability()).rejects.toThrow('not been confirmed');
  if (!finish) throw new Error('Missing operation');
  finish({ kind: 'field', first: 1, second: 2 });
  await flush();
  expect(await provider.availability()).toBe('available');
});
test('leaving cancels only the owned task; late success is discarded and retry waits for task settlement', async () => {
  const f = fixture();
  const controller = new AbortController();
  const request = f.provider.generate(controller.signal);
  await flush();
  controller.abort();
  await expect(request).rejects.toThrow('cancelled');
  expect(f.cancelled).toEqual(f.ids);
  expect(f.cancelled).toHaveLength(1);
  expect(f.stopped()).toBe(1);
  await expect(f.provider.generate()).rejects.toThrow('already');
  f.finish();
  await flush();
  expect(await f.provider.availability()).toBe('available');
  const retry = f.provider.generate();
  await flush();
  f.finish();
  expect(await retry).toEqual({ kind: 'field', first: 1, second: 2 });
});
test('the unchanged30second budget aborts publication and cancellation failures remain observable until native settlement', async () => {
  const f = fixture(true);
  const request = f.provider.generate();
  await flush();
  f.expire();
  await expect(request).rejects.toThrow('deadline');
  await flush();
  await expect(f.provider.availability()).rejects.toThrow('not been confirmed');
  await expect(f.provider.generate()).rejects.toThrow('already');
  f.finish();
  await flush();
  expect(await f.provider.availability()).toBe('available');
});
test('a late native failure after cancellation is consumed without producing a practice result', async () => {
  let fail: ((reason: Error) => void) | undefined;
  const controller = new AbortController();
  let cancelCalls = 0;
  const task = new Promise<unknown>((_resolve, reject) => {
    fail = reject;
  });
  const pending = boundedGeneration(
    task,
    async () => {
      cancelCalls++;
    },
    () => undefined,
    { after: () => () => undefined },
    controller.signal
  );
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  if (!fail) throw new Error('Missing rejection');
  fail(new Error('native cancelled'));
  await flush();
  expect(cancelCalls).toBe(1);
});
test('an already-aborted boundary request is still cancelled exactly once and ignores a late timer', async () => {
  const controller = new AbortController();
  controller.abort();
  let cancelCalls = 0;
  let expire: () => void = () => undefined;
  const pending = boundedGeneration(
    Promise.resolve(2),
    async () => {
      cancelCalls++;
    },
    () => undefined,
    {
      after: (_ms, fn) => {
        expire = fn;
        return () => undefined;
      },
    },
    controller.signal
  );
  await expect(pending).rejects.toThrow('cancelled');
  expire();
  expect(cancelCalls).toBe(1);
});
