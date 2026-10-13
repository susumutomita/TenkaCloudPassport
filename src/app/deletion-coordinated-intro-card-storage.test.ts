import { describe, expect, it } from 'bun:test';
import { createIntroCard } from '../domain/intro-card';
import { DeletionCoordinatedIntroCardStorage } from './deletion-coordinated-intro-card-storage';
import { EMPTY_INTRO_CARD_DRAFT_FIELDS } from './intro-card-storage';
import {
  createLocalDataControl,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
} from './local-data-control';
import type { LocalDeletionJournalPort } from './local-deletion-journal';
import {
  INTRO_CARD_DRAFT_STORAGE_KEY,
  INTRO_CARD_STORAGE_KEY,
  WebIntroCardStorageAdapter,
} from './web-intro-card-storage';
import {
  type WebKeyValueStorage,
  WebLocalProfileStorageAdapter,
} from './web-local-profile-storage';

class Keys implements WebKeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
class Journal implements LocalDeletionJournalPort {
  pending = false;
  async isPending() {
    return this.pending;
  }
  async markPending() {
    this.pending = true;
  }
  async clear() {
    this.pending = false;
  }
}
function setup() {
  const keys = new Keys();
  const journal = new Journal();
  const leases = new LocalModelContextLeaseRegistry(false);
  const raw = new WebIntroCardStorageAdapter(keys);
  const cards = new DeletionCoordinatedIntroCardStorage(raw, leases, journal);
  const control = createLocalDataControl({
    profileStorage: new WebLocalProfileStorageAdapter(keys),
    modelStorage: new NoLocalModelStorageAdapter(),
    modelContexts: leases,
    deletionJournal: journal,
    introCardStorage: cards,
  });
  return { keys, journal, leases, raw, cards, control };
}
describe('global deletion includes saved card and draft', () => {
  it('keeps existing valid card/draft bytes through normal save and inspection', async () => {
    const { keys, cards, control } = setup();
    const card = createIntroCard({ name: 'QA local card' });
    await cards.save(card);
    await cards.saveDraft({
      ...EMPTY_INTRO_CARD_DRAFT_FIELDS,
      name: 'QA draft',
    });
    const before = [...keys.values];
    expect(await cards.load()).toEqual(card);
    expect((await cards.loadDraft())?.name).toBe('QA draft');
    expect((await control.preview()).totalBytes).toBe(
      [...keys.values.values()].reduce(
        (sum, raw) => sum + new TextEncoder().encode(raw).byteLength,
        0
      )
    );
    expect((await control.preview()).additionalCount).toBe(2);
    expect([...keys.values]).toEqual(before);
  });
  it('deletes card and draft, including malformed records, without parsing their contents', async () => {
    const { keys, cards, control, journal } = setup();
    keys.setItem(INTRO_CARD_STORAGE_KEY, '{malformed');
    keys.setItem(INTRO_CARD_DRAFT_STORAGE_KEY, '{malformed-draft');
    await control.deleteAll();
    expect(await cards.load()).toBeNull();
    expect(await cards.loadDraft()).toBeNull();
    expect(journal.pending).toBe(false);
    expect(keys.getItem(INTRO_CARD_STORAGE_KEY)).toBeNull();
    expect(keys.getItem(INTRO_CARD_DRAFT_STORAGE_KEY)).toBeNull();
  });
  it('blocks card and autosave writes during committed deletion and recovers retained draft', async () => {
    const { keys, cards, control, journal } = setup();
    journal.pending = true;
    await expect(
      cards.save(createIntroCard({ name: 'QA card' }))
    ).rejects.toThrow();
    await expect(
      cards.saveDraft({ ...EMPTY_INTRO_CARD_DRAFT_FIELDS, name: 'late draft' })
    ).rejects.toThrow();
    keys.setItem(INTRO_CARD_DRAFT_STORAGE_KEY, '{malformed-draft');
    expect(await control.recoverPendingDeletion()).toBe('recovered');
    expect(keys.values.size).toBe(0);
  });
  it('does not commit a deletion while an existing draft write holds a lease', async () => {
    const { leases, journal, control } = setup();
    const lease = leases.acquireProfileWrite();
    await expect(control.deleteAll()).rejects.toThrow();
    expect(journal.pending).toBe(false);
    lease.release();
    await control.deleteAll();
    expect(journal.pending).toBe(false);
  });
});
