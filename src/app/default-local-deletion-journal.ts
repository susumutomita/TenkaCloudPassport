import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { LocalDeletionJournalPort } from './local-deletion-journal';
import {
  ExpoFileSystemDeletionJournalAdapter,
  WebDeletionJournalAdapter,
} from './local-deletion-journal';

const LOCAL_DELETION_JOURNAL_FILE_NAME =
  'tenkacloud-passport-delete-all-pending';

/**
 * Profile 本体とは別の durable marker を Composition Root で構成する。全削除の途中で
 * Process が落ちても、この marker が次回起動時の Profile load より先に再削除を要求する。
 */
export function createDefaultLocalDeletionJournal(): LocalDeletionJournalPort {
  if (Platform.OS === 'web') {
    try {
      return new WebDeletionJournalAdapter(
        typeof globalThis.localStorage === 'undefined'
          ? null
          : globalThis.localStorage
      );
    } catch {
      return new WebDeletionJournalAdapter(null);
    }
  }
  try {
    return new ExpoFileSystemDeletionJournalAdapter(
      new File(Paths.document, LOCAL_DELETION_JOURNAL_FILE_NAME)
    );
  } catch {
    return new ExpoFileSystemDeletionJournalAdapter(null);
  }
}
