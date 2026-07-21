import type { IntroCard } from '../domain/intro-card';
import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import {
  type IntroCardDraftFields,
  IntroCardStorageError,
  type IntroCardStoragePort,
  parseStoredIntroCard,
  parseStoredIntroCardDraft,
  serializeIntroCard,
  serializeIntroCardDraft,
  unavailableIntroCardStorageError,
} from './intro-card-storage';

export class ExpoFileSystemIntroCardStorageAdapter
  implements IntroCardStoragePort
{
  /**
   * Issue 93: `draftDocument` は確定カードとは別ファイル
   * （`tenkacloud-passport-intro-card-draft.json`）を指す。既存 Storage への
   * 「別キー追加」という実装ノートの指示を Native では「別ファイル追加」として
   * 実現する。
   */
  constructor(
    private readonly document: ProfileDocument | null,
    private readonly draftDocument: ProfileDocument | null
  ) {}

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

  async loadDraft(): Promise<IntroCardDraftFields | null> {
    if (!this.draftDocument) throw unavailableIntroCardStorageError();
    let exists: boolean;
    try {
      exists = this.draftDocument.exists;
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
      raw = await this.draftDocument.text();
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'READ_FAILED',
        '端末内ファイルから下書きを読み込めませんでした。',
        error
      );
    }
    try {
      return parseStoredIntroCardDraft(raw);
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'INVALID_DATA',
        '端末内の下書きは有効な保存データではありません。',
        error
      );
    }
  }

  async saveDraft(draft: IntroCardDraftFields): Promise<void> {
    if (!this.draftDocument) throw unavailableIntroCardStorageError();
    const serialized = serializeIntroCardDraft(draft);
    try {
      await this.draftDocument.write(serialized);
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'WRITE_FAILED',
        '端末内ファイルへ下書きを保存できませんでした。',
        error
      );
    }
  }

  async clearDraft(): Promise<void> {
    if (!this.draftDocument) throw unavailableIntroCardStorageError();
    try {
      if (this.draftDocument.exists) await this.draftDocument.delete();
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'DELETE_FAILED',
        '端末内ファイルから下書きを削除できませんでした。',
        error
      );
    }
  }
}
