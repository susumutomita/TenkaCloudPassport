import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import type { WebKeyValueStorage } from './web-local-profile-storage';

const DELETION_MARKER = 'pending-v1';
export const LOCAL_DELETION_JOURNAL_KEY =
  'tenkacloud-passport.delete-all-pending';

export interface LocalDeletionJournalPort {
  isPending(): Promise<boolean>;
  markPending(): Promise<void>;
  clear(): Promise<void>;
}

export type LocalDeletionJournalErrorCode =
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'DELETE_FAILED';

export class LocalDeletionJournalError extends Error {
  readonly code: LocalDeletionJournalErrorCode;

  constructor(code: LocalDeletionJournalErrorCode, cause: unknown) {
    super('端末内 Data の削除状態を更新できませんでした。', { cause });
    this.name = 'LocalDeletionJournalError';
    this.code = code;
  }
}

export class WebDeletionJournalAdapter implements LocalDeletionJournalPort {
  constructor(private readonly storage: WebKeyValueStorage | null) {}

  async isPending(): Promise<boolean> {
    if (!this.storage) {
      throw new LocalDeletionJournalError(
        'READ_FAILED',
        new Error('unavailable')
      );
    }
    try {
      return this.storage.getItem(LOCAL_DELETION_JOURNAL_KEY) !== null;
    } catch (error: unknown) {
      throw new LocalDeletionJournalError('READ_FAILED', error);
    }
  }

  async markPending(): Promise<void> {
    if (!this.storage) {
      throw new LocalDeletionJournalError(
        'WRITE_FAILED',
        new Error('unavailable')
      );
    }
    try {
      this.storage.setItem(LOCAL_DELETION_JOURNAL_KEY, DELETION_MARKER);
    } catch (error: unknown) {
      throw new LocalDeletionJournalError('WRITE_FAILED', error);
    }
  }

  async clear(): Promise<void> {
    if (!this.storage) {
      throw new LocalDeletionJournalError(
        'DELETE_FAILED',
        new Error('unavailable')
      );
    }
    try {
      this.storage.removeItem(LOCAL_DELETION_JOURNAL_KEY);
    } catch (error: unknown) {
      throw new LocalDeletionJournalError('DELETE_FAILED', error);
    }
  }
}

export class ExpoFileSystemDeletionJournalAdapter
  implements LocalDeletionJournalPort
{
  constructor(private readonly document: ProfileDocument | null) {}

  async isPending(): Promise<boolean> {
    if (!this.document) {
      throw new LocalDeletionJournalError(
        'READ_FAILED',
        new Error('unavailable')
      );
    }
    try {
      return this.document.exists;
    } catch (error: unknown) {
      throw new LocalDeletionJournalError('READ_FAILED', error);
    }
  }

  async markPending(): Promise<void> {
    if (!this.document) {
      throw new LocalDeletionJournalError(
        'WRITE_FAILED',
        new Error('unavailable')
      );
    }
    try {
      await this.document.write(DELETION_MARKER);
    } catch (error: unknown) {
      throw new LocalDeletionJournalError('WRITE_FAILED', error);
    }
  }

  async clear(): Promise<void> {
    if (!this.document) {
      throw new LocalDeletionJournalError(
        'DELETE_FAILED',
        new Error('unavailable')
      );
    }
    try {
      if (this.document.exists) await this.document.delete();
    } catch (error: unknown) {
      throw new LocalDeletionJournalError('DELETE_FAILED', error);
    }
  }
}
