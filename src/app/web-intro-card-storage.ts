import type { IntroCard } from '../domain/intro-card';
import {
  IntroCardStorageError,
  type IntroCardStoragePort,
  parseStoredIntroCard,
  serializeIntroCard,
  unavailableIntroCardStorageError,
} from './intro-card-storage';
import type { WebKeyValueStorage } from './web-local-profile-storage';

export const INTRO_CARD_STORAGE_KEY = 'tenkacloud-passport.intro-card';

export class WebIntroCardStorageAdapter implements IntroCardStoragePort {
  constructor(private readonly storage: WebKeyValueStorage | null) {}

  async load(): Promise<IntroCard | null> {
    if (!this.storage) throw unavailableIntroCardStorageError();
    let raw: string | null;
    try {
      raw = this.storage.getItem(INTRO_CARD_STORAGE_KEY);
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'READ_FAILED',
        '端末内 Storage から自己紹介カードを読み込めませんでした。',
        error
      );
    }
    return raw === null ? null : parseStoredIntroCard(raw);
  }

  async save(card: IntroCard): Promise<void> {
    if (!this.storage) throw unavailableIntroCardStorageError();
    const serialized = serializeIntroCard(card);
    try {
      this.storage.setItem(INTRO_CARD_STORAGE_KEY, serialized);
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'WRITE_FAILED',
        '端末内 Storage へ自己紹介カードを保存できませんでした。',
        error
      );
    }
  }

  async inspect(): Promise<{ readonly count: 0 | 1; readonly bytes: number }> {
    if (!this.storage) throw unavailableIntroCardStorageError();
    try {
      const raw = this.storage.getItem(INTRO_CARD_STORAGE_KEY);
      return raw === null
        ? { count: 0, bytes: 0 }
        : { count: 1, bytes: new TextEncoder().encode(raw).byteLength };
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'READ_FAILED',
        '端末内 Storage の使用量を確認できませんでした。',
        error
      );
    }
  }

  async remove(): Promise<void> {
    if (!this.storage) throw unavailableIntroCardStorageError();
    try {
      this.storage.removeItem(INTRO_CARD_STORAGE_KEY);
    } catch (error: unknown) {
      throw new IntroCardStorageError(
        'DELETE_FAILED',
        '端末内 Storage から自己紹介カードを削除できませんでした。',
        error
      );
    }
  }
}
