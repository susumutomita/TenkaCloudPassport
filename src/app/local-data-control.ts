import type { LocalPrivateProfile } from '../domain/passport';
import type { DiagnosticModelArchitecture } from './diagnostic-report';
import type { LocalDeletionJournalPort } from './local-deletion-journal';
import type { LocalModelMutationLease } from './local-model-mutation-lease';
import type {
  LocalProfileStoragePort,
  LocalProfileStorageUsage,
} from './local-profile-storage';

export interface LocalModelInstallation {
  readonly architecture: DiagnosticModelArchitecture;
  readonly sizeBytes: number;
  readonly digest: string;
  readonly count: number;
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

/**
 * 実機 blocker（owner フィードバック）: 以前は理由を持たない単一 Error だったため、
 * `default-local-model-management.native.ts` 側で「起動確認待ち」「他操作と衝突中」
 * どちらも一律 `NATIVE_CONTEXT_UNAVAILABLE`（「App を完全に終了して再起動してください」）
 * へ丸めてしまい、ありふれた一時的な衝突までユーザーに致命的な文言を見せていた。
 * 呼び出し元が「待てば解消する一時的な busy」か「Native Context 自体が壊れた」かを
 * 区別できるよう、Block の理由を型で保持する。
 */
export type LocalDataAccessBlockedReason =
  | 'recovery'
  | 'model-context'
  | 'profile-write'
  | 'exclusive'
  | 'pending-deletion';

/**
 * code-reviewer 指摘（medium）: `reason` を持つようになった後も `.message` が
 * 全 `reason` で固定文言のままだと、Log・診断出力を読む側にとって
 * 「実際には削除 transaction が進行中ではない」場合（起動確認待ち・他操作との
 * 衝突・排他ロック中）まで削除中と誤認させる。この PR の主題（実態より深刻・
 * 的外れな理由を騙らない）を Error の `.message` 自身でも守る。
 */
/**
 * /simplify 指摘（simplification）: switch + `default` の exhaustiveness 分岐は
 * 単純な reason → 文言の対応表に対しては冗長。Record リテラルなら、
 * `LocalDataAccessBlockedReason` にキーを追加・削除したとき TypeScript が
 * この対応表自体の過不足を直接検出するため、同じ網羅性を短く保証できる。
 */
const BLOCKED_REASON_MESSAGES: Record<LocalDataAccessBlockedReason, string> = {
  'pending-deletion': '端末内 Data の削除 transaction が進行中です。',
  'model-context': 'Local Model が他の処理で使用中です。',
  'profile-write': 'Profile の書込みが他の処理で進行中です。',
  exclusive: '端末内 Data の排他操作が他の処理で進行中です。',
  recovery: '起動時の復旧確認が完了していません。',
};

function messageForBlockedReason(reason: LocalDataAccessBlockedReason): string {
  return BLOCKED_REASON_MESSAGES[reason];
}

export class LocalDataAccessBlockedError extends Error {
  readonly reason: LocalDataAccessBlockedReason;

  constructor(reason: LocalDataAccessBlockedReason) {
    super(messageForBlockedReason(reason));
    this.name = 'LocalDataAccessBlockedError';
    this.reason = reason;
  }
}

type LocalDataUse = 'model-context' | 'profile-write';

interface LocalDataExclusiveLease {
  release(): void;
}

type ExclusiveLeaseAttempt =
  | { readonly kind: 'acquired'; readonly lease: LocalDataExclusiveLease }
  | {
      readonly kind: 'busy';
      readonly activeUse: LocalDataUse | 'exclusive' | 'recovery';
    };

export class LocalModelContextLeaseRegistry {
  #activeModelContextCount: number;
  #activeProfileWriteCount: number;
  #exclusive: boolean;
  #useAcquisitionBlocked: boolean;

  constructor(blockedUntilRecovery = true) {
    this.#activeModelContextCount = 0;
    this.#activeProfileWriteCount = 0;
    this.#exclusive = false;
    this.#useAcquisitionBlocked = blockedUntilRecovery;
  }

  acquire(): LocalModelContextLease {
    return this.acquireUse('model-context');
  }

  acquireProfileWrite(): LocalModelContextLease {
    return this.acquireUse('profile-write');
  }

  acquireMutation(): LocalModelMutationLease {
    const attempt = this.tryAcquireExclusive();
    if (attempt.kind === 'busy') {
      throw new LocalDataAccessBlockedError(attempt.activeUse);
    }
    return attempt.lease;
  }

