import { expect, it } from 'bun:test';
import { PracticeConnection } from './connection';
import {
  eraseOwnedDatabase,
  inspectOwnedDatabase,
} from './erase-owned-database';
import { ForensicHost } from './host';

it('completes erasure while an in-flight native open rejects without closing a nonexistent handle', async () => {
  const opening = Promise.withResolvers<object>();
  let removed = false;
  const connection = new PracticeConnection(
    () => opening.promise,
    async () => {
      throw new Error('must not close');
    },
    async () => {
      removed = true;
    }
  );
  const pending = connection.open();
  const erasing = connection.erase();
  opening.reject(new Error('interrupted open'));
  await Promise.all([
    expect(pending).rejects.toThrow('interrupted open'),
    erasing,
  ]);
  expect(removed).toBe(true);
});

it('coalesces opens, clears a rejected open and successfully retries without restarting the app', async () => {
  let count = 0;
  const connection = new PracticeConnection(
    async () => {
      if (++count === 1) throw new Error('transient open');
      return { id: count };
    },
    async () => undefined,
    async () => undefined
  );
  const first = connection.open();
  expect(connection.open()).toBe(first);
  await expect(first).rejects.toThrow('transient open');
  expect(await connection.open()).toEqual({ id: 2 });
  expect(await connection.open()).toEqual({ id: 2 });
  expect(count).toBe(2);
});
it('never opens merely to erase, closes before deletion and resets its cache for a later new practice', async () => {
  const calls: string[] = [];
  const connection = new PracticeConnection(
    async () => {
      calls.push('open');
      return {};
    },
    async () => {
      calls.push('close');
    },
    async () => {
      calls.push('delete');
    }
  );
  await connection.erase();
  expect(calls).toEqual(['delete']);
  await connection.open();
  await connection.erase();
  await connection.open();
  expect(calls).toEqual(['delete', 'open', 'close', 'delete', 'open']);
});
it('propagates failed close/delete and supports retry after each failed boundary', async () => {
  let failClose = true;
  let failDelete = true;
  let deletes = 0;
  const connection = new PracticeConnection(
    async () => ({}),
    async () => {
      if (failClose) throw new Error('close');
    },
    async () => {
      deletes++;
      if (failDelete) throw new Error('delete');
    }
  );
  await connection.open();
  await expect(connection.erase()).rejects.toThrow('close');
  expect(deletes).toBe(0);
  failClose = false;
  await expect(connection.erase()).rejects.toThrow('delete');
  failDelete = false;
  await connection.erase();
  expect(deletes).toBe(2);
});
it('cleans a partial file after a rejected opener instead of calling close on an invalid connection', async () => {
  let deleted = false;
  const connection = new PracticeConnection(
    async () => {
      throw new Error('partial open');
    },
    async () => {
      throw new Error('must not close');
    },
    async () => {
      deleted = true;
    }
  );
  const pending = connection.open();
  const rejected = expect(pending).rejects.toThrow('partial open');
  await connection.erase();
  await rejected;
  expect(deleted).toBe(true);
});
it('removes only owned sidecars, is idempotent on an absent database and refuses unconfirmed deletion', async () => {
  const files = new Set(['', '-wal', '-shm', 'unrelated']);
  const exists = (suffix: string) => files.has(suffix);
  await eraseOwnedDatabase(
    exists,
    (suffix) => {
      files.delete(suffix);
    },
    async () => {
      files.delete('');
    }
  );
  expect([...files]).toEqual(['unrelated']);
  await eraseOwnedDatabase(
    exists,
    () => {
      throw new Error('unused');
    },
    async () => {
      throw new Error('unused');
    }
  );
  files.add('');
  await expect(
    eraseOwnedDatabase(
      exists,
      () => undefined,
      async () => undefined
    )
  ).rejects.toThrow('database removal');
  files.delete('');
  files.add('-journal');
  await expect(
    eraseOwnedDatabase(
      exists,
      () => undefined,
      async () => undefined
    )
  ).rejects.toThrow('journal removal');
  await expect(
    eraseOwnedDatabase(
      exists,
      () => {
        throw new Error('locked sidecar');
      },
      async () => undefined
    )
  ).rejects.toThrow('locked sidecar');
});
it('does not open an unused database during inspect/delete; erasure failure preserves its key and is retryable', async () => {
  let opens = 0;
  let erased = false;
  let secret: string | null = 'synthetic-private-seed';
  let failure = true;
  const host = new ForensicHost(
    async () => {
      opens++;
      throw new Error('must not open');
    },
    {
      read: async () => secret,
      write: async () => undefined,
      remove: async () => {
        secret = null;
      },
    },
    () => '',
    (operation) => operation(),
    {
      erase: async () => {
        if (failure) throw new Error('owned file failed');
        erased = true;
      },
      inspect: async () => ({ count: 0, bytes: 0 }),
    }
  );
  expect(await host.inspect()).toEqual({ count: 1, bytes: 0 });
  await expect(host.remove()).rejects.toThrow('owned file failed');
  expect(secret).not.toBeNull();
  failure = false;
  await host.remove();
  expect(erased).toBe(true);
  expect(secret).toBeNull();
  expect(opens).toBe(0);
  expect(await host.inspect()).toEqual({ count: 0, bytes: 0 });
});
it('propagates uncertain file inspection instead of treating permission failure as absence', async () => {
  let seedRemoved = false;
  const stat = () => {
    throw new Error('synthetic stat permission failure');
  };
  const host = new ForensicHost(
    async () => {
      throw new Error('must not open');
    },
    {
      read: async () => 'private',
      write: async () => undefined,
      remove: async () => {
        seedRemoved = true;
      },
    },
    () => '',
    (operation) => operation(),
    {
      erase: () =>
        eraseOwnedDatabase(
          stat,
          () => undefined,
          async () => undefined
        ),
      inspect: async () => inspectOwnedDatabase(stat),
    }
  );
  await expect(host.inspect()).rejects.toThrow('stat permission failure');
  await expect(host.remove()).rejects.toThrow('stat permission failure');
  expect(seedRemoved).toBe(false);
});
