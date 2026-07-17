import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLocalPrivateProfile } from '../domain/passport';
import {
  ExpoFileSystemLocalProfileStorageAdapter,
  type ProfileDocument,
} from './expo-file-system-local-profile-storage';
import {
  LocalProfileStorageError,
  type LocalProfileStoragePort,
  UnavailableLocalProfileStorageAdapter,
} from './local-profile-storage';
import {
  type WebKeyValueStorage,
  WebLocalProfileStorageAdapter,
} from './web-local-profile-storage';

const temporaryRoots: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'passport-storage-'));
  temporaryRoots.push(directory);
  return directory;
}

function clearDirectory(directory: string): void {
  for (const entry of readdirSync(directory)) {
    const target = path.join(directory, entry);
    if (lstatSync(target).isDirectory()) {
      clearDirectory(target);
      rmdirSync(target);
    } else {
      unlinkSync(target);
    }
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (!existsSync(root)) continue;
    clearDirectory(root);
    rmdirSync(root);
  }
});

class FileBackedWebStorage implements WebKeyValueStorage {
  constructor(private readonly root: string) {}

  private filePath(key: string): string {
    return path.join(this.root, encodeURIComponent(key));
  }

  getItem(key: string): string | null {
    const target = this.filePath(key);
    return existsSync(target) ? readFileSync(target, 'utf8') : null;
  }

  setItem(key: string, value: string): void {
    writeFileSync(this.filePath(key), value, 'utf8');
  }
}

class BunProfileDocument implements ProfileDocument {
  constructor(private readonly filePath: string) {}

  get exists(): boolean {
    return existsSync(this.filePath);
  }

  text(): Promise<string> {
    return readFile(this.filePath, 'utf8');
  }

  write(content: string): Promise<void> {
    return writeFile(this.filePath, content, 'utf8');
  }
}

function profile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
    languageCodes: ['ja'],
  });
}

async function expectStorageError(
  action: () => Promise<unknown>,
  code: LocalProfileStorageError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('LocalProfileStorageError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalProfileStorageError);
    if (error instanceof LocalProfileStorageError) {
      expect(error.code).toBe(code);
      expect(error.cause).toBeDefined();
    }
  }
}

async function saveAndRestore(storage: LocalProfileStoragePort): Promise<void> {
  expect(await storage.load()).toBeNull();
  await storage.save(profile());
  expect(await storage.load()).toEqual(profile());
}

describe('Local Profile Storage adapter', () => {
  it('file-backed localStorage 相当へ明示保存した Profile だけを復元する', async () => {
    const storage = new WebLocalProfileStorageAdapter(
      new FileBackedWebStorage(temporaryDirectory())
    );

    await saveAndRestore(storage);
  });

  it('実ファイル I/O を使う Native adapter で明示保存した Profile だけを復元する', async () => {
    const document = new BunProfileDocument(
      path.join(temporaryDirectory(), 'local-profile.json')
    );
    const storage = new ExpoFileSystemLocalProfileStorageAdapter(document);

    await saveAndRestore(storage);
  });

  it('Web と Native の不正保存データを INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem('tenkacloud-passport.local-profile', '{');
    const nativePath = path.join(temporaryDirectory(), 'local-profile.json');
    writeFileSync(nativePath, '{', 'utf8');

    await expectStorageError(
      () => new WebLocalProfileStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemLocalProfileStorageAdapter(
          new BunProfileDocument(nativePath)
        ).load(),
      'INVALID_DATA'
    );
  });

  it('Storage 媒体がない場合は UNAVAILABLE を返す', async () => {
    await expectStorageError(
      () => new WebLocalProfileStorageAdapter(null).load(),
      'UNAVAILABLE'
    );
    await expectStorageError(
      () => new ExpoFileSystemLocalProfileStorageAdapter(null).save(profile()),
      'UNAVAILABLE'
    );
    const unavailable = new UnavailableLocalProfileStorageAdapter(
      new Error('OS の保存領域を開けません。')
    );
    await expectStorageError(() => unavailable.load(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.save(profile()), 'UNAVAILABLE');
  });

  it('実ファイルの読込失敗と書込失敗を区別して返す', async () => {
    const webRoot = temporaryDirectory();
    mkdirSync(
      path.join(
        webRoot,
        encodeURIComponent('tenkacloud-passport.local-profile')
      )
    );
    const missingParent = path.join(
      temporaryDirectory(),
      'missing',
      'local-profile.json'
    );

    await expectStorageError(
      () =>
        new WebLocalProfileStorageAdapter(
          new FileBackedWebStorage(webRoot)
        ).load(),
      'READ_FAILED'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemLocalProfileStorageAdapter(
          new BunProfileDocument(missingParent)
        ).save(profile()),
      'WRITE_FAILED'
    );
  });
});
