import type { IntroCard } from '../domain/intro-card';
import {
  type IntroCardDraftFields,
  type IntroCardStoragePort,
  serializeIntroCardDraft,
} from './intro-card-storage';
import {
  type LocalModelContextLeaseRegistry,
  withLocalDataWrite,
} from './local-data-control';
import type { LocalDeletionJournalPort } from './local-deletion-journal';

export class DeletionCoordinatedIntroCardStorage
  implements IntroCardStoragePort
{
  constructor(
    private readonly delegate: IntroCardStoragePort,
    private readonly leases: LocalModelContextLeaseRegistry,
    private readonly journal: LocalDeletionJournalPort
  ) {}
  load() {
    return this.delegate.load();
  }
  loadDraft() {
    return this.delegate.loadDraft();
  }
  inspect() {
    return this.delegate.inspect();
  }
  async inspectDraft(): Promise<{
    readonly count: 0 | 1;
    readonly bytes: number;
  }> {
    if (this.delegate.inspectDraft) return this.delegate.inspectDraft();
    const draft = await this.delegate.loadDraft();
    return {
      count: draft === null ? 0 : 1,
      bytes:
        draft === null
          ? 0
          : new TextEncoder().encode(serializeIntroCardDraft(draft)).byteLength,
    };
  }
  save(card: IntroCard): Promise<void> {
    return withLocalDataWrite(this.leases, this.journal, () =>
      this.delegate.save(card)
    );
  }
  saveDraft(draft: IntroCardDraftFields): Promise<void> {
    return withLocalDataWrite(this.leases, this.journal, () =>
      this.delegate.saveDraft(draft)
    );
  }
  remove() {
    return this.delegate.remove();
  }
  clearDraft() {
    return this.delegate.clearDraft();
  }
}
