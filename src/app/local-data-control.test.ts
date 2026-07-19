import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createLocalPrivateProfile } from '../domain/passport';
import {
  createLocalDataControl,
  DeletionCoordinatedLocalProfileStorageAdapter,
  LocalDataAccessBlockedError,
  LocalDataControlError,
  LocalModelContextLeaseRegistry,
  type LocalModelInstallation,
  type LocalModelStoragePort,
  NoLocalModelStorageAdapter,
} from './local-data-control';
import {
  type LocalDeletionJournalPort,
  WebDeletionJournalAdapter,
} from './local-deletion-journal';
import type { LocalProfileStoragePort } from './local-profile-storage';
import {
  DeleteFailingWebStorage,
  FileBackedWebStorage,
  trackTemporaryDirectories,
} from './storage-test-kit';
import { WebLocalProfileStorageAdapter } from './web-local-profile-storage';

const temporaryDirectories = trackTemporaryDirectories();

class FileBackedLocalModelStorage implements LocalModelStoragePort {
  constructor(private readonly filePath: string) {}

  inspect(): Promise<LocalModelInstallation | null> {
    if (!existsSync(this.filePath)) return Promise.resolve(null);
    const bytes = readFileSync(this.filePath);
    return Promise.resolve({
      architecture: 'llama',
      sizeBytes: statSync(this.filePath).size,
      digest: createHash('sha256').update(bytes).digest('hex'),
    });
  }

  remove(): Promise<void> {
    if (existsSync(this.filePath)) unlinkSync(this.filePath);
    return Promise.resolve();
  }
}

class UnavailableLocalModelStorage implements LocalModelStoragePort {
  inspect(): Promise<null> {
    return Promise.reject(new Error('model storage unavailable'));
  }

  remove(): Promise<void> {
    return Promise.reject(new Error('model storage unavailable'));
  }
}

class MarkerWrittenThenThrowingJournal implements LocalDeletionJournalPort {
  constructor(private readonly delegate: LocalDeletionJournalPort) {}

  isPending(): Promise<boolean> {
    return this.delegate.isPending();
  }

  async markPending(): Promise<void> {
    await this.delegate.markPending();
    throw new Error('marker write completion unavailable');
  }

  clear(): Promise<void> {
    return this.delegate.clear();
  }
}

class UnconfirmedMarkerJournal implements LocalDeletionJournalPort {
  private failedRead = false;

  constructor(
    private readonly delegate: LocalDeletionJournalPort,
    private readonly writeBeforeFailure: boolean
  ) {}

  isPending(): Promise<boolean> {
    if (!this.failedRead) {
      this.failedRead = true;
      return Promise.reject(new Error('marker read unavailable'));
    }
    return this.delegate.isPending();
  }

  async markPending(): Promise<void> {
    if (this.writeBeforeFailure) await this.delegate.markPending();
    throw new Error('marker write unavailable');
  }

  clear(): Promise<void> {
    return this.delegate.clear();
  }
}

class LateProfileWriteJournal implements LocalDeletionJournalPort {
  blockedError: unknown = null;

  constructor(
    private readonly delegate: LocalDeletionJournalPort,
    private readonly profileStorage: LocalProfileStoragePort
  ) {}

  isPending(): Promise<boolean> {
    return this.delegate.isPending();
  }

  markPending(): Promise<void> {
    return this.delegate.markPending();
  }

  async clear(): Promise<void> {
    try {
      await this.profileStorage.save(profile());
    } catch (error: unknown) {
      this.blockedError = error;
    }
    await this.delegate.clear();
  }
}

class FailOnceClearJournal implements LocalDeletionJournalPort {
  private failed = false;

  constructor(private readonly delegate: LocalDeletionJournalPort) {}

  isPending(): Promise<boolean> {
    return this.delegate.isPending();
  }

  markPending(): Promise<void> {
    return this.delegate.markPending();
  }

