import { expect, test } from 'bun:test';
import { emptyLearningState } from '../../app/learning/bundled';
import { lessonKey } from '../learning/model';
import {
  addCatalog,
  advance,
  answer,
  startLesson,
} from '../learning/transitions';
import { exportBackup, restoreBackup } from '../learning/validation';
import { bundledPractice, practiceCatalog, validateDraft } from './catalog';
import { inv } from './upstream/field';
import {
  isRsaPublicKey,
  isSmallPrime,
  parseRsaAnswer,
  parseRsaNumber,
  rsaEncrypt,
  rsaFactorsFit,
} from './upstream/rsa';
import { share } from './upstream/shamir';

test('all malformed model parameters fail before building a catalog', () => {
  for (const value of [
    null,
    [],
    2,
    '',
    {},
    { kind: {}, first: 0, second: 0 },
    { kind: 'rsa', first: 0, second: 0, answer: 1 },
    { kind: 'shell', first: 0, second: 0 },
  ])
    expect(() => validateDraft(value)).toThrow();
  for (const value of [-1, 97, 0.5, Infinity, NaN, '1', null, undefined]) {
    expect(() =>
      validateDraft({ kind: 'rsa', first: value, second: 0 })
    ).toThrow();
    expect(() =>
      validateDraft({ kind: 'shares', first: 0, second: value })
    ).toThrow();
  }
  expect(() => practiceCatalog([], 'ja', 'apple')).toThrow();
  expect(() =>
    practiceCatalog(
      Array(4).fill({ kind: 'rsa', first: 1, second: 2 }),
      'en',
      'apple'
    )
  ).toThrow();
});
test('validation rejects inherited/accessor fields without invoking getters and returns an immutable independent snapshot', () => {
  const inherited = Object.assign(Object.create({ kind: 'field' }), {
    first: 1,
    second: 2,
    extra: 'unreviewed',
  });
  expect(() => validateDraft(inherited)).toThrow();
  let reads = 0;
  const accessor = {
    kind: 'field',
    second: 0,
    get first() {
      reads++;
      return reads < 5 ? 1 : 999;
    },
  };
  expect(() => validateDraft(accessor)).toThrow();
  expect(reads).toBe(0);
  const draft = { kind: 'field', first: 1, second: 2 };
  const stable = validateDraft(draft);
  draft.first = 999;
  expect(stable.first).toBe(1);
  expect(Object.isFrozen(stable)).toBe(true);
  const symbol = { ...draft, first: 1, [Symbol('kind')]: 1 };
  expect(() => validateDraft(symbol)).toThrow();
  const noKind = { first: 1, second: 2, extra: 1 };
  expect(() => validateDraft(noKind)).toThrow();
});

const parameterCases = (['ja', 'en'] as const).flatMap((locale) =>
  [0, 1, 32, 33, 76, 96].flatMap((first) =>
    [0, 13, 96].flatMap((second) =>
      (['rsa', 'shares', 'field'] as const).map((kind) => ({
        locale,
        first,
        second,
        kind,
      }))
    )
  )
);
test.each(parameterCases)(
  'bounded original arithmetic: %j',
  ({ locale, first, second, kind }) => {
    const catalog = practiceCatalog([{ kind, first, second }], locale, 'apple');
    const step = catalog.lessons[0]?.steps[0];
    if (!step) throw new Error('Missing template');
    const expected =
      kind === 'rsa'
        ? Number(BigInt(first % 33) ** 7n % 33n)
        : kind === 'shares'
          ? first
          : (first + second) % 97;
    expect(step.correctChoiceID).toBe(String(expected));
    expect(step.choices.filter((c) => c.id === String(expected))).toHaveLength(
      1
    );
    expect(new Set(step.choices.map((c) => c.id)).size).toBe(4);
    expect(catalog.lessons[0]?.summary).toContain(
      locale === 'ja' ? '個人練習' : 'Personal practice'
    );
  }
);
test('both bundled locales contain three original arithmetic units', () => {
  expect(bundledPractice('ja').lessons).toHaveLength(3);
  expect(bundledPractice('en').lessons).toHaveLength(3);
});

test('generated numeric exercise retains existing repeat-attempt and completion semantics and backup recovery', () => {
  const catalog = practiceCatalog(
    [{ kind: 'field', first: 90, second: 10 }],
    'en',
    'apple'
  );
  const lesson = catalog.lessons[0];
  if (!lesson) throw new Error('Missing lesson');
  const key = lessonKey(catalog, lesson);
  let state = startLesson(
    addCatalog(emptyLearningState(), catalog),
    key,
    'practice'
  );
  const request = {
    key,
    stepID: 'calculate',
    session: 'practice',
    choiceID: '3',
    timestamp: 1,
  };
  state = answer(state, request);
  expect(state.attempts[0]?.result).toBe('correct');
  state = answer(state, request);
  expect(state.attempts).toHaveLength(2);
  state = advance(state, key, 'practice', 'calculate');
  expect(() => answer(state, request)).toThrow();
  expect(restoreBackup(exportBackup(state), [])).toEqual(state);
});

test('original RSA wire bounds and arithmetic retain malformed input rejection', () => {
  for (const key of [
    null,
    {},
    { n: 5, e: 3 },
    { n: 78, e: 3 },
    { n: 33, e: 4 },
    { n: 33.5, e: 7 },
  ])
    expect(isRsaPublicKey(key)).toBe(false);
  for (const value of [null, 0, '', '00', '-1', '1.5', '100', '33'])
    expect(parseRsaNumber(value, 33)).toBeUndefined();
  expect(parseRsaNumber('0', 33)).toBe(0);
  for (const value of [null, [], ['1', '2'], ['33'], [1]])
    expect(parseRsaAnswer(value, 33)).toBeUndefined();
  expect(parseRsaAnswer(['32'], 33)).toEqual([32]);
  for (const value of [-1, 33, 0.5])
    expect(() => rsaEncrypt(value, { n: 33, e: 7 })).toThrow();
  expect(() => rsaEncrypt(1, { n: 1, e: 7 })).toThrow();
  for (let value = 0; value < 33; value++)
    expect(rsaEncrypt(value, { n: 33, e: 7 })).toBe(
      Number(BigInt(value) ** 7n % 33n)
    );
  for (const n of [-1, 0, 1, 2, 3, 4, 9, 11, 77, 78, 2.5]) {
    const prime =
      Number.isInteger(n) &&
      n >= 2 &&
      n <= 77 &&
      !Array.from(
        { length: Math.max(0, Math.floor(Math.sqrt(n)) - 1) },
        (_, i) => i + 2
      ).some((d) => n % d === 0);
    expect(isSmallPrime(n)).toBe(prime);
  }
  expect(rsaFactorsFit(33, '3', '11')).toBe(true);
  expect(rsaFactorsFit(33, '11', '3')).toBe(true);
  for (const [a, b] of [
    ['3', '3'],
    ['0', '33'],
    ['4', '8'],
    ['3', '7'],
    ['01', '33'],
    ['3', 'invalid'],
  ])
    expect(rsaFactorsFit(33, a, b)).toBe(false);
  expect(() => inv(2n, 4n)).toThrow('not invertible');
  for (const threshold of [0, -1, 0.5])
    expect(() => share(1n, threshold, 2, [])).toThrow('positive integer');
});
