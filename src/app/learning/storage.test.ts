import { describe, expect, it } from 'bun:test';
import {
  BUNDLED_CATALOGS,
  emptyLearningState,
} from '../../../tests/fixtures/learning/catalogs';
import { type Catalog, LIMITS, lessonKey } from '../../domain/learning/model';
import {
  addCatalog,
  answer,
  startLesson,
} from '../../domain/learning/transitions';
import { exportBackup, restoreBackup } from '../../domain/learning/validation';
import {
  createLocalDataControl,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
} from '../local-data-control';
import type { LocalDeletionJournalPort } from '../local-deletion-journal';
import {
  LOCAL_PROFILE_STORAGE_KEY,
  type WebKeyValueStorage,
  WebLocalProfileStorageAdapter,
} from '../web-local-profile-storage';
import {
  LEARNING_STORAGE_KEY,
  type LearningRawStorage,
  LearningSession,
  LearningStorage,
} from './storage';
import { WebLearningRawStorage } from './web-storage';

class MemoryKeys implements WebKeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
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
function fixture() {
  const keys = new MemoryKeys();
  const leases = new LocalModelContextLeaseRegistry(false);
  const journal = new Journal();
  const raw = new WebLearningRawStorage(keys);
  const storage = new LearningStorage(raw, leases, journal);
  return { keys, leases, journal, raw, storage };
}
function changed() {
  const catalog = BUNDLED_CATALOGS[0] as Catalog;
  const lesson = catalog.lessons[0];
  const step = lesson?.steps[0];
  if (!lesson || !step) throw new Error('Missing data');
  return answer(
    startLesson(emptyLearningState(), lessonKey(catalog, lesson), 'one'),
    {
      key: lessonKey(catalog, lesson),
      stepID: step.id,
      session: 'one',
      choiceID: step.correctChoiceID,
      timestamp: 100,
    }
  );
}
describe('learning persistence and deletion boundary', () => {
  it('adds isolated learning storage without migrating or altering legacy Passport keys', async () => {
    const { keys, storage } = fixture();
    keys.setItem(LOCAL_PROFILE_STORAGE_KEY, 'legacy-profile-exact-bytes');
    keys.setItem('tenkacloud-passport.intro-card', 'legacy-card-exact-bytes');
    expect((await storage.load()).catalogs.length).toBe(0);
    await storage.save(changed());
    expect(await storage.load()).toEqual(changed());
    await storage.remove();
    expect(keys.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe(
      'legacy-profile-exact-bytes'
    );
    expect(keys.getItem('tenkacloud-passport.intro-card')).toBe(
      'legacy-card-exact-bytes'
    );
  });
  it('refuses corrupt/unknown saved data without overwriting it and allows explicit backup recovery', async () => {
    const { keys, storage } = fixture();
    keys.setItem(LEARNING_STORAGE_KEY, '{broken');
    await expect(storage.load()).rejects.toThrow();
    expect(keys.getItem(LEARNING_STORAGE_KEY)).toBe('{broken');
    const restored = restoreBackup(exportBackup(changed()), BUNDLED_CATALOGS);
    await storage.save(restored);
    expect(await storage.load()).toEqual(changed());
  });
  it('loads existing catalogs without silently adding or replacing content', async () => {
    const { keys, storage } = fixture();
    const catalog = BUNDLED_CATALOGS[0] as Catalog;
    let state = { ...emptyLearningState(), catalogs: [] as Catalog[] };
    for (let index = 0; index < LIMITS.catalogs; index += 1)
      state = addCatalog(state, {
        ...catalog,
        catalogID: `custom-${index}`,
      }) as typeof state;
    keys.setItem(LEARNING_STORAGE_KEY, JSON.stringify(state));
    expect((await storage.load()).catalogs.length).toBe(LIMITS.catalogs);
  });
  it('publishes changes only after successful persistence and rejects stale commits', async () => {
    const { storage } = fixture();
    const session = new LearningSession(emptyLearningState(), storage);
    const old = session.revision;
    await session.commit(old, () => changed());
    await expect(
      session.commit(old, () => emptyLearningState())
    ).rejects.toThrow();
    expect(session.state).toEqual(changed());
    const failing = new LearningSession(emptyLearningState(), {
      async save() {
        throw new Error('disk full');
      },
    });
    await expect(failing.commit(0, () => changed())).rejects.toThrow();
    expect(failing.state).toEqual(emptyLearningState());
  });
  it('serializes simultaneous save/restore and preserves committed state on rejection', async () => {
    let finish: (() => void) | undefined;
    const session = new LearningSession(emptyLearningState(), {
      save: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    const first = session.commit(0, () => changed());
    await expect(
      session.commit(0, () => emptyLearningState())
    ).rejects.toThrow();
    if (!finish) throw new Error('Missing pending write');
    finish();
    await first;
    expect(session.state).toEqual(changed());
  });
  it('blocks saves while deletion is pending or recovery has not completed', async () => {
    const { storage, journal } = fixture();
    journal.pending = true;
    await expect(storage.save(changed())).rejects.toThrow();
    const blocked = new LearningStorage(
      {
        async read() {
          return null;
        },
        async write() {
          throw new Error('must not reach write');
        },
        async remove() {
          return;
        },
      },
      new LocalModelContextLeaseRegistry(),
      new Journal()
    );
    await expect(blocked.save(changed())).rejects.toThrow();
  });
  it('includes learning in usage and global deletion only on dedicated test data', async () => {
    const { storage, keys, leases, journal } = fixture();
    await storage.save(changed());
    const profile = new WebLocalProfileStorageAdapter(keys);
    const control = createLocalDataControl({
      profileStorage: profile,
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: leases,
      deletionJournal: journal,
      learningStorage: storage,
    });
    expect((await control.preview()).totalBytes).toBe(
      new TextEncoder().encode(keys.getItem(LEARNING_STORAGE_KEY) ?? '')
        .byteLength
    );
    await control.deleteAll();
    expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
    expect(journal.pending).toBe(false);
    expect((await storage.load()).attempts).toEqual([]);
  });
  it('retains deletion journal for residual cache and recovers interrupted removal', async () => {
    const { keys, leases, journal } = fixture();
    let residual = true;
    let fail = true;
    const raw: LearningRawStorage = {
      async read() {
        return null;
      },
      async write() {
        return;
      },
      async inspect() {
        return { count: residual ? 1 : 0, bytes: residual ? 20 : 0 };
      },
      async remove() {
        if (fail) throw new Error('cache busy');
        residual = false;
      },
    };
    const storage = new LearningStorage(raw, leases, journal);
    const control = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(keys),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: leases,
      deletionJournal: journal,
      learningStorage: storage,
    });
    await expect(control.deleteAll()).rejects.toThrow();
    expect(journal.pending).toBe(true);
    await expect(storage.save(changed())).rejects.toThrow();
    fail = false;
    expect(await control.recoverPendingDeletion()).toBe('recovered');
    expect(residual).toBe(false);
    expect(journal.pending).toBe(false);
  });
});

describe('iOS import copy ownership', () => {
  it('cleans app Inbox copies only; source files and escaped paths remain untouched', async () => {
    const { isOwnedImportCopy } = await import('./import-ownership');
    const documentURI =
      'file:///private/var/mobile/Containers/Data/Application/QA/Documents/';
    expect(
      isOwnedImportCopy(
        'file:///private/var/mobile/Containers/Data/Application/QA/tmp/cloud.tenka.passport-Inbox/backup.json',
        documentURI
      )
    ).toBe(true);
    expect(
      isOwnedImportCopy(`${documentURI}Inbox/backup.json`, documentURI)
    ).toBe(true);
    expect(isOwnedImportCopy(`${documentURI}personal.json`, documentURI)).toBe(
      false
    );
    expect(
      isOwnedImportCopy(
        'file:///private/var/mobile/Library/Mobile%20Documents/backup.json',
        documentURI
      )
    ).toBe(false);
    expect(
      isOwnedImportCopy(
        'file:///private/var/mobile/Containers/Data/Application/OTHER/tmp/app-Inbox/backup.json',
        documentURI
      )
    ).toBe(false);
    expect(
      isOwnedImportCopy(
        `${documentURI}Inbox/%2e%2e%2fpersonal.json`,
        documentURI
      )
    ).toBe(false);
  });
});
