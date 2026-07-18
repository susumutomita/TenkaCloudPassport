import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  BunProfileDocument,
  FileBackedWebStorage,
  temporaryDirectory as newTemporaryDirectory,
  removeTemporaryDirectory,
  VerifyMismatchStorage,
  WriteFailingProfileDocument,
  WriteFailingWebStorage,
} from './storage-test-kit';
import { WebLocalProfileStorageAdapter } from './web-local-profile-storage';

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
  expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
  await storage.save(profile());
  expect(await storage.load()).toEqual(profile());
  const usage = await storage.inspect();
  expect(usage.count).toBe(1);
  expect(usage.bytes).toBeGreaterThan(0);
  await storage.remove();
  await storage.remove();
  expect(await storage.load()).toBeNull();
  expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
}

class SizeUnknownProfileDocument implements ProfileDocument {
  constructor(private readonly delegate: BunProfileDocument) {}

  get exists(): boolean {
    return this.delegate.exists;
  }

  get size(): null {
    return null;
  }

  text(): Promise<string> {
    return this.delegate.text();
  }

  write(content: string): Promise<void> {
    return this.delegate.write(content);
  }

  delete(): Promise<void> {
    return this.delegate.delete();
  }
}

class InspectionFailingProfileDocument implements ProfileDocument {
  get exists(): boolean {
    return true;
  }

  get size(): number {
    throw new Error('size permission denied');
  }

  text(): Promise<string> {
    return Promise.reject(new Error('read permission denied'));
  }

  write(_content: string): Promise<void> {
    return Promise.reject(new Error('write permission denied'));
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('delete permission denied'));
  }
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

  it('Native 使用量は OS が size を返さない場合も実内容の Byte 数を返す', async () => {
    const document = new SizeUnknownProfileDocument(
      new BunProfileDocument(
        path.join(temporaryDirectory(), 'size-unknown-profile.json')
      )
    );
    const storage = new ExpoFileSystemLocalProfileStorageAdapter(document);
    await storage.save(profile());

    const usage = await storage.inspect();

    expect(usage.count).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });

  it('Native の使用量確認失敗と削除失敗を型付き Error にする', async () => {
    const storage = new ExpoFileSystemLocalProfileStorageAdapter(
      new InspectionFailingProfileDocument()
    );

    await expectStorageError(() => storage.inspect(), 'READ_FAILED');
    await expectStorageError(() => storage.remove(), 'DELETE_FAILED');
  });

  it('Storage 媒体がない場合は使用量確認と削除も UNAVAILABLE にする', async () => {
    const native = new ExpoFileSystemLocalProfileStorageAdapter(null);
    const unavailable = new UnavailableLocalProfileStorageAdapter(
      new Error('OS storage unavailable')
    );

    await expectStorageError(() => native.inspect(), 'UNAVAILABLE');
    await expectStorageError(() => native.remove(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.inspect(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.remove(), 'UNAVAILABLE');
  });

  it('既存の Real I/O failure adapter も拡張した使用量確認・削除契約を満たす', async () => {
    const nativePath = path.join(
      temporaryDirectory(),
      'write-failing-profile.json'
    );
    await new BunProfileDocument(nativePath).write(
      JSON.stringify({ persisted: true })
    );
    const native = new ExpoFileSystemLocalProfileStorageAdapter(
      new WriteFailingProfileDocument(nativePath, new Error('write failure'))
    );
    expect((await native.inspect()).count).toBe(1);
    await native.remove();

    const webRoot = temporaryDirectory();
    const webDelegate = new FileBackedWebStorage(webRoot);
    await new WebLocalProfileStorageAdapter(webDelegate).save(profile());
    await new WebLocalProfileStorageAdapter(
      new WriteFailingWebStorage(webRoot, new Error('write failure'))
    ).remove();

    const mismatchDelegate = new WebLocalProfileStorageAdapter(
      new FileBackedWebStorage(temporaryDirectory())
    );
    const mismatch = new VerifyMismatchStorage(mismatchDelegate, profile());
    expect(await mismatch.inspect()).toEqual({ count: 0, bytes: 0 });
    await mismatch.remove();
  });
});
