import type { LocalPrivateProfile } from '../domain/passport';
import {
  LocalProfileStorageError,
  type LocalProfileStoragePort,
  parseStoredLocalProfile,
  serializeLocalProfile,
  unavailableStorageError,
} from './local-profile-storage';

export const LOCAL_PROFILE_STORAGE_KEY = 'tenkacloud-passport.local-profile';

export interface WebKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class WebLocalProfileStorageAdapter implements LocalProfileStoragePort {
  constructor(private readonly storage: WebKeyValueStorage | null) {}

  async load(): Promise<LocalPrivateProfile | null> {
    if (!this.storage) throw unavailableStorageError();
    let raw: string | null;
    try {
      raw = this.storage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'READ_FAILED',
        '端末内 Storage から Local Profile を読み込めませんでした。',
        error
      );
    }
    return raw === null ? null : parseStoredLocalProfile(raw);
  }

  async save(profile: LocalPrivateProfile): Promise<void> {
    if (!this.storage) throw unavailableStorageError();
    const serialized = serializeLocalProfile(profile);
    try {
      this.storage.setItem(LOCAL_PROFILE_STORAGE_KEY, serialized);
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'WRITE_FAILED',
        '端末内 Storage へ Local Profile を保存できませんでした。',
        error
      );
    }
  }

  async inspect(): Promise<{ readonly count: 0 | 1; readonly bytes: number }> {
    if (!this.storage) throw unavailableStorageError();
    try {
      const raw = this.storage.getItem(LOCAL_PROFILE_STORAGE_KEY);
      return raw === null
        ? { count: 0, bytes: 0 }
        : { count: 1, bytes: new TextEncoder().encode(raw).byteLength };
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'READ_FAILED',
        '端末内 Storage の使用量を確認できませんでした。',
        error
      );
    }
  }

  async remove(): Promise<void> {
    if (!this.storage) throw unavailableStorageError();
    try {
      this.storage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'DELETE_FAILED',
        '端末内 Storage から Local Profile を削除できませんでした。',
        error
      );
    }
  }
}