  private acquireUse(use: LocalDataUse): LocalModelContextLease {
    if (this.#exclusive) throw new LocalDataAccessBlockedError('exclusive');
    if (this.#useAcquisitionBlocked) {
      throw new LocalDataAccessBlockedError('recovery');
    }
    if (use === 'model-context' && this.#activeModelContextCount > 0) {
      throw new LocalDataAccessBlockedError('model-context');
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

  blockUsesUntilRecovery(): void {
    this.#useAcquisitionBlocked = true;
  }

  allowUsesAfterRecovery(): void {
    this.#useAcquisitionBlocked = false;
  }

  tryAcquireExclusive(): ExclusiveLeaseAttempt {
    if (this.#useAcquisitionBlocked) {
      return { kind: 'busy', activeUse: 'recovery' };
    }
    return this.tryAcquireExclusiveForRecovery();
  }

  /** LocalDataControl の起動回復だけが recovery lock 内で排他 lease を取得する。 */
  tryAcquireExclusiveForRecovery(): ExclusiveLeaseAttempt {
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
        throw new LocalDataAccessBlockedError('pending-deletion');
      }
      if (deletionPending) {
        throw new LocalDataAccessBlockedError('pending-deletion');
      }
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
    modelCount: model?.count ?? 0,
    totalBytes: profile.bytes + (model?.sizeBytes ?? 0),
    model,
  };
}

function storageFailure(): LocalDataControlError {
  return new LocalDataControlError('STORAGE_FAILURE', false);
}

/**
 * code-reviewer 指摘（blocker）: 起動確認は毎回 fresh process の 1 回きりで、
 * その回の `deletionJournal.isPending()` が読み取れるかどうかは前回 process の
 * 確定 pending 有無と無関係（`committedDeletionLease` は process local で
 * 再起動を跨がない）。1 回の一時的な読み取り失敗だけで「判定不能」と結論し
 * Block を解放すると、直前の process が本当に確定 pending（`markPending()`
 * 成功済み）を残したまま落ちていた場合に、それを見逃して解放してしまう
 * リスクがある。即時（timer 無し）で複数回読み直し、真に一時的な glitch は
 * ここで吸収したうえで、全試行が失敗したときだけ「判定不能」の扱いに落ちる
 * ようにして、そのリスクを下げる。
 */
const PENDING_CHECK_ATTEMPTS = 3;

async function readPendingWithRetry(
  deletionJournal: LocalDeletionJournalPort
): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PENDING_CHECK_ATTEMPTS; attempt += 1) {
    try {
      return await deletionJournal.isPending();
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError;
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

  function acquireRecoveryExclusive(): LocalDataExclusiveLease {
    const attempt = modelContexts.tryAcquireExclusiveForRecovery();
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
        modelContexts.blockUsesUntilRecovery();
        return false;
      }
    }
  }

  async function removeCommittedData(): Promise<void> {
    try {
      await profileStorage.remove();
      await modelStorage.remove();
      const remaining = await preview();
      if (remaining.profileCount !== 0 || remaining.model !== null) {
        throw new Error('remaining local data');
      }
      await deletionJournal.clear();
      modelContexts.allowUsesAfterRecovery();
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
      const lease = committedDeletionLease ?? acquireRecoveryExclusive();
      let pending: boolean;
      try {
        pending = await readPendingWithRetry(deletionJournal);
      } catch {
        if (committedDeletionLease) {
          // 既に markPending 済み（確定 pending）で読み直しにも失敗した場合だけ、
          // Model File が中途半端な状態のままかもしれないため Block を維持する。
          throw new LocalDataControlError('DELETE_INTERRUPTED', true);
        }
        // 実機 blocker（owner フィードバック）: pending かどうかを確定できなかった
        // だけで、削除が実際に進行中だと確認したわけではない。判定不能（かつ
        // 確定 pending 未検出）は fail-open で Block を解放する。設計判断・
        // 選択肢・受け入れる risk の詳細は
        // `docs/adr/0056-recovery-gate-fail-open-on-indeterminate-read.md` を参照。
        modelContexts.allowUsesAfterRecovery();
        lease.release();
        throw storageFailure();
      }
      if (!pending) {
        modelContexts.allowUsesAfterRecovery();
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
