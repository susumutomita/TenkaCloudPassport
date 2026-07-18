import type { LocalPrivateProfile } from '../domain/passport';
import {
  LocalProfileStorageError,
  type LocalProfileStoragePort,
  parseStoredLocalProfile,
  serializeLocalProfile,
  unavailableStorageError,
} from './local-profile-storage';

export interface ProfileDocument {
  readonly exists: boolean;
  readonly size: number | null;
  text(): Promise<string>;
  write(content: string): void | Promise<void>;
  delete(): void | Promise<void>;
}

export class ExpoFileSystemLocalProfileStorageAdapter
  implements LocalProfileStoragePort
{
  constructor(private readonly document: ProfileDocument | null) {}

  async load(): Promise<LocalPrivateProfile | null> {
    if (!this.document) throw unavailableStorageError();
    let exists: boolean;
    try {
      exists = this.document.exists;
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'READ_FAILED',
        '端末内ファイルの状態を確認できませんでした。',
        error
      );
    }
    if (!exists) return null;
    let raw: string;
    try {
      raw = await this.document.text();
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'READ_FAILED',
        '端末内ファイルから Local Profile を読み込めませんでした。',
        error
      );
    }
    return parseStoredLocalProfile(raw);
  }

  async save(profile: LocalPrivateProfile): Promise<void> {
    if (!this.document) throw unavailableStorageError();
    const serialized = serializeLocalProfile(profile);
    try {
      await this.document.write(serialized);
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'WRITE_FAILED',
        '端末内ファイルへ Local Profile を保存できませんでした。',
        error
      );
    }
  }

  async inspect(): Promise<{ readonly count: 0 | 1; readonly bytes: number }> {
    if (!this.document) throw unavailableStorageError();
    try {
      if (!this.document.exists) return { count: 0, bytes: 0 };
      const size = this.document.size;
      if (size !== null && Number.isSafeInteger(size) && size >= 0) {
        return { count: 1, bytes: size };
      }
      const raw = await this.document.text();
      return { count: 1, bytes: new TextEncoder().encode(raw).byteLength };
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'READ_FAILED',
        '端末内ファイルの使用量を確認できませんでした。',
        error
      );
    }
  }

  async remove(): Promise<void> {
    if (!this.document) throw unavailableStorageError();
    try {
      if (this.document.exists) await this.document.delete();
    } catch (error: unknown) {
      throw new LocalProfileStorageError(
        'DELETE_FAILED',
        '端末内ファイルから Local Profile を削除できませんでした。',
        error
      );
    }
  }
}
