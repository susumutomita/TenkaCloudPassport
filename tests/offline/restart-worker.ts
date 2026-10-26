/** Test-only cold process; the key port is synthetic, not an iOS Keychain claim. */
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { ForensicHost, type PracticeSqlite } from '../../src/app/forensic/host';

const directory = process.argv[2];
const phase = process.argv[3];
if (!directory || !['create', 'recover'].includes(phase ?? ''))
  throw new Error('Missing test directory/phase');
const db = new Database(join(directory, 'practice.sqlite'));
const port: PracticeSqlite = {
  execSync: (sql) => db.exec(sql),
  runSync: (sql, ...values) => db.query(sql).run(...values),
  getFirstSync: <T>(sql: string, ...values: (string | number | null)[]) =>
    db.query(sql).get(...values) as T | null,
};
const host = new ForensicHost(
  async () => port,
  {
    read: async () => 'a'.repeat(64),
    write: async () => undefined,
    remove: async () => undefined,
  },
  () => 'b'.repeat(64),
  (operation) => operation()
);
let view = await host.load();
if (phase === 'create') {
  const c = view.cases[0];
  if (!c) throw new Error('Missing original case');
  const identity = JSON.parse(
    c.evidence.find((e) => e.id === 'I-IDP')?.content ?? 'null'
  ) as { events: { account: string; session: string }[] };
  const cloud = JSON.parse(
    c.evidence.find((e) => e.id === 'I-CLOUD')?.content ?? 'null'
  ) as { events: { operation: string; session: string }[] };
  const action = cloud.events.find(
    (e) => e.operation === 'EnableExternalExport'
  );
  const account = identity.events.find(
    (e) => e.session === action?.session
  )?.account;
  if (!account) throw new Error('Missing displayed evidence');
  view = await host.submit({
    kind: 'answer',
    id: 'cold-process-answer',
    revision: view.revision,
    generation: view.generation,
    caseId: 'identity',
    questionId: 'account',
    answer: account,
    evidenceIds: ['I-IDP', 'I-CLOUD'],
  });
}
db.close();
process.stdout.write(
  JSON.stringify({
    score: view.score,
    revision: view.revision,
    solved: view.cases[0]?.questions[0]?.solved,
  })
);
