import { expect, it } from 'bun:test';
import {
  createLegacyModelStorage,
  isLegacyModelFile,
  type LegacyModelFile,
} from './legacy-model-storage';

const digest = 'a'.repeat(64);
function store(initial: Record<string, number>) {
  const files = new Map(Object.entries(initial));
  const failures = new Set<string>();
  const port = createLegacyModelStorage({
    list: () =>
      [...files].map(
        ([name, size]): LegacyModelFile => ({
          name,
          size: () => size,
          remove: () => {
            if (failures.has(name))
              throw new Error('Synthetic deletion failure');
            files.delete(name);
          },
        })
      ),
  });
  return { files, failures, port };
}
it('inspection counts legacy payloads and metadata without changing any files or parsing corrupt manifests', async () => {
  const s = store({
    [`${digest}.gguf`]: 1000,
    [`${digest}.deleting.gguf`]: 500,
    '.incoming.gguf': 20,
    'manifest.v1.json': 8,
    '.manifest.v1.tmp': 2,
    'notes.txt': 99,
  });
  const before = [...s.files];
  expect(await s.port.inspect()).toEqual({
    architecture: 'unknown',
    count: 3,
    sizeBytes: 1530,
    digest,
  });
  expect([...s.files]).toEqual(before);
  await s.port.remove();
  expect([...s.files]).toEqual([['notes.txt', 99]]);
  expect(await s.port.inspect()).toBeNull();
  await s.port.remove();
});
it('missing or unrelated store does not create files, and metadata-only remnants remain explicitly removable', async () => {
  expect(await store({}).port.inspect()).toBeNull();
  expect(await store({ 'unrelated.gguf': 7 }).port.inspect()).toBeNull();
  const s = store({ 'manifest.v1.json': 10 });
  expect(await s.port.inspect()).toMatchObject({ sizeBytes: 10, count: 0 });
  await s.port.remove();
  expect(s.files.size).toBe(0);
});
it('rejects unavailable, negative, unsafe and overflowing sizes without mutating files', async () => {
  for (const size of [NaN, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const s = store({ [`${digest}.gguf`]: size });
    await expect(s.port.inspect()).rejects.toThrow();
    expect(s.files.size).toBe(1);
  }
  await expect(
    store({
      [`${digest}.gguf`]: Number.MAX_SAFE_INTEGER,
      '.incoming.gguf': 1,
    }).port.inspect()
  ).rejects.toThrow('合計容量');
});
it('reports partial deletion failure and permits retry without touching unrelated data', async () => {
  const s = store({
    [`${digest}.gguf`]: 50,
    'manifest.v1.json': 2,
    'learning.json': 90,
  });
  s.failures.add('manifest.v1.json');
  await expect(s.port.remove()).rejects.toThrow('Synthetic deletion failure');
  expect(s.files.get('learning.json')).toBe(90);
  s.failures.clear();
  await s.port.remove();
  expect([...s.files]).toEqual([['learning.json', 90]]);
});
it('does not report successful removal when a native file remains', async () => {
  const port = createLegacyModelStorage({
    list: () => [
      { name: `${digest}.gguf`, size: () => 1, remove: () => undefined },
    ],
  });
  await expect(port.remove()).rejects.toThrow('ファイルが残っています');
});
it('matches exact historical filenames only, rejecting paths and arbitrary files', () => {
  for (const name of [
    `${digest}.gguf`,
    `${digest}.deleting.gguf`,
    'manifest.v1.json',
    '.manifest.v1.tmp',
    '.incoming.gguf',
  ])
    expect(isLegacyModelFile(name)).toBe(true);
  for (const name of [
    `../${digest}.gguf`,
    `${digest}.gguf.backup`,
    `${digest}.staged.gguf`,
    `${digest.toUpperCase()}.gguf`,
    'personal.gguf',
    'learning.json',
  ])
    expect(isLegacyModelFile(name)).toBe(false);
});