  clear(): Promise<void> {
    if (!this.failed) {
      this.failed = true;
      return Promise.reject(new Error('first clear interrupted'));
    }
    return this.delegate.clear();
  }
}

class LateLeaseLocalModelStorage implements LocalModelStoragePort {
  blockedError: unknown = null;

  constructor(
    private readonly delegate: LocalModelStoragePort,
    private readonly contexts: LocalModelContextLeaseRegistry
  ) {}

  inspect(): Promise<LocalModelInstallation | null> {
    return this.delegate.inspect();
  }

  async remove(): Promise<void> {
    try {
      this.contexts.acquire();
    } catch (error: unknown) {
      this.blockedError = error;
    }
    await this.delegate.remove();
  }
}

class DeleteRetainingProfileStorage implements LocalProfileStoragePort {
  constructor(private readonly delegate: LocalProfileStoragePort) {}

  load() {
    return this.delegate.load();
  }

  save(value: Parameters<LocalProfileStoragePort['save']>[0]) {
    return this.delegate.save(value);
  }

  inspect() {
    return this.delegate.inspect();
  }

  remove(): Promise<void> {
    return Promise.resolve();
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

function control(storage: FileBackedWebStorage) {
  return createLocalDataControl({
    profileStorage: new WebLocalProfileStorageAdapter(storage),
    modelStorage: new NoLocalModelStorageAdapter(),
    modelContexts: new LocalModelContextLeaseRegistry(),
    deletionJournal: new WebDeletionJournalAdapter(storage),
  });
}

async function expectControlError(
  action: () => Promise<unknown>,
  code: LocalDataControlError['code'],
  committed: boolean
): Promise<void> {
  try {
    await action();
    throw new Error('LocalDataControlError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalDataControlError);
    if (error instanceof LocalDataControlError) {
      expect(error.code).toBe(code);
      expect(error.committed).toBe(committed);
      expect(error.message).not.toContain('こむぎ');
    }
  }
}

describe('Local Data の Preview と個別削除', () => {
  it('実 Storage の Profile 件数 / Byte 数と、未導入 Resource の 0 件を返す', async () => {
    const storage = new FileBackedWebStorage(temporaryDirectories.create());
    const localData = control(storage);

    expect(await localData.preview()).toEqual({
      profileCount: 0,
      settingsCount: 0,
      backupCacheCount: 0,
      modelCount: 0,
      totalBytes: 0,
      model: null,
    });

    await new WebLocalProfileStorageAdapter(storage).save(profile());
    const preview = await localData.preview();
    expect(preview.profileCount).toBe(1);
    expect(preview.totalBytes).toBeGreaterThan(0);
  });

  it('Reset Passport は Profile だけを削除し、繰り返しても同じ空状態になる', async () => {
    const storage = new FileBackedWebStorage(temporaryDirectories.create());
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    const localData = control(storage);
    await profileStorage.save(profile());

    await localData.resetPassport();
    await localData.resetPassport();

    expect(await profileStorage.load()).toBeNull();
    expect(await localData.preview()).toMatchObject({ profileCount: 0 });
  });

  it('Model Context 使用中は tombstone 前に Model Remove と全削除を拒否する', async () => {
    const storage = new FileBackedWebStorage(temporaryDirectories.create());
    const contexts = new LocalModelContextLeaseRegistry(false);
    expect(contexts.hasActiveContext()).toBeFalse();
    const lease = contexts.acquire();
    expect(contexts.hasActiveContext()).toBeTrue();
    const localData = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(storage),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: contexts,
      deletionJournal: new WebDeletionJournalAdapter(storage),
    });

    await expectControlError(
      () => localData.removeModel(),
      'MODEL_IN_USE',
      false
    );
    await expectControlError(
      () => localData.deleteAll(),
      'MODEL_IN_USE',
      false
    );
    expect(
      await new WebDeletionJournalAdapter(storage).isPending()
    ).toBeFalse();

    lease.release();
    lease.release();
    expect(contexts.hasActiveContext()).toBeFalse();
    await localData.removeModel();
  });

  it('Model Context Lease は Registry 全体で 1 本に限定し、別 Runner 相当の再取得を拒否する', () => {
    const contexts = new LocalModelContextLeaseRegistry(false);
    const lease = contexts.acquire();

    expect(() => contexts.acquire()).toThrow(LocalDataAccessBlockedError);

    lease.release();
    const nextLease = contexts.acquire();
    expect(contexts.hasActiveContext()).toBeTrue();
    nextLease.release();
  });

  it('実ファイル Local Model の metadata を Preview し、Model だけを冪等削除する', async () => {
    const root = temporaryDirectories.create();
    const modelPath = path.join(root, 'local-model.gguf');
    writeFileSync(modelPath, 'GGUF local model bytes', 'utf8');
    const modelStorage = new FileBackedLocalModelStorage(modelPath);
    const localData = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(
        new FileBackedWebStorage(root)
      ),
      modelStorage,
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new WebDeletionJournalAdapter(
        new FileBackedWebStorage(root)
      ),
    });

    const before = await localData.preview();
    expect(before.modelCount).toBe(1);
    expect(before.model?.architecture).toBe('llama');
    expect(before.model?.digest).toHaveLength(64);
    expect(before.totalBytes).toBeGreaterThan(0);

    await localData.removeModel();
    await localData.removeModel();
    expect(await localData.preview()).toMatchObject({
      modelCount: 0,
      model: null,
    });
  });

