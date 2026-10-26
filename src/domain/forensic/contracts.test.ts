import { expect, it } from 'bun:test';
import { requireDefined } from './invariant';
import { answerMatches, buildCases } from './upstream/fixtures';
import {
  initialState,
  migrateState,
  projectForTeam,
  teamScores,
  validateOp,
} from './upstream/index';

const context = {
  eventId: 'contract-test',
  teamIds: ['solo'],
  matchSecret: 'a'.repeat(64),
};
const start = () => initialState(context);
const operation = () => ({
  kind: 'answer',
  id: 'contract',
  revision: 0,
  generation: 1,
  caseId: 'identity',
  questionId: 'account',
  answer: 'wrong',
  evidenceIds: ['I-IDP', 'I-CLOUD'],
});
it.each(['event', 'secret', 'roster', 'generation'])(
  'preserves the original rejected initial-state boundary: %s',
  (fault) => {
    const input = { ...context };
    let options = { generation: 1 };
    if (fault === 'event') input.eventId = '\n';
    if (fault === 'secret') input.matchSecret = 'short';
    if (fault === 'roster') input.teamIds = ['solo', 'solo'];
    if (fault === 'generation') options = { generation: 0 };
    expect(() => initialState(input, options)).toThrow();
  }
);
it.each([
  'keys',
  'kind',
  'id',
  'revision',
  'generation',
  'case',
  'question',
  'hint',
  'empty',
  'long',
  'many',
  'duplicate',
  'evidence',
  'unknown-question',
  'stale-generation',
])('keeps the original operation guard: %s', (fault) => {
  const op: Record<string, unknown> = operation();
  switch (fault) {
    case 'kind':
      op['kind'] = 'unknown';
      break;
    case 'keys':
      op['extra'] = true;
      break;
    case 'id':
      op['id'] = ' ';
      break;
    case 'revision':
      op['revision'] = -1;
      break;
    case 'generation':
      op['generation'] = 0;
      break;
    case 'case':
      op['caseId'] = '../case';
      break;
    case 'question':
      op['questionId'] = '?';
      break;
    case 'hint':
      op['kind'] = 'hint';
      delete op['answer'];
      delete op['evidenceIds'];
      op['rung'] = 4;
      break;
    case 'empty':
      op['answer'] = '';
      break;
    case 'long':
      op['answer'] = 'a'.repeat(513);
      break;
    case 'many':
      op['evidenceIds'] = ['A-AA', 'B-AA', 'C-AA', 'D-AA', 'E-AA'];
      break;
    case 'duplicate':
      op['evidenceIds'] = ['I-IDP', 'I-IDP'];
      break;
    case 'evidence':
      op['evidenceIds'] = ['I-UNKNOWN'];
      break;
    case 'unknown-question':
      op['questionId'] = 'unknown';
      break;
    case 'stale-generation':
      op['generation'] = 2;
      break;
  }
  const result = validateOp(start(), 'solo', op);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Guard accepted invalid operation');
  const expected: Record<string, string> = {
    evidence: 'invalid_evidence',
    'unknown-question': 'unknown_question',
    'stale-generation': 'stale_generation',
  };
  expect(result.error).toBe(expected[fault] ?? 'invalid_operation');
});
it('does not execute untrusted accessors or accept foreign prototypes', () => {
  let reads = 0;
  const op = {
    ...operation(),
    get extra() {
      reads++;
      return true;
    },
  };
  expect(validateOp(start(), 'solo', op).ok).toBe(false);
  expect(reads).toBe(0);
  expect(validateOp(start(), 'solo', Object.create(operation())).ok).toBe(
    false
  );
  expect(validateOp(start(), 'solo', null).ok).toBe(false);
});
it('retains source schema/roster/operation-limit guards and refuses automatic legacy migration', () => {
  const s = start();
  expect(validateOp(s, 'foreign', operation())).toEqual({
    ok: false,
    error: 'unknown_team',
  });
  expect(() => projectForTeam(s, 'foreign')).toThrow('unknown_team');
  const team = requireDefined(s.teams['solo']);
  team.revision = 1_000_000;
  expect(
    validateOp(s, 'solo', { ...operation(), revision: 1_000_000 })
  ).toEqual({ ok: false, error: 'operation_limit' });
  Reflect.set(s, 'schemaVersion', 1);
  expect(validateOp(s, 'solo', operation())).toEqual({
    ok: false,
    error: 'incompatible_state',
  });
  expect(() => projectForTeam(s, 'solo')).toThrow('incompatible_state');
  expect(() => migrateState(s, 1)).toThrow('new_event_required');
  expect(teamScores(start())).toEqual({ solo: 0 });
  expect(() => requireDefined(undefined)).toThrow(
    'Invalid forensic practice state'
  );
});
it('keeps exact evidence-scope normalization and rejects duplicate/additional claims', () => {
  const q = buildCases(start(), 'solo')
    .flatMap((c) => c.questions)
    .find((q) => q.id === 'scope');
  if (!q) throw new Error('Missing original scope question');
  expect(answerMatches(q, q.expected)).toBe(true);
  expect(answerMatches(q, 'unrelated')).toBe(false);
  expect(answerMatches(q, 'confirmed=a,a;unresolved=b')).toBe(false);
});
