import { expect, test } from 'bun:test';
import { createGenerationProvider } from './default-provider';
import { GENERATION_AVAILABILITY, generationProvider } from './provider';

test('availability distinguishes every native state and fails unknown values closed', async () => {
  for (const value of [...GENERATION_AVAILABILITY, null, {}, 'new-state']) {
    const provider = generationProvider({
      prepare: async () => undefined,
      cancel: async () => undefined,
      availability: async () => value,
      generate: async () => null,
    });
    expect(await provider.availability()).toBe(
      GENERATION_AVAILABILITY.find((entry) => entry === value) ?? 'unknown'
    );
  }
});
test('no model call occurs when unavailable, including after prior availability', async () => {
  let status = 'available',
    calls = 0;
  const provider = generationProvider({
    prepare: async () => undefined,
    cancel: async () => undefined,
    availability: async () => status,
    generate: async () => {
      calls++;
      return null;
    },
  });
  expect(await provider.availability()).toBe('available');
  status = 'model-not-ready';
  await expect(provider.generate()).rejects.toThrow('unavailable');
  expect(calls).toBe(0);
});
test('native failure and malformed output propagate, retry is available, overlapping requests cannot start', async () => {
  let mode = 'failure',
    calls = 0;
  let complete: ((value: unknown) => void) | undefined;
  const provider = generationProvider({
    prepare: async () => undefined,
    cancel: async () => undefined,
    availability: async () => 'available',
    generate: async () => {
      calls++;
      if (mode === 'failure') throw new Error('synthetic failure');
      if (mode === 'malformed') return { kind: 'rsa', first: 999, second: 1 };
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  await expect(provider.generate()).rejects.toThrow('synthetic');
  mode = 'malformed';
  await expect(provider.generate()).rejects.toThrow();
  mode = 'success';
  const pending = provider.generate();
  await expect(provider.generate()).rejects.toThrow('already');
  await Promise.resolve();
  if (!complete) throw new Error('Missing pending request');
  complete({ kind: 'rsa', first: 9, second: 0 });
  expect(await pending).toEqual({ kind: 'rsa', first: 9, second: 0 });
  expect(calls).toBe(3);
});
test('availability transport failure remains an error and unsupported platforms cannot generate', async () => {
  const provider = generationProvider({
    prepare: async () => undefined,
    cancel: async () => undefined,
    availability: async () => {
      throw new Error('read failed');
    },
    generate: async () => null,
  });
  await expect(provider.availability()).rejects.toThrow('read failed');
  await expect(provider.generate()).rejects.toThrow('read failed');
  const web = createGenerationProvider();
  expect(await web.availability()).toBe('unsupported-platform');
  await expect(web.generate()).rejects.toThrow('native build');
});