  it('Profile / Model / Journal の失敗を本文を反射しない STORAGE_FAILURE にする', async () => {
    const root = temporaryDirectories.create();
    const stable = new FileBackedWebStorage(root);
    const failingProfile = new WebLocalProfileStorageAdapter(
      new DeleteFailingWebStorage(
        root,
        new Error('private profile path'),
        'remove'
      )
    );
    const profileFailure = createLocalDataControl({
      profileStorage: failingProfile,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new WebDeletionJournalAdapter(stable),
    });
    await expectControlError(
      () => profileFailure.resetPassport(),
      'STORAGE_FAILURE',
      false
    );

    const modelFailure = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(stable),
      modelStorage: new UnavailableLocalModelStorage(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new WebDeletionJournalAdapter(stable),
    });
    await expectControlError(
      () => modelFailure.preview(),
      'STORAGE_FAILURE',
      false
    );
    await expectControlError(
      () => modelFailure.deleteAll(),
      'STORAGE_FAILURE',
      false
    );
    await expectControlError(
      () => modelFailure.removeModel(),
      'STORAGE_FAILURE',
      false
    );

    const journalFailure = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(stable),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new WebDeletionJournalAdapter(null),
    });
    await expectControlError(
      () => journalFailure.recoverPendingDeletion(),
      'STORAGE_FAILURE',
      false
    );
  });
});

