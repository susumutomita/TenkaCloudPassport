import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import {
  ExpoFileSystemDeletionJournalAdapter,
  LocalDeletionJournalError,
  WebDeletionJournalAdapter,
} from './local-deletion-journal';
import {
  BunProfileDocument,
  DeleteFailingWebStorage,
  FileBackedWebStorage,
  trackTemporaryDirectories,
  WriteFailingProfileDocument,
} from './storage-test-kit';

const temporaryDirectories = trackTemporaryDirectories();

async function expectJournalError(
  action: () => Promise<unknown>,
  code: LocalDeletionJournalError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('LocalDeletionJournalError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalDeletionJournalError);
    if (error instanceof LocalDeletionJournalError) {
      expect(error.code).toBe(code);
      expect(error.cause).toBeDefined();
      expect(error.message).not.toContain('private path');
    }
  }
}

class ReadFailingJournalDocument implements ProfileDocument {
  get exists(): boolean {
    throw new Error('private path read failure');
  }

  get size(): null {
    return null;
  }

  text(): Promise<string> {
    return Promise.reject(new Error('private path read failure'));
  }

  write(_content: string): Promise<void> {
    return Promise.reject(new Error('private path write failure'));
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('private path delete failure'));
  }
}

class DeleteFailingJournalDocument implements ProfileDocument {
  constructor(private readonly delegate: BunProfileDocument) {}

  get exists(): boolean {
    return this.delegate.exists;
  }

  get size(): number | null {
    return this.delegate.size;
  }

  text(): Promise<string> {
    return this.delegate.text();
  }

  write(content: string): Promise<void> {
    return this.delegate.write(content);
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('private path delete failure'));
  }
}

describe('Web deletion journal', () => {
  it('実 Storage の marker を pending → clear へ冪等に遷移させる', async () => {
    const journal = new WebDeletionJournalAdapter(
      new FileBackedWebStorage(temporaryDirectories.create())
    );

    expect(await journal.isPending()).toBeFalse();
    await journal.markPending();
    expect(await journal.isPending()).toBeTrue();
    await journal.clear();
    await journal.clear();
    expect(await journal.isPending()).toBeFalse();
  });

  it('Storage 不在を read / write / delete の型付き Error にする', async () => {
    const journal = new WebDeletionJournalAdapter(null);

    await expectJournalError(() => journal.isPending(), 'READ_FAILED');
    await expectJournalError(() => journal.markPending(), 'WRITE_FAILED');
    await expectJournalError(() => journal.clear(), 'DELETE_FAILED');
  });

  it('実 Storage operation の失敗を read / write / delete ごとに区別する', async () => {
    const root = temporaryDirectories.create();
    const failure = new Error('private path failure');
    const stableJournal = new WebDeletionJournalAdapter(
      new FileBackedWebStorage(root)
    );
    await stableJournal.markPending();

    await expectJournalError(
      () =>
        new WebDeletionJournalAdapter(
          new DeleteFailingWebStorage(root, failure, 'get')
        ).isPending(),
      'READ_FAILED'
    );
    await expectJournalError(
      () =>
        new WebDeletionJournalAdapter(
          new DeleteFailingWebStorage(root, failure, 'set')
        ).markPending(),
      'WRITE_FAILED'
    );
    await expectJournalError(
      () =>
        new WebDeletionJournalAdapter(
          new DeleteFailingWebStorage(root, failure, 'remove')
        ).clear(),
      'DELETE_FAILED'
    );
  });
});

describe('Expo File System deletion journal', () => {
  it('実ファイル marker を pending → clear へ冪等に遷移させる', async () => {
    const journal = new ExpoFileSystemDeletionJournalAdapter(
      new BunProfileDocument(
        path.join(temporaryDirectories.create(), 'delete-all-pending')
      )
    );

    expect(await journal.isPending()).toBeFalse();
    await journal.markPending();
    expect(await journal.isPending()).toBeTrue();
    await journal.clear();
    await journal.clear();
    expect(await journal.isPending()).toBeFalse();
  });

  it('Document 不在を read / write / delete の型付き Error にする', async () => {
    const journal = new ExpoFileSystemDeletionJournalAdapter(null);

    await expectJournalError(() => journal.isPending(), 'READ_FAILED');
    await expectJournalError(() => journal.markPending(), 'WRITE_FAILED');
    await expectJournalError(() => journal.clear(), 'DELETE_FAILED');
  });

  it('実 File operation の失敗を read / write / delete ごとに区別する', async () => {
    const root = temporaryDirectories.create();
    const filePath = path.join(root, 'delete-all-pending');
    const delegate = new BunProfileDocument(filePath);
    await delegate.write('pending-v1');

    await expectJournalError(
      () =>
        new ExpoFileSystemDeletionJournalAdapter(
          new ReadFailingJournalDocument()
        ).isPending(),
      'READ_FAILED'
    );
    await expectJournalError(
      () =>
        new ExpoFileSystemDeletionJournalAdapter(
          new WriteFailingProfileDocument(filePath, new Error('private path'))
        ).markPending(),
      'WRITE_FAILED'
    );
    await expectJournalError(
      () =>
        new ExpoFileSystemDeletionJournalAdapter(
          new DeleteFailingJournalDocument(delegate)
        ).clear(),
      'DELETE_FAILED'
    );
  });
});
