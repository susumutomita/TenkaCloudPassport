import { describe, expect, it } from 'bun:test';
import {
  ExpoFileSystemLocalePreferenceStorageAdapter,
  LocalePreferenceStorageError,
  type LocalePreferenceStoragePort,
  WebLocalePreferenceStorageAdapter,
} from './locale-preference-storage';
import {
  BunProfileDocument,
  DeleteFailingWebStorage,
  FileBackedWebStorage,
  ReadFailingProfileDocument,
  trackTemporaryDirectories,
  WriteFailingProfileDocument,
} from './storage-test-kit';

const temporaryDirectories = trackTemporaryDirectories();

async function expectStorageError(
  action: () => Promise<unknown>,
  code: LocalePreferenceStorageError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('LocalePreferenceStorageError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalePreferenceStorageError);
    if (error instanceof LocalePreferenceStorageError) {
      expect(error.code).toBe(code);
      expect(error.cause).toBeDefined();
    }
  }
}

async function saveAndRestore(storage: LocalePreferenceStoragePort) {
  expect(await storage.load()).toBeNull();
  await storage.save('en');
  expect(await storage.load()).toBe('en');
  await storage.save('ja');
  expect(await storage.load()).toBe('ja');
}

describe('Web の Locale Preference Storage', () => {
  it('実 Storage へ明示選択を保存し、次回読込で優先する', async () => {
    const storage = new WebLocalePreferenceStorageAdapter(
      new FileBackedWebStorage(temporaryDirectories.create())
    );

    await saveAndRestore(storage);
  });

  it('未保存のキーは null（自動判定へ委ねる）を返す', async () => {
    const storage = new WebLocalePreferenceStorageAdapter(
      new FileBackedWebStorage(temporaryDirectories.create())
    );

    expect(await storage.load()).toBeNull();
  });

  it('保存済みの値が LOCALES に無い不正な値なら null を返す', async () => {
    const root = temporaryDirectories.create();
    const rawStorage = new FileBackedWebStorage(root);
    rawStorage.setItem('tenkacloud-passport.locale-preference', 'fr');
    const storage = new WebLocalePreferenceStorageAdapter(rawStorage);

    expect(await storage.load()).toBeNull();
  });

  it('Storage 不在を READ_FAILED / WRITE_FAILED の型付き Error にする', async () => {
    const storage = new WebLocalePreferenceStorageAdapter(null);

    await expectStorageError(() => storage.load(), 'READ_FAILED');
    await expectStorageError(() => storage.save('en'), 'WRITE_FAILED');
  });

  it('実 Storage operation の失敗を read / write ごとに区別する', async () => {
    const root = temporaryDirectories.create();
    const failure = new Error('private path failure');

    await expectStorageError(
      () =>
        new WebLocalePreferenceStorageAdapter(
          new DeleteFailingWebStorage(root, failure, 'get')
        ).load(),
      'READ_FAILED'
    );
    await expectStorageError(
      () =>
        new WebLocalePreferenceStorageAdapter(
          new DeleteFailingWebStorage(root, failure, 'set')
        ).save('en'),
      'WRITE_FAILED'
    );
  });
});

describe('Native（Expo File System）の Locale Preference Storage', () => {
  it('実ファイルへ明示選択を保存し、次回読込で優先する', async () => {
    const storage = new ExpoFileSystemLocalePreferenceStorageAdapter(
      new BunProfileDocument(
        `${temporaryDirectories.create()}/locale-preference`
      )
    );

    await saveAndRestore(storage);
  });

  it('保存済みの値が LOCALES に無い不正な値なら null を返す', async () => {
    const filePath = `${temporaryDirectories.create()}/locale-preference`;
    const document = new BunProfileDocument(filePath);
    await document.write('fr');
    const storage = new ExpoFileSystemLocalePreferenceStorageAdapter(document);

    expect(await storage.load()).toBeNull();
  });

  it('Document 不在を READ_FAILED / WRITE_FAILED の型付き Error にする', async () => {
    const storage = new ExpoFileSystemLocalePreferenceStorageAdapter(null);

    await expectStorageError(() => storage.load(), 'READ_FAILED');
    await expectStorageError(() => storage.save('en'), 'WRITE_FAILED');
  });

  it('実ファイル operation の失敗を read / write ごとに区別する', async () => {
    const filePath = `${temporaryDirectories.create()}/locale-preference`;
    const failure = new Error('private path write failure');

    await expectStorageError(
      () =>
        new ExpoFileSystemLocalePreferenceStorageAdapter(
          new ReadFailingProfileDocument(
            filePath,
            new Error('private path read failure')
          )
        ).load(),
      'READ_FAILED'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemLocalePreferenceStorageAdapter(
          new WriteFailingProfileDocument(filePath, failure)
        ).save('en'),
      'WRITE_FAILED'
    );
  });

  it('ReadFailingProfileDocument は読込だけ失敗し、write / delete は実ファイルへ本物の I/O を行う', async () => {
    const filePath = `${temporaryDirectories.create()}/locale-preference`;
    const document = new ReadFailingProfileDocument(
      filePath,
      new Error('private path read failure')
    );

    expect(document.size).toBeNull();
    await expect(document.text()).rejects.toThrow('private path read failure');
    await new ExpoFileSystemLocalePreferenceStorageAdapter(document).save('en');
    expect(await new BunProfileDocument(filePath).text()).toBe('en');
    await document.delete();
    expect(new BunProfileDocument(filePath).exists).toBeFalse();
  });
});
