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
  text(): Promise<string>;
  write(content: string): void | Promise<void>;
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
}
