import { expect, it } from 'bun:test';
import {
  answerMatches,
  buildCases,
} from '../../domain/forensic/upstream/fixtures';
import {
  applyOp,
  initialState,
  projectForTeam,
} from '../../domain/forensic/upstream/index';
import type { Projection } from '../../domain/forensic/upstream/types';
import {
  type AnswerValues,
  answerLabel,
  questionSummary,
  questionTitle,
  tapAnswer,
  updateAnswerField,
} from './tap-answer';

function expectedValues(id: string, expected: string): AnswerValues {
  const aliases: Record<string, string> = {
    loss_window_minutes: 'minutes',
    production_ready: 'production',
  };
  if (expected.includes('='))
    return Object.fromEntries(
      expected
        .split(';')
        .filter((part) => !part.startsWith('scope='))
        .map((part) => {
          const [key = '', value = ''] = part.split('=');
          return [aliases[key] ?? key, value.split(',')];
        })
    );
  const key = id === 'preserve' || id === 'reboot' ? 'action' : id;
  return { [key]: id === 'order' ? expected.split(',') : [expected] };
}
function checkCandidates(
  model: NonNullable<ReturnType<typeof tapAnswer>>,
  values: AnswerValues
) {
  for (const field of model.fields) {
    if (field.kind === 'number') continue;
    expect(field.options.length).toBeGreaterThan(1);
    for (const selected of values[field.id] ?? [])
      expect(field.options).toContain(selected);
  }
  const wrong = { ...values, [model.fields[0]?.id ?? '']: ['not-in-evidence'] };
  expect(model.encode(wrong)).toBe('');
}
for (const secret of ['a', 'b', 'c']) {
  it(`represents every original answer without importing secrets into UI; seed ${secret}`, () => {
    let state = initialState({
      eventId: 'tap-contract',
      teamIds: ['solo'],
      matchSecret: secret.repeat(64),
    });
    const privateCases = buildCases(state, 'solo');
    let number = 0;
    for (const privateCase of privateCases)
      for (const question of privateCase.questions) {
        const projection = projectForTeam(state, 'solo');
        const c = projection.cases.find((entry) => entry.id === privateCase.id);
        if (!c) throw new Error('Missing public case');
        const model = tapAnswer(c, question.id);
        if (!model) throw new Error(`Unsupported ${c.id}/${question.id}`);
        expect(model.encode({})).toBe('');
        const values = expectedValues(question.id, question.expected);
        const encoded = model.encode(values);
        expect(answerMatches(question, encoded)).toBe(true);
        checkCandidates(model, values);
        state = applyOp(state, 'solo', {
          id: `tap-${++number}`,
          kind: 'answer',
          revision: projection.revision,
          generation: projection.generation,
          caseId: c.id,
          questionId: question.id,
          answer: encoded,
          evidenceIds: question.citations,
        });
        expect(projectForTeam(state, 'solo').lastResult?.status).toBe(
          'correct'
        );
      }
    expect(number).toBe(15);
    expect(projectForTeam(state, 'solo').score).toBe(400);
  });
}
it('retains ordered taps and undo rather than sorting by timestamps or correct order', () => {
  const field = {
    id: 'order',
    label: ['順序', 'Order'] as const,
    kind: 'ordered' as const,
    options: ['later', 'earlier', 'third'],
    limit: 2,
  };
  let selected = updateAnswerField(field, [], 'later');
  selected = updateAnswerField(field, selected, 'earlier');
  expect(selected).toEqual(['later', 'earlier']);
  expect(updateAnswerField(field, selected, 'third')).toEqual(selected);
  expect(updateAnswerField(field, selected, 'later')).toEqual(['earlier']);
  expect(updateAnswerField(field, selected, 'foreign')).toEqual(selected);
  expect(
    updateAnswerField(
      { ...field, kind: 'multiple', options: ['a', 'b'] },
      ['a'],
      'b'
    )
  ).toEqual(['a', 'b']);
  expect(
    updateAnswerField(
      { ...field, kind: 'multiple', options: ['a', 'b'] },
      ['a', 'b'],
      'a'
    )
  ).toEqual(['b']);
});
it('number keys edit a number without opening a keyboard and retain the operation bound', () => {
  const field = {
    id: 'bytes',
    label: ['数', 'Number'] as const,
    options: [],
    kind: 'number' as const,
  };
  expect(updateAnswerField(field, ['0'], '3')).toEqual(['3']);
  expect(updateAnswerField(field, ['32'], '1')).toEqual(['321']);
  expect(updateAnswerField(field, ['32'], '⌫')).toEqual(['3']);
  expect(updateAnswerField(field, ['32'], 'C')).toEqual(['']);
  expect(updateAnswerField(field, ['32'], 'x')).toEqual(['32']);
  expect(updateAnswerField(field, ['1'.repeat(512)], '2')[0]?.length).toBe(512);
});
it('single choices replace rather than silently accumulating another answer', () => {
  const field = {
    id: 'action',
    label: ['回答', 'Answer'] as const,
    options: ['a', 'b'],
  };
  expect(updateAnswerField(field, ['a'], 'b')).toEqual(['b']);
});
it('unknown and malformed public evidence use the visible manual fallback', () => {
  const state = initialState({
    eventId: 'fallback',
    teamIds: ['solo'],
    matchSecret: 'a'.repeat(64),
  });
  const cases = projectForTeam(state, 'solo').cases;
  for (const c of cases) expect(tapAnswer(c, 'future-question')).toBeNull();
  const c = cases[0];
  if (!c) throw new Error('Missing case');
  expect(tapAnswer({ ...c, id: 'future-case' }, 'account')).toBeNull();
  for (const content of ['not-json', 'null', '{"events":[{"account":4}]}'])
    expect(
      tapAnswer(
        {
          ...c,
          evidence: [
            {
              id: 'I-IDP',
              content,
              name: 'bad',
              description: { ja: '', en: '' },
              sha256: '',
            },
          ],
        },
        'account'
      )
    ).toBeNull();
  expect(tapAnswer({ ...c, evidence: [] }, 'account')).toBeNull();
  const endpoint = cases.find((entry) => entry.id === 'endpoint');
  if (!endpoint) throw new Error('Missing endpoint');
  expect(tapAnswer({ ...endpoint, evidence: [] }, 'preserve')).toBeNull();
  expect(
    tapAnswer(
      {
        ...endpoint,
        evidence: endpoint.evidence.map((e) =>
          e.id === 'E-PLAN'
            ? { ...e, content: '{"commands":[5,"snapshot","reboot","x=y"]}' }
            : e
        ),
      },
      'preserve'
    )?.fields[0]?.options
  ).toEqual(['snapshot', 'reboot']);
});
it('does not submit a partial sequence, malformed number or overlong structured answer', () => {
  const state = initialState({
    eventId: 'boundaries',
    teamIds: ['solo'],
    matchSecret: 'b'.repeat(64),
  });
  const cases = projectForTeam(state, 'solo').cases;
  const c = (id: string): Projection['cases'][number] => {
    const value = cases.find((entry) => entry.id === id);
    if (!value) throw new Error('Missing case');
    return value;
  };
  const order = tapAnswer(c('timeline'), 'order');
  const option = order?.fields[0]?.options[0];
  expect(order?.encode({ order: option ? [option] : [] })).toBe('');
  expect(tapAnswer(c('timeline'), 'bytes')?.encode({ bytes: ['-1'] })).toBe('');
  expect(
    tapAnswer(c('recovery'), 'assurance')?.encode({
      minutes: ['1'.repeat(512)],
      production: ['no'],
    })
  ).toBe('');
  expect(questionTitle('account', 'ja')).toContain('アカウント');
  expect(questionTitle('account', 'en')).toBe('Account used');
  expect(questionTitle('future', 'en')).toBe('future');
  expect(questionSummary('account', 'ja')).toContain('認証ログ');
  expect(questionSummary('account', 'en')).toContain('login');
  expect(questionSummary('future', 'en')).toBe('future');
  expect(answerLabel('approved', 'ja')).toContain('承認');
  expect(answerLabel('approved', 'en')).toBe('approved');
  expect(answerLabel('account-name', 'ja')).toBe('account-name');
});
