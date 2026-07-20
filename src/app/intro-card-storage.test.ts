import { afterEach, describe, expect, it } from 'bun:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { IntroCard } from '../domain/intro-card';
import { ExpoFileSystemIntroCardStorageAdapter } from './expo-file-system-intro-card-storage';
import {
  IntroCardStorageError,
  type IntroCardStoragePort,
  UnavailableIntroCardStorageAdapter,
} from './intro-card-storage';
import {
  BunProfileDocument,
  FileBackedWebStorage,
  temporaryDirectory as newTemporaryDirectory,
  removeTemporaryDirectory,
  WriteFailingProfileDocument,
  WriteFailingWebStorage,
} from './storage-test-kit';
import {
  INTRO_CARD_STORAGE_KEY,
  WebIntroCardStorageAdapter,
} from './web-intro-card-storage';

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

function card(): IntroCard {
  return {
    name: '田中太郎',
    title: 'Engineer',
    selfIntro: 'LT 登壇者です。',
    links: ['https://github.com/example'],
  };
}

async function expectStorageError(
  action: () => Promise<unknown>,
  code: IntroCardStorageError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('IntroCardStorageError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(IntroCardStorageError);
    if (error instanceof IntroCardStorageError) {
      expect(error.code).toBe(code);
      expect(error.cause).toBeDefined();
    }
  }
}

async function saveAndRestore(storage: IntroCardStoragePort): Promise<void> {
  expect(await storage.load()).toBeNull();
  expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
  await storage.save(card());
  expect(await storage.load()).toEqual(card());
  const usage = await storage.inspect();
  expect(usage.count).toBe(1);
  expect(usage.bytes).toBeGreaterThan(0);
  await storage.remove();
  await storage.remove();
  expect(await storage.load()).toBeNull();
  expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
}

describe('Intro Card Storage adapter', () => {
  it('file-backed localStorage 相当へ明示保存した Intro Card だけを復元する', async () => {
    const storage = new WebIntroCardStorageAdapter(
      new FileBackedWebStorage(temporaryDirectory())
    );

    await saveAndRestore(storage);
  });

  it('実ファイル I/O を使う Native adapter で明示保存した Intro Card だけを復元する', async () => {
    const document = new BunProfileDocument(
      path.join(temporaryDirectory(), 'intro-card.json')
    );
    const storage = new ExpoFileSystemIntroCardStorageAdapter(document);

    await saveAndRestore(storage);
  });

  it('Web と Native の壊れた JSON を INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(INTRO_CARD_STORAGE_KEY, '{');
    const nativePath = path.join(temporaryDirectory(), 'intro-card.json');
    writeFileSync(nativePath, '{', 'utf8');

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemIntroCardStorageAdapter(
          new BunProfileDocument(nativePath)
        ).load(),
      'INVALID_DATA'
    );
  });

  it('name を欠いた保存データを INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(INTRO_CARD_STORAGE_KEY, JSON.stringify({ title: 'x' }));

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('links が文字列配列ではない保存データを INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(
      INTRO_CARD_STORAGE_KEY,
      JSON.stringify({ name: '田中太郎', links: 'not-an-array' })
    );

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('フィールド上限を超える保存データも createIntroCard の検証で INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(
      INTRO_CARD_STORAGE_KEY,
      JSON.stringify({ name: 'あ'.repeat(51) })
    );

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('createIntroCard の検証に違反する Card を保存しようとすると INVALID_DATA を投げる（型を経由しない誤用への防御）', async () => {
    const invalidCard: IntroCard = { name: '' };

    await expectStorageError(
      () =>
        new WebIntroCardStorageAdapter(
          new FileBackedWebStorage(temporaryDirectory())
        ).save(invalidCard),
      'INVALID_DATA'
    );
  });

  it('Storage 媒体がない場合は UNAVAILABLE を返す', async () => {
    await expectStorageError(
      () => new WebIntroCardStorageAdapter(null).load(),
      'UNAVAILABLE'
    );
    await expectStorageError(
      () => new ExpoFileSystemIntroCardStorageAdapter(null).save(card()),
      'UNAVAILABLE'
    );
    const unavailable = new UnavailableIntroCardStorageAdapter(
      new Error('OS の保存領域を開けません。')
    );
    await expectStorageError(() => unavailable.load(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.save(card()), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.inspect(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.remove(), 'UNAVAILABLE');
  });

  it('実ファイルの読込失敗と書込失敗を区別して返す', async () => {
    const webRoot = temporaryDirectory();
    const failure = new Error('write failure');

    await expectStorageError(
      () =>
        new WebIntroCardStorageAdapter(
          new WriteFailingWebStorage(webRoot, failure)
        ).save(card()),
      'WRITE_FAILED'
    );

    const missingParent = path.join(
      temporaryDirectory(),
      'missing',
      'intro-card.json'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemIntroCardStorageAdapter(
          new WriteFailingProfileDocument(missingParent, failure)
        ).save(card()),
      'WRITE_FAILED'
    );
  });

  it('Native 使用量は OS が size を返さない場合も実内容の Byte 数を返す', async () => {
    const filePath = path.join(temporaryDirectory(), 'size-unknown.json');
    const delegate = new BunProfileDocument(filePath);
    await delegate.write(JSON.stringify(card()));
    const sizeUnknownDocument = {
      get exists(): boolean {
        return delegate.exists;
      },
      get size(): null {
        return null;
      },
      text: () => delegate.text(),
      write: (content: string) => delegate.write(content),
      delete: () => delegate.delete(),
    };
    const storage = new ExpoFileSystemIntroCardStorageAdapter(
      sizeUnknownDocument
    );

    const usage = await storage.inspect();

    expect(usage.count).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });
});
