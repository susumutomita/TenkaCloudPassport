import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  type Catalog,
  catalogKey,
  type LearningState,
  type Lesson,
  LIMITS,
  lessonKey,
  type Step,
} from './model';
import { object, requireValid } from './primitives';
import { validateSource } from './source';

export { object, requireValid } from './primitives';

function keys(
  record: Record<string, unknown>,
  allowed: readonly string[]
): void {
  requireValid(Object.keys(record).every((key) => allowed.includes(key)));
}
function text(value: unknown, maximum = 100_000): asserts value is string {
  requireValid(
    typeof value === 'string' && value.length > 0 && value.length <= maximum
  );
}
function optionalText(value: unknown): void {
  if (value !== undefined && value !== null)
    requireValid(typeof value === 'string' && value.length <= 500_000);
}
function list(value: unknown, maximum: number): unknown[] {
  requireValid(Array.isArray(value) && value.length <= maximum);
  return value;
}
function unique(values: readonly string[]): void {
  requireValid(new Set(values).size === values.length);
}
function strings(value: unknown): void {
  if (value !== undefined && value !== null)
    list(value, 100).forEach((item) => {
      text(item);
    });
}
function validateStep(value: unknown): Step {
  const step = object(value);
  ['id', 'phase', 'prompt', 'explanation'].forEach((key) => {
    text(step[key]);
  });
  ['title', 'code', 'reference', 'check'].forEach((key) => {
    optionalText(step[key]);
  });
  strings(step['hints']);
  const choices = list(step['choices'], 20).map((item) => {
    const choice = object(item);
    ['id', 'text', 'explanation'].forEach((key) => {
      text(choice[key]);
    });
    return choice['id'] as string;
  });
  unique(choices);
  requireValid(
    choices.length === 0
      ? step['correctChoiceID'] === null
      : choices.includes(step['correctChoiceID'] as string)
  );
  return value as Step;
}
function validateLesson(value: unknown): Lesson {
  const lesson = object(value);
  ['id', 'title', 'category', 'summary'].forEach((key) => {
    text(lesson[key]);
  });
  const steps = list(lesson['steps'], LIMITS.steps).map(validateStep);
  requireValid(steps.length > 0);
  unique(steps.map((step) => step.id));
  const authors = list(lesson['authors'], 20);
  requireValid(authors.length > 0);
  authors.forEach((item) => {
    const author = object(item);
    text(author['name']);
    optionalText(author['type']);
    optionalText(author['profileURL']);
  });
  [
    'originalRecordJSON',
    'contentVersion',
    'estimatedDuration',
    'englishPrompt',
    'notes',
  ].forEach((key) => {
    optionalText(lesson[key]);
  });
  if (lesson['sources'] !== undefined && lesson['sources'] !== null)
    list(lesson['sources'], 100).forEach((item) => {
      const source = object(item);
      text(source['title']);
      text(source['url']);
    });
  strings(lesson['prerequisites']);
  return value as Lesson;
}
export function validateCatalog(value: unknown): Catalog {
  const catalog = object(value);
  requireValid(catalog['schemaVersion'] === 1);
  text(catalog['catalogID'], 200);
  text(catalog['title'], 500);
  requireValid(
    typeof catalog['version'] === 'string' &&
      /^\d+\.\d+\.\d+$/.test(catalog['version'])
  );
  const lessons = list(catalog['lessons'], LIMITS.lessons).map(validateLesson);
  requireValid(lessons.length > 0);
  unique(lessons.map((lesson) => lesson.id));
  verifyImportedSource(catalog);
  return value as Catalog;
}
export function parseJSON(raw: string, limit: number): unknown {
  requireValid(new TextEncoder().encode(raw).byteLength <= limit);
  return JSON.parse(raw) as unknown;
}
export function importCatalog(raw: string): Catalog {
  const envelope = object(parseJSON(raw, 3_000_000));
  if (!envelope['source'])
    return validateCatalog(parseJSON(raw, LIMITS.catalogBytes));
  requireValid(envelope['schemaVersion'] === 1);
  const source = object(envelope['source']);
  const catalog = validateCatalog(decodeSource(source));
  requireValid(catalog.importedSource === undefined);
  return validateCatalog({ ...catalog, importedSource: source });
}
function decodeSource(source: Record<string, unknown>): unknown {
  text(source['repositoryURL'], 1000);
  const url = new URL(source['repositoryURL']);
  requireValid(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
  );
  requireValid(
    typeof source['commitSHA'] === 'string' &&
      /^[a-f0-9]{40}$/.test(source['commitSHA'])
  );
  requireValid(
    typeof source['contentSHA256'] === 'string' &&
      /^[a-f0-9]{64}$/.test(source['contentSHA256'])
  );
  text(source['payloadBase64'], 2_700_000);
  requireValid(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      source['payloadBase64']
    )
  );
  const bytes = Uint8Array.from(atob(source['payloadBase64']), (character) =>
    character.charCodeAt(0)
  );
  requireValid(
    bytes.length <= LIMITS.catalogBytes &&
      bytesToHex(sha256(bytes)) === source['contentSHA256']
  );
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  ) as unknown;
}
function verifyImportedSource(catalog: Record<string, unknown>): void {
  if (catalog['importedSource'] === undefined) return;
  const payload = object(decodeSource(object(catalog['importedSource'])));
  requireValid(payload['importedSource'] === undefined);
  validateCatalog(payload);
  const content = { ...catalog };
  delete content['importedSource'];
  requireValid(canonicalJSON(content) === canonicalJSON(payload));
}

