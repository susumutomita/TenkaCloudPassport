import { expect, it } from 'bun:test';
import { combineOwnedLearningData } from './owned-learning-data';

it('construction and inspection preserve data while combining actual owned usage', async () => {
  let removals = 0;
  const port = {
    inspect: async () => ({ count: 1, bytes: 20 }),
    remove: async () => {
      removals++;
    },
  };
  const combined = combineOwnedLearningData(port, port);
  expect(removals).toBe(0);
  expect(await combined.inspect()).toEqual({ count: 2, bytes: 40 });
  expect(removals).toBe(0);
  await combined.remove();
  expect(removals).toBe(2);
});
it('propagates inspection/deletion failures and permits journal-driven retry without skipping later stores', async () => {
  let fail = true;
  let later = 0;
  const combined = combineOwnedLearningData(
    {
      inspect: async () => {
        throw new Error('inspect');
      },
      remove: async () => {
        if (fail) throw new Error('remove');
      },
    },
    {
      inspect: async () => ({ count: 0, bytes: 0 }),
      remove: async () => {
        later++;
      },
    }
  );
  await expect(combined.inspect()).rejects.toThrow('inspect');
  await expect(combined.remove()).rejects.toThrow('remove');
  expect(later).toBe(0);
  fail = false;
  await combined.remove();
  expect(later).toBe(1);
});
