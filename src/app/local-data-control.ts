import type { LocalPrivateProfile } from '../domain/passport';
import type { DiagnosticModelArchitecture } from './diagnostic-report';
import type { LocalDeletionJournalPort } from './local-deletion-journal';
import type {
  LocalProfileStoragePort,
  LocalProfileStorageUsage,
} from './local-profile-storage';

export interface LocalModelInstallation {
  readonly architecture: DiagnosticModelArchitecture;
  readonly sizeBytes: number;
  readonly digest: string;
}

export interface LocalModelStoragePort {
  inspect(): Promise<LocalModelInstallation | null>;
  remove(): Promise<void>;
}

export class NoLocalModelStorageAdapter implements LocalModelStoragePort {
  constructor() {
    Object.freeze(this);
  }

  inspect(): Promise<null> {
    return Promise.resolve(null);
  }

  remove(): Promise<void> {
    return Promise.resolve();
  }
}

export interface LocalModelContextLease {
  release(): void;
}

export class LocalDataAccessBlockedError extends Error {
  constructor() {
    super('端末内 Data の削除 transaction が進行中です。');
    this.name = 'LocalDataAccessBlockedError';
  }
}

type LocalDataUse = 'model-context' | 'profile-write';

interface LocalDataExclusiveLease {
  release(): void;
}

type ExclusiveLeaseAttempt =
  | { readonly kind: 'acquired'; readonly lease: LocalDataExclusiveLease }
  | { readonly kind: 'busy'; readonly activeUse: LocalDataUse | 'exclusive' };

export class LocalModelContextLeaseRegistry {
  #activeModelContextCount: number;
  #activeProfileWriteCount: number;
  #exclusive: boolean;
  #modelAcquisitionBlocked: boolean;

  constructor(blockedUntilRecovery = true) {
    this.#activeModelContextCount = 0;
    this.#activeProfileWriteCount = 0;
    this.#exclusive = false;
    this.#modelAcquisitionBlocked = blockedUntilRecovery;
  }

  acquire(): LocalModelContextLease {
    return this.acquireUse('model-context');
  }

  acquireProfileWrite(): LocalModelContextLease {
    return this.acquireUse('profile-write');
  }

