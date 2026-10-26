import { expect, it } from 'bun:test';
import { applyOp, initialState } from '../../domain/forensic/upstream/index';
import { restoreSnapshot } from './snapshot';

const secret = 'a'.repeat(64);
it.each([
  'receipt-id',
  'receipt-digest',
  'duplicate-receipt',
  'message',
  'status',
  'question',
])(
  'rejects corrupted operation receipts or results even with otherwise consistent counters: %s',
  (fault) => {
    let state = initialState({
      eventId: 'result-test',
      teamIds: ['solo'],
      matchSecret: secret,
    });
    state = applyOp(state, 'solo', {
      kind: 'answer',
      id: 'first',
      revision: 0,
      generation: 1,
      caseId: 'identity',
      questionId: 'account',
      answer: 'wrong',
      evidenceIds: [],
    });
    state = applyOp(state, 'solo', {
      kind: 'answer',
      id: 'second',
      revision: 1,
      generation: 1,
      caseId: 'identity',
      questionId: 'account',
      answer: 'wrong',
      evidenceIds: [],
    });
    const team = state.teams['solo'];
    if (!team || !team.lastResult) throw new Error('Missing source state');
    const receipt = team.receipts[0];
    if (!receipt) throw new Error('Missing source receipt');
    switch (fault) {
      case 'receipt-id':
        receipt.id = ' ';
        break;
      case 'receipt-digest':
        receipt.digest = 'corrupt';
        break;
      case 'duplicate-receipt':
        team.receipts = [receipt, receipt];
        break;
      case 'message':
        Reflect.set(team.lastResult.message, 'en', 42);
        break;
      case 'status':
        team.lastResult.status = 'hint';
        break;
      case 'question':
        team.lastResult.questionId = 'missing';
        break;
    }
    const { matchSecret: _secret, ...saved } = state;
    expect(() => restoreSnapshot(JSON.stringify(saved), secret)).toThrow();
  }
);
function data() {
  const { matchSecret: _secret, ...state } = initialState({
    eventId: 'snapshot-test',
    teamIds: ['solo'],
    matchSecret: secret,
  });
  return state;
}
it('accepts the exact original initial schema and reconstructs the private seed only in the host', () => {
  const stored = data();
  expect(restoreSnapshot(JSON.stringify(stored), secret)).toEqual(
    initialState({
      eventId: 'snapshot-test',
      teamIds: ['solo'],
      matchSecret: secret,
    })
  );
});
it.each(['null', '[]', '42', '{invalid'])(
  'rejects a malformed durable payload: %s',
  (raw) => {
    expect(() => restoreSnapshot(raw, secret)).toThrow();
  }
);
it.each([
  'schema',
  'generation',
  'event',
  'roster',
  'question',
  'solved',
  'attempts',
  'hints',
  'score',
  'revision',
  'receipts',
  'result',
  'extra',
])(
  'rejects internally inconsistent saved state rather than resetting progress: %s',
  (fault) => {
    const state = data();
    const team = state.teams['solo'];
    if (!team) throw new Error('Missing source team');
    const first = Object.values(team.progress)[0];
    if (!first) throw new Error('Missing source progress');
    switch (fault) {
      case 'schema':
        Reflect.set(state, 'schemaVersion', 99);
        break;
      case 'generation':
        state.generation = 0;
        break;
      case 'event':
        state.eventId = '';
        break;
      case 'roster':
        Reflect.set(state.teams, 'foreign', team);
        break;
      case 'question':
        delete team.progress[Object.keys(team.progress)[0] ?? ''];
        break;
      case 'solved':
        first.solved = true;
        break;
      case 'attempts':
        first.attempts = -1;
        break;
      case 'hints':
        first.unlockedHints = 4;
        break;
      case 'score':
        team.score = 400;
        break;
      case 'revision':
        team.revision = 1;
        break;
      case 'receipts':
        team.receipts = [{ id: 'unexpected', digest: 'a'.repeat(64) }];
        break;
      case 'result':
        Reflect.set(team, 'lastResult', {});
        break;
      case 'extra':
        Reflect.set(state, 'matchSecret', 'must-not-be-in-sqlite');
        break;
    }
    expect(() => restoreSnapshot(JSON.stringify(state), secret)).toThrow();
  }
);