describe('write-ahead tombstone による全削除', () => {
  it('Preview 後の全削除は tombstone を経由し、Profile と marker を残さない', async () => {
    const storage = new FileBackedWebStorage(temporaryDirectories.create());
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    const journal = new WebDeletionJournalAdapter(storage);
    await profileStorage.save(profile());

    const deleted = await control(storage).deleteAll();

    expect(deleted.profileCount).toBe(1);
    expect(await profileStorage.load()).toBeNull();
    expect(await journal.isPending()).toBeFalse();
  });

  it('tombstone 後の削除失敗は committed Error と marker を残し、再起動相当の新しい Control が完了する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    await new WebLocalProfileStorageAdapter(storage).save(profile());
    const failingProfileStorage = new WebLocalProfileStorageAdapter(
      new DeleteFailingWebStorage(root, new Error('private path failure'))
    );
    const journal = new WebDeletionJournalAdapter(storage);
    const interrupted = createLocalDataControl({
      profileStorage: failingProfileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: journal,
    });

    await expectControlError(
      () => interrupted.deleteAll(),
      'DELETE_INTERRUPTED',
      true
    );
    expect(await journal.isPending()).toBeTrue();
    await expectControlError(
      () => interrupted.recoverPendingDeletion(),
      'DELETE_INTERRUPTED',
      true
    );

    const restarted = control(new FileBackedWebStorage(root));
    expect(await restarted.recoverPendingDeletion()).toBe('recovered');
    expect(await restarted.recoverPendingDeletion()).toBe('not-pending');
    expect(await restarted.preview()).toMatchObject({
      profileCount: 0,
      modelCount: 0,
      totalBytes: 0,
    });
    expect(await journal.isPending()).toBeFalse();
  });

  it('tombstone の書込失敗は committed 前として既存 Profile を保持する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    await profileStorage.save(profile());
    const failingJournal = new WebDeletionJournalAdapter(
      new DeleteFailingWebStorage(root, new Error('journal failure'), 'set')
    );
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: failingJournal,
    });

    await expectControlError(
      () => localData.deleteAll(),
      'STORAGE_FAILURE',
      false
    );
    expect(await profileStorage.load()).toEqual(profile());
  });

  it('marker 作成後に markPending が失敗しても未 commit と誤判定せず削除を完了する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    const journal = new WebDeletionJournalAdapter(storage);
    await profileStorage.save(profile());
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new MarkerWrittenThenThrowingJournal(journal),
    });

    expect((await localData.deleteAll()).profileCount).toBe(1);
    expect(await profileStorage.load()).toBeNull();
    expect(await journal.isPending()).toBeFalse();
  });

  it('marker の write と確認が両方失敗した場合は commit 済みと断定せず Profile を保持する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    const journal = new WebDeletionJournalAdapter(storage);
    await profileStorage.save(profile());
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new UnconfirmedMarkerJournal(journal, false),
    });

    await expectControlError(
      () => localData.deleteAll(),
      'STORAGE_FAILURE',
      false
    );
    expect(await profileStorage.load()).toEqual(profile());
    const restarted = control(new FileBackedWebStorage(root));
    expect(await restarted.recoverPendingDeletion()).toBe('not-pending');
    expect(await profileStorage.load()).toEqual(profile());
  });

  it('確認不能でも実在した marker は fresh process の write を閉じ、起動回復で削除する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    const journal = new WebDeletionJournalAdapter(storage);
    await profileStorage.save(profile());
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new UnconfirmedMarkerJournal(journal, true),
    });

    await expectControlError(
      () => localData.deleteAll(),
      'STORAGE_FAILURE',
      false
    );
    const restartedContexts = new LocalModelContextLeaseRegistry();
    expect(() => restartedContexts.acquire()).toThrow(
      LocalDataAccessBlockedError
    );
    const restartedProfileStorage =
      new DeletionCoordinatedLocalProfileStorageAdapter(
        profileStorage,
        restartedContexts,
        journal
      );
    await expect(
      restartedProfileStorage.save(profile())
    ).rejects.toBeInstanceOf(LocalDataAccessBlockedError);
    const restarted = createLocalDataControl({
      profileStorage: restartedProfileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: restartedContexts,
      deletionJournal: journal,
    });
    expect(await restarted.recoverPendingDeletion()).toBe('recovered');
    const modelLease = restartedContexts.acquire();
    modelLease.release();
    expect(await restartedProfileStorage.load()).toBeNull();
  });

  it('検証後の Profile 再保存と Model Context 取得を同じ排他 lease で拒否する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const contexts = new LocalModelContextLeaseRegistry(false);
    const profileStorage = new DeletionCoordinatedLocalProfileStorageAdapter(
      new WebLocalProfileStorageAdapter(storage),
      contexts,
      new WebDeletionJournalAdapter(storage)
    );
    await profileStorage.save(profile());
    const journal = new LateProfileWriteJournal(
      new WebDeletionJournalAdapter(storage),
      profileStorage
    );
    const modelPath = path.join(root, 'local-model.gguf');
    writeFileSync(modelPath, 'GGUF local model bytes', 'utf8');
    const modelStorage = new LateLeaseLocalModelStorage(
      new FileBackedLocalModelStorage(modelPath),
      contexts
    );
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage,
      modelContexts: contexts,
      deletionJournal: journal,
    });

    await localData.deleteAll();

    expect(journal.blockedError).toBeInstanceOf(LocalDataAccessBlockedError);
    expect(modelStorage.blockedError).toBeInstanceOf(
      LocalDataAccessBlockedError
    );
    expect(await profileStorage.load()).toBeNull();
    expect(await localData.preview()).toMatchObject({
      profileCount: 0,
      modelCount: 0,
    });
  });

  it('commit 後の中断中は Profile write を閉じ、同じ Control の回復完了後だけ再開する', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const contexts = new LocalModelContextLeaseRegistry();
    const journal = new WebDeletionJournalAdapter(storage);
    const profileStorage = new DeletionCoordinatedLocalProfileStorageAdapter(
      new WebLocalProfileStorageAdapter(storage),
      contexts,
      journal
    );
    await profileStorage.save(profile());
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: contexts,
      deletionJournal: new FailOnceClearJournal(journal),
    });

    await expectControlError(
      () => localData.deleteAll(),
      'DELETE_INTERRUPTED',
      true
    );
    await expect(profileStorage.save(profile())).rejects.toBeInstanceOf(
      LocalDataAccessBlockedError
    );
    expect(await journal.isPending()).toBeTrue();

    const restartedContexts = new LocalModelContextLeaseRegistry();
    const restartedProfileStorage =
      new DeletionCoordinatedLocalProfileStorageAdapter(
        new WebLocalProfileStorageAdapter(storage),
        restartedContexts,
        journal
      );
    await expect(
      restartedProfileStorage.save(profile())
    ).rejects.toBeInstanceOf(LocalDataAccessBlockedError);
    const restarted = createLocalDataControl({
      profileStorage: restartedProfileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: restartedContexts,
      deletionJournal: journal,
    });
    expect(await restarted.recoverPendingDeletion()).toBe('recovered');
    await restartedProfileStorage.save(profile());
    expect(await restartedProfileStorage.load()).toEqual(profile());
  });

  it('Data 削除後の tombstone clear 失敗は committed Error と marker を残す', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    await profileStorage.save(profile());
    const localData = createLocalDataControl({
      profileStorage,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new WebDeletionJournalAdapter(
        new DeleteFailingWebStorage(
          root,
          new Error('private journal path'),
          'remove'
        )
      ),
    });

    await expectControlError(
      () => localData.deleteAll(),
      'DELETE_INTERRUPTED',
      true
    );
    expect(await profileStorage.load()).toBeNull();
    expect(await new WebDeletionJournalAdapter(storage).isPending()).toBeTrue();
  });

  it('Storage が成功を返して Data を残した場合も false-pass せず committed Error にする', async () => {
    const root = temporaryDirectories.create();
    const storage = new FileBackedWebStorage(root);
    const profileStorage = new WebLocalProfileStorageAdapter(storage);
    await profileStorage.save(profile());
    const localData = createLocalDataControl({
      profileStorage: new DeleteRetainingProfileStorage(profileStorage),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(),
      deletionJournal: new WebDeletionJournalAdapter(storage),
    });

    await expectControlError(
      () => localData.deleteAll(),
      'DELETE_INTERRUPTED',
      true
    );
    expect(await profileStorage.load()).toEqual(profile());
    expect(await new WebDeletionJournalAdapter(storage).isPending()).toBeTrue();
  });
});
