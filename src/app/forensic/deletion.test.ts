import { expect, it } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLocalDataControl,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
} from '../local-data-control';
import {
  eraseOwnedDatabase,
  inspectOwnedDatabase,
} from './erase-owned-database';
import { ForensicHost } from './host';

it('the real deletion coordinator can erase corrupt SQLite without opening it, preserves unrelated files and recovers a failed deletion', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'passport-corrupt-erase-'));
  const file = (suffix: string) => join(directory, 'practice.sqlite' + suffix);
  for (const suffix of ['', '-wal', '-shm'])
    writeFileSync(file(suffix), 'synthetic-corrupt-file');
  const unrelated = join(directory, 'other.sqlite');
  writeFileSync(unrelated, 'keep unrelated bytes');
  let secret: string | null = 'synthetic-key';
  let pending = false;
  let fail = true;
  let opens = 0;
  function info(suffix: string) {
    try {
      return { exists: true, size: statSync(file(suffix)).size };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return { exists: false };
      throw error;
    }
  }
  const leases = new LocalModelContextLeaseRegistry(false);
  const journal = {
    isPending: async () => pending,
    markPending: async () => {
      pending = true;
    },
    clear: async () => {
      pending = false;
    },
  };
  const host = new ForensicHost(
    async () => {
      opens++;
      throw new Error('corrupt SQLite must not be opened for erase');
    },
    {
      read: async () => secret,
      write: async () => undefined,
      remove: async () => {
        expect(
          ['', '-wal', '-shm'].some((suffix) => existsSync(file(suffix)))
        ).toBe(false);
        secret = null;
      },
    },
    () => '',
    (operation) => operation(),
    {
      inspect: async () => inspectOwnedDatabase(info),
      erase: () =>
        eraseOwnedDatabase(
          (suffix) => info(suffix).exists,
          (suffix) => unlinkSync(file(suffix)),
          async () => {
            if (fail) throw new Error('synthetic delete failure');
            unlinkSync(file(''));
          }
        ),
    }
  );
  const control = createLocalDataControl({
    profileStorage: {
      load: async () => null,
      save: async () => undefined,
      inspect: async () => ({ count: 0, bytes: 0 }),
      remove: async () => undefined,
    },
    modelStorage: new NoLocalModelStorageAdapter(),
    modelContexts: leases,
    deletionJournal: journal,
    learningStorage: host,
  });
  try {
    expect((await control.preview()).additionalCount).toBe(4);
    await expect(control.deleteAll()).rejects.toThrow();
    expect(pending).toBe(true);
    expect(secret).not.toBeNull();
    expect(existsSync(file(''))).toBe(true);
    fail = false;
    expect(await control.recoverPendingDeletion()).toBe('recovered');
    expect(pending).toBe(false);
    expect(secret).toBeNull();
    expect(opens).toBe(0);
    expect(readFileSync(unrelated, 'utf8')).toBe('keep unrelated bytes');
    expect((await control.preview()).additionalCount ?? 0).toBe(0);
    await control.deleteAll();
    expect(opens).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it('rejects missing or invalid metadata rather than estimating confirmed absence/size', () => {
  expect(inspectOwnedDatabase(() => ({ exists: false }))).toEqual({
    count: 0,
    bytes: 0,
  });
  for (const size of [undefined, -1, NaN, Infinity, 1.5])
    expect(() =>
      inspectOwnedDatabase(() => ({
        exists: true,
        ...(size === undefined ? {} : { size }),
      }))
    ).toThrow('size could not be confirmed');
});
