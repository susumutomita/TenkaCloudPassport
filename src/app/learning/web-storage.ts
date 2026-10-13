import type { WebKeyValueStorage } from '../web-local-profile-storage';
import { LEARNING_STORAGE_KEY, type LearningRawStorage } from './storage';

export class WebLearningRawStorage implements LearningRawStorage {
  constructor(
    private readonly storage: WebKeyValueStorage | (() => WebKeyValueStorage)
  ) {}
  private resolve(): WebKeyValueStorage {
    return typeof this.storage === 'function' ? this.storage() : this.storage;
  }
  async read(): Promise<string | null> {
    return this.resolve().getItem(LEARNING_STORAGE_KEY);
  }
  async write(raw: string): Promise<void> {
    this.resolve().setItem(LEARNING_STORAGE_KEY, raw);
  }
  async remove(): Promise<void> {
    this.resolve().removeItem(LEARNING_STORAGE_KEY);
  }
}
