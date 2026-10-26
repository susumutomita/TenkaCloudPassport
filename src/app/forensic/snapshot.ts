import {
  initialState,
  MAX_OPERATIONS_PER_TEAM,
  MAX_RECEIPTS,
  projectForTeam,
} from '../../domain/forensic/upstream/index';
import type {
  Progress,
  Result,
  State,
} from '../../domain/forensic/upstream/types';

function invalid(): never {
  throw new Error('Invalid saved practice state; progress was preserved.');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(','))
    invalid();
}
function integer(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  )
    return invalid();
  return value;
}
function progress(value: unknown): Progress {
  const p = record(value);
  keys(p, ['solved', 'attempts', 'unlockedHints']);
  const solved = p['solved'];
  if (typeof solved !== 'boolean') return invalid();
  const attempts = integer(p['attempts'], MAX_OPERATIONS_PER_TEAM);
  if (solved && attempts === 0) return invalid();
  return { solved, attempts, unlockedHints: integer(p['unlockedHints'], 3) };
}
function receipts(value: unknown, revision: number) {
  if (
    !Array.isArray(value) ||
    value.length !== Math.min(revision, MAX_RECEIPTS)
  )
    return invalid();
  const result = value.map((item) => {
    const row = record(item);
    keys(row, ['id', 'digest']);
    const id = row['id'];
    const digest = row['digest'];
    if (
      typeof id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) ||
      typeof digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      return invalid();
    return { id, digest };
  });
  if (new Set(result.map((row) => row.id)).size !== result.length)
    return invalid();
  return result;
}
function lastResult(
  value: unknown,
  revision: number,
  questions: Map<string, number>,
  saved: Record<string, Progress>
): Result | null {
  if (revision === 0) {
    if (value !== null) return invalid();
    return null;
  }
  const row = record(value);
  keys(row, [
    'kind',
    'caseId',
    'questionId',
    'status',
    'message',
    'pointsAwarded',
  ]);
  const kind = row['kind'];
  const status = row['status'];
  const caseId = row['caseId'];
  const questionId = row['questionId'];
  const message = record(row['message']);
  const ja = message['ja'];
  const en = message['en'];
  if (
    (kind !== 'answer' && kind !== 'hint') ||
    (status !== 'correct' && status !== 'incorrect' && status !== 'hint') ||
    typeof caseId !== 'string' ||
    typeof questionId !== 'string' ||
    typeof ja !== 'string' ||
    typeof en !== 'string'
  )
    return invalid();
  const key = `${caseId}/${questionId}`;
  const points = questions.get(key);
  if (points === undefined || (kind === 'hint') !== (status === 'hint'))
    return invalid();
  if (status === 'correct' && !saved[key]?.solved) return invalid();
  const pointsAwarded = integer(row['pointsAwarded'], 400);
  if (pointsAwarded !== (status === 'correct' ? points : 0)) return invalid();
  return {
    kind,
    status,
    caseId,
    questionId,
    message: { ja, en },
    pointsAwarded,
  };
}
/** Validate durable application data independently of its checksum; never repair silently. */
export function restoreSnapshot(payload: string, secret: string): State {
  const root = record(JSON.parse(payload));
  keys(root, ['schemaVersion', 'eventId', 'generation', 'teams']);
  if (root['schemaVersion'] !== 2 || typeof root['eventId'] !== 'string')
    return invalid();
  const generation = integer(root['generation'], 1_000_000);
  const initial = initialState(
    { eventId: root['eventId'], teamIds: ['solo'], matchSecret: secret },
    { generation }
  );
  const teams = record(root['teams']);
  keys(teams, ['solo']);
  const team = record(teams['solo']);
  keys(team, ['score', 'revision', 'progress', 'receipts', 'lastResult']);
  const revision = integer(team['revision'], MAX_OPERATIONS_PER_TEAM);
  const questions = new Map(
    projectForTeam(initial, 'solo').cases.flatMap((c) =>
      c.questions.map((q) => [`${c.id}/${q.id}`, q.points] as const)
    )
  );
  const raw = record(team['progress']);
  keys(raw, [...questions.keys()]);
  const saved = Object.fromEntries(
    [...questions.keys()].map((key) => [key, progress(raw[key])])
  );
  const score = integer(team['score'], 400);
  const expected = [...questions].reduce(
    (sum, [key, points]) => sum + (saved[key]?.solved ? points : 0),
    0
  );
  const operations = Object.values(saved).reduce(
    (sum, p) => sum + p.attempts + p.unlockedHints,
    0
  );
  if (score !== expected || revision !== operations) return invalid();
  return {
    ...initial,
    teams: {
      solo: {
        score,
        revision,
        progress: saved,
        receipts: receipts(team['receipts'], revision),
        lastResult: lastResult(team['lastResult'], revision, questions, saved),
      },
    },
  };
}