export function validateState(value: unknown): LearningState {
  const state = object(value);
  keys(state, [
    'schemaVersion',
    'nextAttemptID',
    'catalogs',
    'progress',
    'attempts',
    'sources',
  ]);
  if (state['sources'] !== undefined) {
    const sources = list(state['sources'], 20).map(validateSource);
    unique(sources.map((item) => item.manifestURL));
  }
  requireValid(state['schemaVersion'] === 1);
  requireValid(
    Number.isSafeInteger(state['nextAttemptID']) &&
      (state['nextAttemptID'] as number) >= 0
  );
  const catalogs = list(state['catalogs'], LIMITS.catalogs).map(
    validateCatalog
  );
  unique(catalogs.map(catalogKey));
  const lessons = new Map(
    catalogs.flatMap((catalog) =>
      catalog.lessons.map(
        (lesson) => [lessonKey(catalog, lesson), lesson] as const
      )
    )
  );
  const progress = list(state['progress'], LIMITS.catalogs * LIMITS.lessons);
  const progressMap = new Map<string, Record<string, unknown>>();
  progress.forEach((item) => {
    const record = object(item);
    keys(record, ['key', 'index', 'session', 'completed', 'review']);
    text(record['key']);
    text(record['session'], 200);
    const lesson = lessons.get(record['key']);
    requireValid(lesson);
    requireValid(
      Number.isSafeInteger(record['index']) &&
        (record['index'] as number) >= 0 &&
        (record['index'] as number) <= lesson.steps.length
    );
    requireValid(
      typeof record['completed'] === 'boolean' &&
        typeof record['review'] === 'boolean'
    );
    requireValid(
      record['completed'] === (record['index'] === lesson.steps.length)
    );
    requireValid(!progressMap.has(record['key']));
    progressMap.set(record['key'], record);
  });
  const attempts = list(state['attempts'], LIMITS.attempts);
  unique(
    attempts.map((item) => {
      const id = object(item)['id'];
      text(id);
      return id;
    })
  );
  requireValid(
    attempts.every(
      (item) => Number(object(item)['id']) < (state['nextAttemptID'] as number)
    )
  );
  attempts.forEach((item) => {
    validateAttempt(item, lessons, progressMap);
  });
  return value as LearningState;
}
function validateAttempt(
  value: unknown,
  lessons: Map<string, Lesson>,
  progress: Map<string, Record<string, unknown>>
): void {
  const attempt = object(value);
  keys(attempt, [
    'id',
    'key',
    'stepID',
    'session',
    'timestamp',
    'choiceID',
    'result',
  ]);
  text(attempt['id'], 500);
  requireValid(
    /^(0|[1-9][0-9]*)$/.test(attempt['id']) &&
      Number.isSafeInteger(Number(attempt['id']))
  );
  text(attempt['key']);
  text(attempt['session'], 200);
  text(attempt['stepID']);
  const lesson = lessons.get(attempt['key']);
  const step = lesson?.steps.find((item) => item.id === attempt['stepID']);
  requireValid(step && progress.has(attempt['key']));
  requireValid(
    typeof attempt['timestamp'] === 'number' &&
      Number.isFinite(attempt['timestamp']) &&
      attempt['timestamp'] >= 0 &&
      attempt['timestamp'] <= 4_102_444_800_000
  );
  const choice = step.choices.find((item) => item.id === attempt['choiceID']);
  const result = attempt['result'];
  requireValid(
    step.choices.length
      ? choice &&
          result ===
            (choice.id === step.correctChoiceID ? 'correct' : 'incorrect')
      : attempt['choiceID'] === null &&
          (result === 'self-ready' || result === 'self-review')
  );
}
export function restoreBackup(
  raw: string,
  known: readonly Catalog[]
): LearningState {
  const backup = object(parseJSON(raw, LIMITS.backupBytes));
  requireValid(backup['kind'] === 'tenkacloud-passport-learning-backup');
  const restored = validateState(backup['state']);
  const catalogs = [...restored.catalogs];
  for (const catalog of known) {
    const existing = catalogs.find(
      (item) => catalogKey(item) === catalogKey(catalog)
    );
    if (existing)
      requireValid(canonicalJSON(existing) === canonicalJSON(catalog));
    else catalogs.push(catalog);
  }
  return validateState({ ...restored, catalogs });
}
export function exportBackup(state: LearningState): string {
  validateState(state);
  const raw = JSON.stringify({
    kind: 'tenkacloud-passport-learning-backup',
    state,
  });
  requireValid(new TextEncoder().encode(raw).byteLength <= LIMITS.backupBytes);
  return raw;
}

export function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key: string, item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]])
    );
  });
}
