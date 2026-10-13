import { describe, expect, it } from 'bun:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  BUNDLED_CATALOGS,
  emptyLearningState,
} from '../../../tests/fixtures/learning/catalogs';
import { removeCatalog } from './catalog-management';
import {
  type Catalog,
  catalogKey,
  type LearningState,
  LIMITS,
  lessonKey,
} from './model';
import { addCatalog, advance, answer, startLesson } from './transitions';
import {
  canonicalJSON,
  exportBackup,
  importCatalog,
  restoreBackup,
  validateCatalog,
  validateState,
} from './validation';

const catalog = BUNDLED_CATALOGS[0] as Catalog;
const lesson = catalog.lessons[0];
if (!lesson) throw new Error('Missing real lesson');
const step = lesson.steps[0];
if (!step) throw new Error('Missing real step');
const key = lessonKey(catalog, lesson);
function started(): LearningState {
  return startLesson(emptyLearningState(), key, 'session-1');
}
function record(
  state = started(),
  choiceID = step?.correctChoiceID ?? null
): LearningState {
  return answer(state, {
    key,
    stepID: step?.id ?? '',
    session: 'session-1',
    choiceID,
    timestamp: 1000,
  });
}
function external(version = '1.0.0', id = 'external'): Catalog {
  return { ...catalog, catalogID: id, version };
}

