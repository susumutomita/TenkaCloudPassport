import type { IntroCard } from '../domain/intro-card';
import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import {
  IntroCardStorageError,
  type IntroCardStoragePort,
  parseStoredIntroCard,
  serializeIntroCard,
  unavailableIntroCardStorageError,
} from './intro-card-storage';

export class ExpoFileSystemIntroCardStorageAdapter
  implements IntroCardStoragePort
{
  constructor(private readonly document: ProfileDocument | null) {}

  async load(): Promise<IntroCard | null> {
    if (!this.document) throw unavailableIntroCardStorageError();
    let exists: boolean;
    try {
      exists = this.document.exists;
    } catch (error: unknown) {
      throw new IntroCardStorageError(
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
      throw new IntroCardStorageError(
        'READ_FAILED',
        '端末内ファイルから自己紹介カードを読み込めませんでした。',
        error
      );
    }
    return parseStoredIntroCard(raw);
  }

  async save(card: IntroCard): Promise<void> {
    if (!this.document) throw unavailableIntroCardStorageError();
    const serialized = serializeIntroCard(card);
    try {
      await this.document.write(serialized);
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'WRITE_FAILED',
        '端末内ファイルへ自己紹介カードを保存できませんでした。',
        error
      );
    }
  }

  async inspect(): Promise<{ readonly count: 0 | 1; readonly bytes: number }> {
    if (!this.document) throw unavailableIntroCardStorageError();
    try {
      if (!this.document.exists) return { count: 0, bytes: 0 };
      const size = this.document.size;
      if (size !== null && Number.isSafeInteger(size) && size >= 0) {
        return { count: 1, bytes: size };
      }
      const raw = await this.document.text();
      return { count: 1, bytes: new TextEncoder().encode(raw).byteLength };
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'READ_FAILED',
        '端末内ファイルの使用量を確認できませんでした。',
        error
      );
    }
  }

  async remove(): Promise<void> {
    if (!this.document) throw unavailableIntroCardStorageError();
    try {
      if (this.document.exists) await this.document.delete();
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'DELETE_FAILED',
        '端末内ファイルから自己紹介カードを削除できませんでした。',
        error
      );
    }
  }
}
