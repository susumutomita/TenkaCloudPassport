import { afterEach, describe, expect, it } from 'bun:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  QUIZ_CATALOG_VERSION,
  type QuizQuestionId,
} from '../domain/quiz-catalog';
import {
  EMPTY_QUIZ_PROGRESS,
  withQuizQuestionCleared,
} from '../domain/quiz-progress';
import { ExpoFileSystemQuizProgressStorageAdapter } from './expo-file-system-quiz-progress-storage';
import {
  parseStoredQuizProgress,
  QuizProgressStorageError,
  type QuizProgressStoragePort,
  serializeQuizProgress,
  UnavailableQuizProgressStorageAdapter,
} from './quiz-progress-storage';
import {
  BunProfileDocument,
  FileBackedWebStorage,
  temporaryDirectory as newTemporaryDirectory,
  removeTemporaryDirectory,
  WriteFailingProfileDocument,
  WriteFailingWebStorage,
} from './storage-test-kit';
import {
  QUIZ_PROGRESS_STORAGE_KEY,
  WebQuizProgressStorageAdapter,
} from './web-quiz-progress-storage';

const temporaryRoots: string[] = [];

function temporaryDirectory(): string {
  const directory = newTemporaryDirectory();
  temporaryRoots.push(directory);
  return directory;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    removeTemporaryDirectory(root);
  }
});

function progressOf(...ids: readonly QuizQuestionId[]) {
  return ids.reduce(
    (acc, id) => withQuizQuestionCleared(acc, id),
    EMPTY_QUIZ_PROGRESS
  );
}

async function expectStorageError(
  action: () => Promise<unknown>,
  code: QuizProgressStorageError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('QuizProgressStorageError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(QuizProgressStorageError);
    if (error instanceof QuizProgressStorageError) {
      expect(error.code).toBe(code);
      expect(error.cause).toBeDefined();
    }
  }
}

async function saveAndRestore(storage: QuizProgressStoragePort): Promise<void> {
  expect(await storage.load()).toEqual(EMPTY_QUIZ_PROGRESS);
  const progress = progressOf('lambda-basics', 'xray-basics');

  await storage.save(progress);

  expect(await storage.load()).toEqual(progress);
}

describe('Quiz Progress Storage adapter', () => {
  it('file-backed localStorage 相当へ明示保存したクリア済み進捗だけを復元する', async () => {
    const storage = new WebQuizProgressStorageAdapter(
      new FileBackedWebStorage(temporaryDirectory())
    );

    await saveAndRestore(storage);
  });

  it('実ファイル I/O を使う Native adapter で明示保存したクリア済み進捗だけを復元する', async () => {
    const document = new BunProfileDocument(
      path.join(temporaryDirectory(), 'quiz-progress.json')
    );
    const storage = new ExpoFileSystemQuizProgressStorageAdapter(document);

    await saveAndRestore(storage);
  });

  it('保存データが無い場合は空の進捗を返す（初回起動）', async () => {
    const webStorage = new WebQuizProgressStorageAdapter(
      new FileBackedWebStorage(temporaryDirectory())
    );
    const nativeStorage = new ExpoFileSystemQuizProgressStorageAdapter(
      new BunProfileDocument(
        path.join(temporaryDirectory(), 'quiz-progress.json')
      )
    );

    expect(await webStorage.load()).toEqual(EMPTY_QUIZ_PROGRESS);
    expect(await nativeStorage.load()).toEqual(EMPTY_QUIZ_PROGRESS);
  });

  it('Web と Native の壊れた JSON を INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(QUIZ_PROGRESS_STORAGE_KEY, '{');
    const nativePath = path.join(temporaryDirectory(), 'quiz-progress.json');
    writeFileSync(nativePath, '{', 'utf8');

    await expectStorageError(
      () => new WebQuizProgressStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemQuizProgressStorageAdapter(
          new BunProfileDocument(nativePath)
        ).load(),
      'INVALID_DATA'
    );
  });

  it('clearedQuestionIds が文字列配列ではない保存データを INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(
      QUIZ_PROGRESS_STORAGE_KEY,
      JSON.stringify({ clearedQuestionIds: 'not-an-array' })
    );

    await expectStorageError(
      () => new WebQuizProgressStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('保存データが object でない場合 INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(QUIZ_PROGRESS_STORAGE_KEY, '"just a string"');

    await expectStorageError(
      () => new WebQuizProgressStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('現在のカタログに存在しない id が混ざっていても、エラーにせず既知の id だけを復元する（Fail-soft）', async () => {
    const webStorage = new FileBackedWebStorage(temporaryDirectory());
    webStorage.setItem(
      QUIZ_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        clearedQuestionIds: ['lambda-basics', 'a-removed-future-question'],
      })
    );
    const storage = new WebQuizProgressStorageAdapter(webStorage);

    const progress = await storage.load();

    expect([...progress]).toEqual(['lambda-basics']);
  });

  it('Storage 媒体がない場合は UNAVAILABLE を返す', async () => {
    await expectStorageError(
      () => new WebQuizProgressStorageAdapter(null).load(),
      'UNAVAILABLE'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemQuizProgressStorageAdapter(null).save(
          EMPTY_QUIZ_PROGRESS
        ),
      'UNAVAILABLE'
    );
    const unavailable = new UnavailableQuizProgressStorageAdapter(
      new Error('OS の保存領域を開けません。')
    );
    await expectStorageError(() => unavailable.load(), 'UNAVAILABLE');
    await expectStorageError(
      () => unavailable.save(EMPTY_QUIZ_PROGRESS),
      'UNAVAILABLE'
    );
  });

  it('実ファイルの読込失敗と書込失敗を区別して返す', async () => {
    const webRoot = temporaryDirectory();
    const failure = new Error('write failure');

    await expectStorageError(
      () =>
        new WebQuizProgressStorageAdapter(
          new WriteFailingWebStorage(webRoot, failure)
        ).save(EMPTY_QUIZ_PROGRESS),
      'WRITE_FAILED'
    );

    const missingParent = path.join(
      temporaryDirectory(),
      'missing',
      'quiz-progress.json'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemQuizProgressStorageAdapter(
          new WriteFailingProfileDocument(missingParent, failure)
        ).save(EMPTY_QUIZ_PROGRESS),
      'WRITE_FAILED'
    );
  });

  it('serializeQuizProgress は catalogVersion を添え、id を昇順ソートして直列化する（保存内容の安定性）', () => {
    const progress = progressOf('xray-basics', 'iam-explicit-deny');

    expect(serializeQuizProgress(progress)).toBe(
      JSON.stringify({
        catalogVersion: QUIZ_CATALOG_VERSION,
        clearedQuestionIds: ['iam-explicit-deny', 'xray-basics'],
      })
    );
  });

  it('catalogVersion が欠けている（旧バージョンの）保存データも読込を拒否しない', async () => {
    const webStorage = new FileBackedWebStorage(temporaryDirectory());
    webStorage.setItem(
      QUIZ_PROGRESS_STORAGE_KEY,
      JSON.stringify({ clearedQuestionIds: ['lambda-basics'] })
    );
    const storage = new WebQuizProgressStorageAdapter(webStorage);

    const progress = await storage.load();

    expect([...progress]).toEqual(['lambda-basics']);
  });

  it('parseStoredQuizProgress は serializeQuizProgress の出力を正しく復元する（round-trip）', () => {
    const progress = progressOf('lambda-basics', 'vpc-basics');

    const restored = parseStoredQuizProgress(serializeQuizProgress(progress));

    expect(restored).toEqual(progress);
  });
});
