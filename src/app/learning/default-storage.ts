import { Directory, File, Paths } from 'expo-file-system';
import { writeAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { LIMITS } from '../../domain/learning/model';
import { requireValid } from '../../domain/learning/validation';
import type { LocalModelContextLeaseRegistry } from '../local-data-control';
import type { LocalDeletionJournalPort } from '../local-deletion-journal';
import { type LearningRawStorage, LearningStorage } from './storage';
import { WebLearningRawStorage } from './web-storage';

export function learningTemporaryDirectory(): Directory {
  return new Directory(Paths.cache, 'passport-learning-transfers');
}
function ownedImportDirectories(): Directory[] {
  const documentsInbox = new Directory(Paths.document, 'Inbox');
  const temporaryRoot = new Directory(Paths.document.parentDirectory, 'tmp');
  const temporaryInboxes = temporaryRoot.exists
    ? temporaryRoot
        .list()
        .filter(
          (item): item is Directory =>
            item instanceof Directory && item.name.endsWith('-Inbox')
        )
    : [];
  return [documentsInbox, ...temporaryInboxes].filter((item) => item.exists);
}
function nativeDocument(): File {
  return new File(Paths.document, 'tenkacloud-passport-learning-v1.json');
}
export function createLearningStorage(
  leases: LocalModelContextLeaseRegistry,
  journal: LocalDeletionJournalPort
): LearningStorage {
  const raw: LearningRawStorage =
    Platform.OS === 'web'
      ? new WebLearningRawStorage(() => globalThis.localStorage)
      : {
          async read() {
            const file = nativeDocument();
            if (!file.exists) return null;
            requireValid(file.size <= LIMITS.backupBytes);
            return file.text();
          },
          // Expo's legacy iOS writer uses Data.write(options: .atomic). The new File.write is non-atomic.
          async write(value) {
            await writeAsStringAsync(nativeDocument().uri, value);
          },
          async inspect() {
            const file = nativeDocument();
            const temporary = learningTemporaryDirectory();
            const inboxes = ownedImportDirectories();
            return {
              count:
                (file.exists ? 1 : 0) +
                (temporary.exists ? 1 : 0) +
                inboxes.length,
              bytes:
                (file.exists ? file.size : 0) +
                (temporary.exists ? (temporary.size ?? 0) : 0) +
                inboxes.reduce((sum, item) => sum + (item.size ?? 0), 0),
            };
          },
          async remove() {
            const file = nativeDocument();
            if (file.exists) file.delete();
            const temporary = learningTemporaryDirectory();
            if (temporary.exists) temporary.delete();
            ownedImportDirectories().forEach((directory) => {
              directory.delete();
            });
          },
        };
  return new LearningStorage(raw, leases, journal);
}