describe('offline learning domain', () => {
  it('retains all 87 real lessons with stable identities and authors', async () => {
    expect(
      BUNDLED_CATALOGS.reduce((sum, item) => sum + item.lessons.length, 0)
    ).toBe(87);
    expect(new Set(BUNDLED_CATALOGS.map(catalogKey)).size).toBe(6);
    const manifest = (await Bun.file(
      'tests/fixtures/learning/native-catalog-manifest.json'
    ).json()) as {
      entries: { fileName: string; sha256: string; lessons: number }[];
    };
    for (const entry of manifest.entries) {
      const bytes = new Uint8Array(
        await Bun.file(
          `tests/fixtures/learning/${entry.fileName}`
        ).arrayBuffer()
      );
      expect(bytesToHex(sha256(bytes))).toBe(entry.sha256);
    }
  });
  it('wrong answer has review status and cannot advance; correct answer advances', () => {
    const wrong = step.choices.find((item) => item.id !== step.correctChoiceID);
    if (!wrong) throw new Error('Expected multiple choice');
    const incorrect = record(started(), wrong.id);
    expect(incorrect.progress[0]?.review).toBe(true);
    expect(() => advance(incorrect, key, 'session-1', step.id)).toThrow();
    expect(
      advance(record(incorrect), key, 'session-1', step.id).progress[0]?.index
    ).toBe(1);
  });
  it('requires the current problem, step, session and latest attempt', () => {
    const state = record();
    expect(() => advance(state, key, 'old-session', step.id)).toThrow();
    expect(() => advance(state, key, 'session-1', 'other-step')).toThrow();
    expect(() =>
      answer(state, {
        key,
        stepID: step.id,
        session: 'old-session',
        choiceID: step.correctChoiceID,
        timestamp: 1000,
      })
    ).toThrow();
    const restarted = startLesson(state, key, 'session-2', true);
    expect(() => advance(restarted, key, 'session-2', step.id)).toThrow();
  });
  it('allows self-report without pretending it is correct grading', () => {
    const candidate = catalog.lessons.find((item) =>
      item.steps.some((part) => !part.choices.length)
    );
    if (!candidate) throw new Error('Missing explanation');
    const selfStep = candidate.steps.find((part) => !part.choices.length);
    if (!selfStep) throw new Error('Missing self step');
    const selfKey = lessonKey(catalog, candidate);
    const state = startLesson(emptyLearningState(), selfKey, 'self');
    const index = candidate.steps.indexOf(selfStep);
    const atSelf = {
      ...state,
      progress: [
        {
          key: selfKey,
          index,
          session: 'self',
          completed: false,
          review: false,
        },
      ],
    };
    const result = answer(atSelf, {
      key: selfKey,
      stepID: selfStep.id,
      session: 'self',
      choiceID: null,
      selfReady: false,
      timestamp: 1,
    });
    expect(result.attempts[0]?.result).toBe('self-review');
    expect(
      advance(result, selfKey, 'self', selfStep.id).progress[0]?.index
    ).toBe(index + 1);
  });
  it('serializes a learning-only backup and restores progress/history/catalogs', () => {
    const state = addCatalog(record(), external());
    const restored = restoreBackup(exportBackup(state), BUNDLED_CATALOGS);
    expect(restored).toEqual(state);
    expect(exportBackup(state)).not.toContain('localProfile');
    expect(() =>
      restoreBackup('{"kind":"passport-backup","state":{}}', BUNDLED_CATALOGS)
    ).toThrow();
  });
  it('keeps different catalog versions and forbids same-version content changes', () => {
    const current = addCatalog(emptyLearningState(), external());
    const next = addCatalog(current, external('2.0.0'));
    expect(next.catalogs.length).toBe(8);
    expect(() =>
      addCatalog(current, { ...external(), title: 'changed' })
    ).toThrow();
    const reordered = Object.fromEntries(
      Object.entries(external()).reverse()
    ) as unknown as Catalog;
    expect(addCatalog(current, reordered)).toBe(current);
    expect(canonicalJSON({ b: 2, a: 1 })).toBe(canonicalJSON({ a: 1, b: 2 }));
    expect(() =>
      restoreBackup(
        exportBackup({
          ...current,
          catalogs: current.catalogs.map((item) =>
            item.catalogID === 'external' ? { ...item, title: 'changed' } : item
          ),
        }),
        current.catalogs
      )
    ).toThrow();
  });
  it('rejects duplicate steps/choices, invalid answers, bad progress and orphan attempts', () => {
    expect(() =>
      validateCatalog({ ...catalog, lessons: [lesson, lesson] })
    ).toThrow();
    expect(() =>
      validateCatalog({
        ...catalog,
        lessons: [
          { ...lesson, steps: [{ ...step, correctChoiceID: 'missing' }] },
        ],
      })
    ).toThrow();
    expect(() =>
      validateState({
        ...started(),
        progress: [{ ...started().progress[0], index: -1 }],
      })
    ).toThrow();
    expect(() =>
      validateState({
        ...record(),
        attempts: [{ ...record().attempts[0], timestamp: Infinity }],
      })
    ).toThrow();
    expect(() => validateState({ ...record(), progress: [] })).toThrow();
  });
  it('verifies source envelope SHA and rejects URL credentials or tampering', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(external()));
    const source = {
      repositoryURL: 'https://example.com/materials',
      commitSHA: 'a'.repeat(40),
      contentSHA256: bytesToHex(sha256(bytes)),
      payloadBase64: btoa(String.fromCharCode(...bytes)),
    };
    const envelope = { schemaVersion: 1, source };
    expect(importCatalog(JSON.stringify(envelope)).catalogID).toBe('external');
    expect(() =>
      importCatalog(
        JSON.stringify({
          ...envelope,
          source: { ...source, contentSHA256: 'b'.repeat(64) },
        })
      )
    ).toThrow();
    expect(() =>
      importCatalog(
        JSON.stringify({
          ...envelope,
          source: {
            ...source,
            repositoryURL: 'https://user:password@example.com/repo',
          },
        })
      )
    ).toThrow();
    expect(() => importCatalog(' '.repeat(3_000_001))).toThrow();
  });
  it('revalidates source payload proof during backup restoration', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(external()));
    const source = {
      repositoryURL: 'https://example.com/materials',
      commitSHA: 'a'.repeat(40),
      contentSHA256: bytesToHex(sha256(bytes)),
      payloadBase64: btoa(String.fromCharCode(...bytes)),
    };
    const imported = importCatalog(
      JSON.stringify({ schemaVersion: 1, source })
    );
    const state = addCatalog(emptyLearningState(), imported);
    expect(
      restoreBackup(exportBackup(state), BUNDLED_CATALOGS).catalogs.at(-1)
    ).toEqual(imported);
    const forged = {
      ...state,
      catalogs: state.catalogs.map((item) =>
        item.catalogID === 'external'
          ? { ...item, title: 'changed payload' }
          : item
      ),
    };
    expect(() => validateState(forged)).toThrow();
    expect(() =>
      restoreBackup(
        JSON.stringify({
          kind: 'tenkacloud-passport-learning-backup',
          state: forged,
        }),
        BUNDLED_CATALOGS
      )
    ).toThrow();
  });
  it('rejects over-capacity restore before returning a new state', () => {
    let state = emptyLearningState();
    for (let index = 0; index < LIMITS.catalogs - 6; index += 1)
      state = addCatalog(state, external('1.0.0', `extra-${index}`));
    expect(() => addCatalog(state, external('1.0.0', 'overflow'))).toThrow();
    expect(() =>
      restoreBackup(exportBackup(state), [external('1.0.0', 'future-bundle')])
    ).toThrow();
  });
  it('catalog removal removes only associated progress/history and preserves others', () => {
    const state = addCatalog(record(), external());
    const removed = removeCatalog(state, external());
    expect(removed.progress).toEqual(state.progress);
    expect(removed.attempts).toEqual(state.attempts);
    const clear = removeCatalog(state, catalog);
    expect(clear.progress).toEqual([]);
    expect(clear.attempts).toEqual([]);
  });
  it('rotates history at capacity without blocking new practice', () => {
    const state = record();
    const attempts = Array.from({ length: LIMITS.attempts }, (_, index) => ({
      ...state.attempts[0],
      id: String(index),
    }));
    const full = validateState({
      ...state,
      attempts,
      nextAttemptID: LIMITS.attempts,
    });
    const next = record(full);
    expect(next.attempts.length).toBe(LIMITS.attempts);
    expect(next.attempts[0]?.id).toBe('1');
    expect(next.attempts.at(-1)?.id).toBe(String(LIMITS.attempts));
  });
});