  private acquireUse(use: LocalDataUse): LocalModelContextLease {
    if (
      this.#exclusive ||
      (use === 'model-context' && this.#modelAcquisitionBlocked)
    ) {
      throw new LocalDataAccessBlockedError();
    }
    if (use === 'model-context') this.#activeModelContextCount += 1;
    else this.#activeProfileWriteCount += 1;
    let active = true;
    return {
      release: () => {
        if (!active) return;
        active = false;
        if (use === 'model-context') this.#activeModelContextCount -= 1;
        else this.#activeProfileWriteCount -= 1;
      },
    };
  }

  hasActiveContext(): boolean {
    return this.#activeModelContextCount > 0;
  }

  blockModelContextsUntilRecovery(): void {
    this.#modelAcquisitionBlocked = true;
  }

  allowModelContextsAfterRecovery(): void {
    this.#modelAcquisitionBlocked = false;
  }

  tryAcquireExclusive(): ExclusiveLeaseAttempt {
    if (this.#activeModelContextCount > 0) {
      return { kind: 'busy', activeUse: 'model-context' };
    }
    if (this.#activeProfileWriteCount > 0) {
      return { kind: 'busy', activeUse: 'profile-write' };
    }
    if (this.#exclusive) return { kind: 'busy', activeUse: 'exclusive' };
    this.#exclusive = true;
    let active = true;
    return {
      kind: 'acquired',
      lease: {
        release: () => {
          if (!active) return;
          active = false;
          this.#exclusive = false;
        },
      },
    };
  }
}

export class DeletionCoordinatedLocalProfileStorageAdapter
  implements LocalProfileStoragePort
{
  constructor(
    private readonly delegate: LocalProfileStoragePort,
    private readonly leases: LocalModelContextLeaseRegistry,
    private readonly deletionJournal: LocalDeletionJournalPort
  ) {}

  load(): Promise<LocalPrivateProfile | null> {
    return this.delegate.load();
  }

  async save(profile: LocalPrivateProfile): Promise<void> {
    const lease = this.leases.acquireProfileWrite();
    try {
      let deletionPending: boolean;
      try {
        deletionPending = await this.deletionJournal.isPending();
      } catch {
        throw new LocalDataAccessBlockedError();
      }
      if (deletionPending) throw new LocalDataAccessBlockedError();
      await this.delegate.save(profile);
    } finally {
      lease.release();
    }
  }

  inspect(): Promise<LocalProfileStorageUsage> {
    return this.delegate.inspect();
  }

  remove(): Promise<void> {
    return this.delegate.remove();
  }
}

export interface LocalDataPreview {
  readonly profileCount: number;
  readonly settingsCount: 0;
  readonly backupCacheCount: 0;
  readonly modelCount: number;
  readonly totalBytes: number;
  readonly model: LocalModelInstallation | null;
}

export type LocalDataControlErrorCode =
  | 'MODEL_IN_USE'
  | 'STORAGE_FAILURE'
  | 'DELETE_INTERRUPTED';

export class LocalDataControlError extends Error {
  readonly code: LocalDataControlErrorCode;
  readonly committed: boolean;

  constructor(code: LocalDataControlErrorCode, committed: boolean) {
    super(
      code === 'MODEL_IN_USE'
        ? 'Local Model の利用を終了してから削除してください。'
        : '端末内 Data を削除できませんでした。'
    );
    this.name = 'LocalDataControlError';
    this.code = code;
    this.committed = committed;
  }
}

export interface LocalDataControl {
  preview(): Promise<LocalDataPreview>;
  resetPassport(): Promise<void>;
  removeModel(): Promise<void>;
  deleteAll(): Promise<LocalDataPreview>;
  recoverPendingDeletion(): Promise<'not-pending' | 'recovered'>;
}

interface LocalDataControlDependencies {
  readonly profileStorage: LocalProfileStoragePort;
  readonly modelStorage: LocalModelStoragePort;
  readonly modelContexts: LocalModelContextLeaseRegistry;
  readonly deletionJournal: LocalDeletionJournalPort;
}

function previewFrom(
  profile: LocalProfileStorageUsage,
  model: LocalModelInstallation | null
): LocalDataPreview {
  return {
    profileCount: profile.count,
    settingsCount: 0,
    backupCacheCount: 0,
    modelCount: model ? 1 : 0,
    totalBytes: profile.bytes + (model?.sizeBytes ?? 0),
    model,
  };
}

function storageFailure(): LocalDataControlError {
  return new LocalDataControlError('STORAGE_FAILURE', false);
}

export function createLocalDataControl({
  profileStorage,
  modelStorage,
  modelContexts,
  deletionJournal,
}: LocalDataControlDependencies): LocalDataControl {
  let committedDeletionLease: LocalDataExclusiveLease | null = null;

  async function preview(): Promise<LocalDataPreview> {
    try {
      const profile = await profileStorage.inspect();
      const model = await modelStorage.inspect();
      return previewFrom(profile, model);
    } catch {
      throw storageFailure();
    }
  }

  function acquireExclusive(): LocalDataExclusiveLease {
    const attempt = modelContexts.tryAcquireExclusive();
    if (attempt.kind === 'acquired') return attempt.lease;
    if (attempt.activeUse === 'model-context') {
      throw new LocalDataControlError('MODEL_IN_USE', false);
    }
    throw storageFailure();
  }

  async function commitDeletion(
    lease: LocalDataExclusiveLease
  ): Promise<boolean> {
    try {
      await deletionJournal.markPending();
      committedDeletionLease = lease;
      return true;
    } catch {
      try {
        if (!(await deletionJournal.isPending())) return false;
        committedDeletionLease = lease;
        return true;
      } catch {
        modelContexts.blockModelContextsUntilRecovery();
        return false;
      }
    }
  }

  async function removeCommittedData(): Promise<void> {
    try {
      await profileStorage.remove();
      await modelStorage.remove();
      const remaining = await preview();
      if (remaining.profileCount !== 0 || remaining.modelCount !== 0) {
        throw new Error('remaining local data');
      }
      await deletionJournal.clear();
      modelContexts.allowModelContextsAfterRecovery();
      committedDeletionLease?.release();
      committedDeletionLease = null;
    } catch {
      throw new LocalDataControlError('DELETE_INTERRUPTED', true);
    }
  }

  return {
    preview,
    async resetPassport(): Promise<void> {
      const lease = acquireExclusive();
      try {
        await profileStorage.remove();
      } catch {
        throw storageFailure();
      } finally {
        lease.release();
      }
    },
    async removeModel(): Promise<void> {
      const lease = acquireExclusive();
      try {
        await modelStorage.remove();
      } catch {
        throw storageFailure();
      } finally {
        lease.release();
      }
    },
    async deleteAll(): Promise<LocalDataPreview> {
      const lease = acquireExclusive();
      let before: LocalDataPreview;
      try {
        before = await preview();
      } catch {
        lease.release();
        throw storageFailure();
      }
      if (!(await commitDeletion(lease))) {
        lease.release();
        throw storageFailure();
      }
      await removeCommittedData();
      return before;
    },
    async recoverPendingDeletion(): Promise<'not-pending' | 'recovered'> {
      const lease = committedDeletionLease ?? acquireExclusive();
      let pending: boolean;
      try {
        pending = await deletionJournal.isPending();
      } catch {
        if (committedDeletionLease) {
          throw new LocalDataControlError('DELETE_INTERRUPTED', true);
        }
        lease.release();
        throw storageFailure();
      }
      if (!pending) {
        modelContexts.allowModelContextsAfterRecovery();
        lease.release();
        committedDeletionLease = null;
        return 'not-pending';
      }
      committedDeletionLease = lease;
      await removeCommittedData();
      return 'recovered';
    },
  };
}
