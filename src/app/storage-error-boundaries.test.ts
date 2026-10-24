import { describe, expect, it } from 'bun:test';
import { createLocalPrivateProfile } from '../domain/passport';
import { DeletionCoordinatedIntroCardStorage } from './deletion-coordinated-intro-card-storage';
import { ExpoFileSystemIntroCardStorageAdapter } from './expo-file-system-intro-card-storage';
import {
  ExpoFileSystemLocalProfileStorageAdapter,
  type ProfileDocument,
} from './expo-file-system-local-profile-storage';
import {
  EMPTY_INTRO_CARD_DRAFT_FIELDS,
  type IntroCardStoragePort,
  parseStoredIntroCard,
} from './intro-card-storage';
import {
  createLocalDataControl,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
  withLocalDataWrite,
} from './local-data-control';
import { WebDeletionJournalAdapter } from './local-deletion-journal';
import { ExpoFileSystemLocalePreferenceStorageAdapter } from './locale-preference-storage';
import {
  FileBackedWebStorage,
  trackTemporaryDirectories,
} from './storage-test-kit';
import {
  INTRO_CARD_DRAFT_STORAGE_KEY,
  WebIntroCardStorageAdapter,
} from './web-intro-card-storage';
import {
  LOCAL_PROFILE_STORAGE_KEY,
  type WebKeyValueStorage,
  WebLocalProfileStorageAdapter,
} from './web-local-profile-storage';

const roots = trackTemporaryDirectories();
const ioFailure = new Error('Synthetic storage I/O failure');
type Fault = 'read' | 'write' | 'delete' | 'exists';

// Faults are injected only at the external storage boundary. Domain validation
// and the adapters under test run normally and must preserve the original cause.
function webFault(fault: Fault): WebKeyValueStorage {
  return {
    getItem: () => {
      if (fault === 'read') throw ioFailure;
      return null;
    },
    setItem: () => {
      if (fault === 'write') throw ioFailure;
    },
    removeItem: () => {
      if (fault === 'delete') throw ioFailure;
    },
  };
}
function nativeFault(fault: Fault, raw = '{malformed'): ProfileDocument {
  return {
    get exists() {
      if (fault === 'exists') throw ioFailure;
      return true;
    },
    get size() {
      return null;
    },
    text: async () => {
      if (fault === 'read') throw ioFailure;
      return raw;
    },
    write: async () => {
      if (fault === 'write') throw ioFailure;
    },
    delete: async () => {
      if (fault === 'delete') throw ioFailure;
    },
  };
}
const savedCard = { name: 'Synthetic Card' };
const draft = { ...EMPTY_INTRO_CARD_DRAFT_FIELDS, name: '下書き' };
const profile = createLocalPrivateProfile({
  petName: 'Synthetic',
  petEmoji: '🐾',
  ownerAlias: '',
  candidateClueIds: ['open-source'],
  selectedForPassportClueIds: ['open-source'],
  languageCodes: ['en'],
});

