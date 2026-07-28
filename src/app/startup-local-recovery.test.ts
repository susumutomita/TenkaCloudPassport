import { describe, expect, it } from 'bun:test';
import { createLocalPrivateProfile } from '../domain/passport';
import {
  createLocalDataControl,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
} from './local-data-control';
import { WebDeletionJournalAdapter } from './local-deletion-journal';
import { recoverLocalStateAtStartup } from './startup-local-recovery';
import {
  FileBackedWebStorage,
  trackTemporaryDirectories,
} from './storage-test-kit';
import {
  type WebKeyValueStorage,
  WebLocalProfileStorageAdapter,
} from './web-local-profile-storage';

const temporaryDirectories = trackTemporaryDirectories();

class OneReadFailureWebStorage implements WebKeyValueStorage {
  private failNextRead = true;

  constructor(private readonly delegate: FileBackedWebStorage) {}

  getItem(key: string): string | null {
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('transient journal read failure');
    }
    return this.delegate.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.delegate.setItem(key, value);
  }

  removeItem(key: string): void {
    this.delegate.removeItem(key);
  }
}

describe('起動時 Local Data Recovery Gate', () => {
  it('tombstone の確認・回復後だけ Profile を読む', async () => {
    const events: string[] = [];
    const result = await recoverLocalStateAtStartup(
      {
        async recoverPendingDeletion() {
          events.push('recover');
          return 'not-pending';
        },
      },
      {
        async load() {
          events.push('load');
          return null;
        },
      }
    );

    expect(events).toEqual(['recover', 'load']);
    expect(result).toEqual({
      kind: 'loaded',
      profile: null,
      recovery: 'not-pending',
    });
  });

  it('回復失敗時は Profile を一度も読まず Recovery 専用結果に閉じる', async () => {
    const recoveryFailure = new Error('journal unavailable');
    let loadCalls = 0;
    const result = await recoverLocalStateAtStartup(
      {
        async recoverPendingDeletion() {
          throw recoveryFailure;
        },
      },
      {
        async load() {
          loadCalls += 1;
          return null;
        },
      }
    );

    expect(loadCalls).toBe(0);
    expect(result).toEqual({
      kind: 'recovery-failed',
      error: recoveryFailure,
    });
  });

  it('tombstone 回復済みなら Profile を再読込せず空の復元結果へ閉じる', async () => {
    let loadCalls = 0;
    const result = await recoverLocalStateAtStartup(
      {
        async recoverPendingDeletion() {
          return 'recovered';
        },
      },
      {
        async load() {
          loadCalls += 1;
          throw new Error('deleted Profile must not be loaded');
        },
      }
    );

    expect(loadCalls).toBe(0);
    expect(result).toEqual({
      kind: 'loaded',
      profile: null,
      recovery: 'recovered',
    });
  });

  it('tombstone 不在確認後の Profile 読取失敗を通常の load failure と区別する', async () => {
    const profileFailure = new Error('profile unavailable');
    const result = await recoverLocalStateAtStartup(
      {
        async recoverPendingDeletion() {
          return 'not-pending';
        },
      },
      {
        async load() {
          throw profileFailure;
        },
      }
    );

    expect(result).toEqual({
      kind: 'profile-load-failed',
      error: profileFailure,
    });
  });

  it('code-reviewer 指摘（blocker）由来の修正: journal の 1 回だけの一時読取失敗は内部 retry で吸収し、1 回目の呼び出しだけで実 File の既存 Profile を復元する', async () => {
    const root = temporaryDirectories.create();
    const files = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(files);
    const existing = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: ['open-source'],
      selectedForPassportClueIds: ['open-source'],
      languageCodes: ['ja'],
    });
    await profileStorage.save(existing);
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      // `OneReadFailureWebStorage` は最初の 1 回だけ読み取りに失敗する。
      // `recoverPendingDeletion()` 内の即時 retry（`readPendingWithRetry`）が
      // これを吸収するため、`recoverLocalStateAtStartup` を 1 回呼ぶだけで
      // Recovery が完了し Profile を復元できる（以前は 1 回目が
      // `recovery-failed` になり、呼び出し側の再試行が必須だった）。
      deletionJournal: new WebDeletionJournalAdapter(
        new OneReadFailureWebStorage(files)
      ),
    });

    const result = await recoverLocalStateAtStartup(localData, profileStorage);

    expect(result).toEqual({
      kind: 'loaded',
      profile: existing,
      recovery: 'not-pending',
    });
    expect(await profileStorage.load()).toEqual(existing);
  });
});
