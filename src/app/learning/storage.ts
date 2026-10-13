import type { LearningState } from '../../domain/learning/model';
import { LIMITS } from '../../domain/learning/model';
import { parseJSON, validateState } from '../../domain/learning/validation';
import {
  type LocalModelContextLeaseRegistry,
  withLocalDataWrite,
} from '../local-data-control';
import type { LocalDeletionJournalPort } from '../local-deletion-journal';
import { emptyLearningState } from './bundled';

export const LEARNING_STORAGE_KEY = 'tenkacloud-passport.learning.v1';
export interface LearningRawStorage {
  read(): Promise<string | null>;
  inspect?(): Promise<{ readonly count: number; readonly bytes: number }>;
  write(raw: string): Promise<void>;
  remove(): Promise<void>;
}
export class LearningStorage {
  constructor(
    private readonly raw: LearningRawStorage,
    private readonly leases: LocalModelContextLeaseRegistry,
    private readonly journal: LocalDeletionJournalPort
  ) {}
  async load(): Promise<LearningState> {
    const raw = await this.raw.read();
    if (raw === null) return emptyLearningState();
    const state = validateState(parseJSON(raw, LIMITS.backupBytes));
    return state;
  }

  async save(state: LearningState): Promise<void> {
    validateState(state);
    const raw = JSON.stringify(state);
    parseJSON(raw, LIMITS.backupBytes);
    await withLocalDataWrite(this.leases, this.journal, () =>
      this.raw.write(raw)
    );
  }

  async inspect(): Promise<{ readonly count: number; readonly bytes: number }> {
    if (this.raw.inspect) return this.raw.inspect();
    const raw = await this.raw.read();
    return {
      count: raw === null ? 0 : 1,
      bytes: raw === null ? 0 : new TextEncoder().encode(raw).byteLength,
    };
  }
  remove(): Promise<void> {
    return this.raw.remove();
  }
}
/** Persist before publishing; callers serialize operations and reject stale revisions. */
export class LearningSession {
  #revision = 0;
  #busy = false;
  constructor(
    public state: LearningState,
    private readonly storage: Pick<LearningStorage, 'save'>
  ) {}
  get revision(): number {
    return this.#revision;
  }
  async commit(
    expectedRevision: number,
    change: (state: LearningState) => LearningState
  ): Promise<void> {
    if (this.#busy || expectedRevision !== this.#revision)
      throw new Error('学習状態が更新されました。画面を開き直してください。');
    this.#busy = true;
    try {
      const next = validateState(change(this.state));
      await this.storage.save(next);
      this.state = next;
      this.#revision += 1;
    } finally {
      this.#busy = false;
    }
  }
}