describe('storage adapter error boundaries', () => {
  it('blocks a write when the deletion journal cannot be read and releases the write lease', async () => {
    const leases = new LocalModelContextLeaseRegistry(false);
    let written = false;
    await expect(
      withLocalDataWrite(
        leases,
        {
          isPending: async () => {
            throw ioFailure;
          },
          markPending: async () => undefined,
          clear: async () => undefined,
        },
        async () => {
          written = true;
        }
      )
    ).rejects.toMatchObject({ reason: 'pending-deletion' });
    expect(written).toBe(false);
    const next = leases.acquireProfileWrite();
    next.release();
  });
  it.each(['model', 'write'] as const)(
    'does not recover deletion concurrently with an active %s lease',
    async (kind) => {
      const data = new FileBackedWebStorage(roots.create());
      const leases = new LocalModelContextLeaseRegistry(false);
      const control = createLocalDataControl({
        profileStorage: new WebLocalProfileStorageAdapter(data),
        modelStorage: new NoLocalModelStorageAdapter(),
        modelContexts: leases,
        deletionJournal: new WebDeletionJournalAdapter(data),
      });
      const lease =
        kind === 'model' ? leases.acquire() : leases.acquireProfileWrite();
      try {
        await expect(control.recoverPendingDeletion()).rejects.toMatchObject({
          code: kind === 'model' ? 'MODEL_IN_USE' : 'STORAGE_FAILURE',
        });
      } finally {
        lease.release();
      }
    }
  );
  it('keeps deletion pending if learning storage falsely reports removal success', async () => {
    const data = new FileBackedWebStorage(roots.create());
    const journal = new WebDeletionJournalAdapter(data);
    const control = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(data),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(false),
      deletionJournal: journal,
      learningStorage: {
        inspect: async () => ({ count: 1, bytes: 7 }),
        remove: async () => undefined,
      },
    });
    await expect(control.deleteAll()).rejects.toMatchObject({
      code: 'DELETE_INTERRUPTED',
    });
    expect(await journal.isPending()).toBe(true);
  });
  it('locale reads distinguish an existing file whose content cannot be read', async () => {
    await expect(
      new ExpoFileSystemLocalePreferenceStorageAdapter(
        nativeFault('read')
      ).load()
    ).rejects.toMatchObject({ code: 'READ_FAILED', cause: ioFailure });
  });
  const webCases = [
    ['read', 'READ_FAILED', (port: IntroCardStoragePort) => port.load()],
    [
      'write',
      'WRITE_FAILED',
      (port: IntroCardStoragePort) => port.save(savedCard),
    ],
    ['read', 'READ_FAILED', (port: IntroCardStoragePort) => port.inspect()],
    ['delete', 'DELETE_FAILED', (port: IntroCardStoragePort) => port.remove()],
    ['read', 'READ_FAILED', (port: IntroCardStoragePort) => port.loadDraft()],
    [
      'write',
      'WRITE_FAILED',
      (port: IntroCardStoragePort) => port.saveDraft(draft),
    ],
    [
      'delete',
      'DELETE_FAILED',
      (port: IntroCardStoragePort) => port.clearDraft(),
    ],
  ] as const;
  it.each(webCases)(
    'web %s failure remains %s (%#)',
    async (fault, code, action) => {
      await expect(
        action(new WebIntroCardStorageAdapter(webFault(fault)))
      ).rejects.toMatchObject({ code, cause: ioFailure });
    }
  );
  it.each(webCases)(
    'native %s failure remains %s (%#)',
    async (fault, code, action) => {
      const document = nativeFault(fault);
      await expect(
        action(new ExpoFileSystemIntroCardStorageAdapter(document, document))
      ).rejects.toMatchObject({ code, cause: ioFailure });
    }
  );
  it.each(['load', 'loadDraft'] as const)(
    'native existence failure is not treated as empty %s',
    async (method) => {
      const document = nativeFault('exists');
      const cards = new ExpoFileSystemIntroCardStorageAdapter(
        document,
        document
      );
      await expect(cards[method]()).rejects.toMatchObject({
        code: 'READ_FAILED',
        cause: ioFailure,
      });
    }
  );
  it('native corrupt draft remains invalid data instead of becoming an empty form', async () => {
    const document = nativeFault('write');
    await expect(
      new ExpoFileSystemIntroCardStorageAdapter(document, document).loadDraft()
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });
  });
  it('web corrupt draft remains invalid data instead of becoming an empty form', async () => {
    const data = new FileBackedWebStorage(roots.create());
    data.setItem(INTRO_CARD_DRAFT_STORAGE_KEY, '{malformed');
    await expect(
      new WebIntroCardStorageAdapter(data).loadDraft()
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });
    expect(data.getItem(INTRO_CARD_DRAFT_STORAGE_KEY)).toBe('{malformed');
  });
  it.each(['read', 'delete'] as const)(
    'profile web %s failure preserves its cause',
    async (fault) => {
      const adapter = new WebLocalProfileStorageAdapter(webFault(fault));
      await expect(
        fault === 'read' ? adapter.load() : adapter.remove()
      ).rejects.toMatchObject({
        code: fault === 'read' ? 'READ_FAILED' : 'DELETE_FAILED',
        cause: ioFailure,
      });
    }
  );
  it.each(['read', 'exists'] as const)(
    'profile native %s failure is not treated as a missing profile',
    async (fault) => {
      await expect(
        new ExpoFileSystemLocalProfileStorageAdapter(nativeFault(fault)).load()
      ).rejects.toMatchObject({ code: 'READ_FAILED', cause: ioFailure });
    }
  );
  it('profile write errors preserve their cause', async () => {
    await expect(
      new WebLocalProfileStorageAdapter(webFault('write')).save(profile)
    ).rejects.toMatchObject({ code: 'WRITE_FAILED', cause: ioFailure });
  });
  it('profile inspection errors are not reported as zero usage', async () => {
    await expect(
      new WebLocalProfileStorageAdapter(webFault('read')).inspect()
    ).rejects.toMatchObject({ code: 'READ_FAILED', cause: ioFailure });
  });
  it('invalid profile serialization preserves the previously saved profile bytes', async () => {
    const data = new FileBackedWebStorage(roots.create());
    const adapter = new WebLocalProfileStorageAdapter(data);
    await adapter.save(profile);
    const before = data.getItem(LOCAL_PROFILE_STORAGE_KEY);
    await expect(
      adapter.save({ ...profile, petName: '' })
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });
    expect(data.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe(before);
    expect(await adapter.load()).toEqual(profile);
  });
  it.each(['null', '42', '"not a card"'])(
    'rejects non-object saved card %s',
    (raw) => {
      expect(() => parseStoredIntroCard(raw)).toThrow();
    }
  );
  it('legacy draft inspection supports optional inspectDraft without discarding persisted data', async () => {
    const data = new FileBackedWebStorage(roots.create());
    const raw = new WebIntroCardStorageAdapter(data);
    const legacy: IntroCardStoragePort = {
      load: () => raw.load(),
      loadDraft: () => raw.loadDraft(),
      inspect: () => raw.inspect(),
      save: (card) => raw.save(card),
      saveDraft: (value) => raw.saveDraft(value),
      remove: () => raw.remove(),
      clearDraft: () => raw.clearDraft(),
    };
    const cards = new DeletionCoordinatedIntroCardStorage(
      legacy,
      new LocalModelContextLeaseRegistry(),
      {
        isPending: async () => false,
        markPending: async () => undefined,
        clear: async () => undefined,
      }
    );
    const control = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(data),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(false),
      deletionJournal: new WebDeletionJournalAdapter(data),
      introCardStorage: legacy,
    });
    expect(await cards.inspectDraft()).toEqual({ count: 0, bytes: 0 });
    expect((await control.preview()).totalBytes).toBe(0);
    await raw.saveDraft(draft);
    const before = data.getItem(INTRO_CARD_DRAFT_STORAGE_KEY);
    expect(await cards.inspectDraft()).toEqual({
      count: 1,
      bytes: Buffer.byteLength(before ?? '', 'utf8'),
    });
    expect(await raw.loadDraft()).toEqual(draft);
    expect(data.getItem(INTRO_CARD_DRAFT_STORAGE_KEY)).toBe(before);
    expect((await control.preview()).additionalCount).toBe(1);
    expect((await control.preview()).totalBytes).toBe(
      Buffer.byteLength(before ?? '', 'utf8')
    );
    const journal = new WebDeletionJournalAdapter(data);
    const broken = createLocalDataControl({
      profileStorage: new WebLocalProfileStorageAdapter(data),
      modelStorage: new NoLocalModelStorageAdapter(),
      modelContexts: new LocalModelContextLeaseRegistry(false),
      deletionJournal: journal,
      introCardStorage: { ...legacy, clearDraft: async () => undefined },
    });
    await expect(broken.deleteAll()).rejects.toMatchObject({
      code: 'DELETE_INTERRUPTED',
    });
    expect(await journal.isPending()).toBe(true);
    expect(await raw.loadDraft()).toEqual(draft);
  });
});
