import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';
import { createHash as nodeHash, createHmac as nodeHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac } from '../../domain/forensic/crypto';
import { buildCases } from '../../domain/forensic/upstream/fixtures';
import type { AnswerOp, State } from '../../domain/forensic/upstream/types';
import {
  LocalModelContextLeaseRegistry,
  withLocalDataWrite,
} from '../local-data-control';
import { ForensicHost, type PracticeSqlite } from './host';

const directories: string[] = [];
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function setup(varyEntropy = false) {
  let entropy = 0;
  const directory = mkdtempSync(join(tmpdir(), 'passport-practice-'));
  directories.push(directory);
  let secret: string | null = null;
  let failWrite = false;
  let failKey = false;
  let pendingDeletion = false;
  const journal = {
    isPending: async () => pendingDeletion,
    markPending: async () => undefined,
    clear: async () => undefined,
  };
  const leases = new LocalModelContextLeaseRegistry(false);
  function connect() {
    const db = new Database(join(directory, 'practice.sqlite'));
    databases.push(db);
    const adapter: PracticeSqlite = {
      execSync: (sql) => db.exec(sql),
      runSync: (sql, ...bindings) => {
        if (failWrite && sql.startsWith('INSERT'))
          throw new Error('synthetic disk error');
        return db.query(sql).run(...bindings);
      },
      getFirstSync: <T>(sql: string, ...bindings: (string | number | null)[]) =>
        db.query(sql).get(...bindings) as T | null,
    };
    const host = new ForensicHost(
      async () => adapter,
      {
        read: async () => secret,
        write: async (value) => {
          if (failKey) throw new Error('synthetic locked keychain');
          secret = value;
        },
        remove: async () => {
          secret = null;
        },
      },
      () =>
        varyEntropy
          ? (++entropy).toString(16).padStart(64, '0')
          : 'a'.repeat(64),
      (operation) => withLocalDataWrite(leases, journal, operation)
    );
    return { host, db };
  }
  const first = connect();
  return {
    ...first,
    connect,
    secret: () => secret,
    loseKey: () => {
      secret = null;
    },
    failDisk: (value: boolean) => {
      failWrite = value;
    },
    failKey: (value: boolean) => {
      failKey = value;
    },
    deletion: () => {
      pendingDeletion = true;
    },
  };
}
function state(db: Database, secret: string | null): State {
  const row = db
    .query('SELECT payload FROM forensic_practice WHERE id=1')
    .get() as { payload: string };
  return { ...JSON.parse(row.payload), matchSecret: secret };
}
function correct(
  db: Database,
  secret: string | null,
  caseIndex = 0,
  questionIndex = 0
): AnswerOp {
  const s = state(db, secret);
  const c = buildCases(s, 'solo')[caseIndex];
  if (!c) throw new Error('Missing source case');
  const q = c.questions[questionIndex];
  if (!q) throw new Error('Missing source question');
  return {
    kind: 'answer',
    id: `answer-${caseIndex}-${questionIndex}`,
    revision: s.teams['solo']?.revision ?? 0,
    generation: s.generation,
    caseId: c.id,
    questionId: q.id,
    answer: q.expected,
    evidenceIds: q.citations,
  };
}
it('matches the original Node UTF-8 SHA-256/HMAC contract, including Unicode and incremental updates', () => {
  for (const text of ['', '証拠\n🗂', 'abc', '\ud83d']) {
    expect(
      createHash('sha256').update(text, 'utf8').update('\ude00尾').digest('hex')
    ).toBe(
      nodeHash('sha256').update(text, 'utf8').update('\ude00尾').digest('hex')
    );
    expect(createHmac('sha256', '鍵').update(text).digest('hex')).toBe(
      nodeHmac('sha256', '鍵').update(text).digest('hex')
    );
  }
});
it('runs all original fifteen questions and all four cases to exactly400 points; only projections reach the screen', async () => {
  const f = setup();
  let view = await f.host.load();
  expect(view.cases).toHaveLength(4);
  expect(view.cases.flatMap((c) => c.questions)).toHaveLength(15);
  expect(Object.keys(view).sort()).toEqual([
    'cases',
    'generation',
    'lastResult',
    'maxScore',
    'revision',
    'score',
    'teamId',
  ]);
  expect(
    view.cases.every((c) =>
      c.questions.every((q) => !Object.hasOwn(q, 'expected'))
    )
  ).toBe(true);
  for (let c = 0; c < 4; c++) {
    const count = view.cases[c]?.questions.length ?? 0;
    for (let q = 0; q < count; q++) {
      view = await f.host.submit(correct(f.db, f.secret(), c, q));
      expect(view.lastResult?.status).toBe('correct');
    }
  }
  expect(view.score).toBe(400);
  expect(view.cases.every((c) => c.questions.every((q) => q.solved))).toBe(
    true
  );
  const row = f.db.query('SELECT payload FROM forensic_practice').get();
  expect(JSON.stringify(row)).not.toContain('matchSecret');
  expect(await f.connect().host.load()).toEqual(view);
});
it('persists an incorrect answer and hints without changing the original score or revealing answers', async () => {
  const f = setup();
  const first = await f.host.load();
  const op = correct(f.db, f.secret());
  const wrong = await f.host.submit({
    ...op,
    answer: 'incorrect',
    id: 'wrong',
  });
  expect(wrong.score).toBe(0);
  expect(wrong.lastResult?.status).toBe('incorrect');
  expect(wrong.cases[0]?.questions[0]?.attempts).toBe(1);
  const hint = await f.host.submit({
    kind: 'hint',
    id: 'hint1',
    generation: first.generation,
    revision: wrong.revision,
    caseId: op.caseId,
    questionId: op.questionId,
    rung: 1,
  });
  expect(hint.cases[0]?.questions[0]?.hints).toHaveLength(1);
  expect(hint.score).toBe(0);
  await expect(
    f.host.submit({
      kind: 'hint',
      id: 'hint3',
      generation: first.generation,
      revision: hint.revision,
      caseId: op.caseId,
      questionId: op.questionId,
      rung: 3,
    })
  ).rejects.toThrow('hint_sequence');
  expect(await f.connect().host.load()).toEqual(hint);
});
it('replays a committed operation safely across restart and rejects changed contents, new duplicate answers and stale revisions', async () => {
  const f = setup();
  await f.host.load();
  const op = correct(f.db, f.secret());
  const solved = await f.host.submit(op);
  const reopened = f.connect().host;
  expect(await reopened.submit(op)).toEqual(solved);
  await expect(
    reopened.submit({ ...op, id: 'second', revision: solved.revision })
  ).rejects.toThrow('already_solved');
  await expect(reopened.submit({ ...op, answer: 'changed' })).rejects.toThrow(
    'id_conflict'
  );
  await expect(reopened.submit({ ...op, id: 'stale' })).rejects.toThrow(
    'stale_revision'
  );
  expect(await reopened.load()).toEqual(solved);
});
it('rolls back failed saves and never publishes an unconfirmed score; retry succeeds with the same operation', async () => {
  const f = setup();
  const first = await f.host.load();
  const op = correct(f.db, f.secret());
  f.failDisk(true);
  await expect(f.host.submit(op)).rejects.toThrow('synthetic disk error');
  f.failDisk(false);
  expect(await f.connect().host.load()).toEqual(first);
  expect((await f.host.submit(op)).score).toBe(20);
});
it('fails closed on missing Keychain data and corrupted or foreign-edition SQLite snapshots', async () => {
  const f = setup();
  await f.host.load();
  const before = f.db.query('SELECT * FROM forensic_practice').get();
  f.loseKey();
  await expect(f.connect().host.load()).rejects.toThrow('recovery failed');
  expect(f.db.query('SELECT * FROM forensic_practice').get()).toEqual(before);
  const g = setup();
  await g.host.load();
  g.db.run("UPDATE forensic_practice SET payload='corrupt'");
  await expect(g.host.load()).rejects.toThrow('recovery failed');
  const h = setup();
  await h.host.load();
  h.db.run("UPDATE forensic_practice SET edition='future'");
  await expect(h.host.load()).rejects.toThrow('recovery failed');
});
it('does not create progress when Keychain is locked or global deletion is pending', async () => {
  const f = setup();
  f.failKey(true);
  await expect(f.host.load()).rejects.toThrow('locked keychain');
  expect(f.db.query('SELECT * FROM forensic_practice').all()).toHaveLength(0);
  f.failKey(false);
  await f.host.load();
  f.deletion();
  await expect(f.host.submit(correct(f.db, f.secret()))).rejects.toThrow();
});
it('serializes simultaneous repeat submissions and clears both owned SQLite records and Keychain material', async () => {
  const f = setup();
  await f.host.load();
  const op = correct(f.db, f.secret());
  const views = await Promise.all([f.host.submit(op), f.host.submit(op)]);
  expect(views[0]).toEqual(views[1]);
  expect((await f.host.inspect()).count).toBe(2);
  await f.host.remove();
  expect(await f.host.inspect()).toEqual({ count: 0, bytes: 0 });
  expect(f.secret()).toBeNull();
});

it('overlapping host initializations cannot replace the seed of the committed practice', async () => {
  const f = setup(true);
  const second = f.connect().host;
  const results = await Promise.allSettled([f.host.load(), second.load()]);
  const successful = results.find((result) => result.status === 'fulfilled');
  if (!successful || successful.status !== 'fulfilled')
    throw new Error('No host initialized');
  expect(await f.connect().host.load()).toEqual(successful.value);
});
