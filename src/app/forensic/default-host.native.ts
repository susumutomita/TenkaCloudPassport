import { bytesToHex } from '@noble/hashes/utils.js';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseAsync,
} from 'expo-sqlite';
import { webCryptoRandomBytes } from '../../protocol/web-crypto-random';
import {
  type LocalModelContextLeaseRegistry,
  withLocalDataWrite,
} from '../local-data-control';
import type { LocalDeletionJournalPort } from '../local-deletion-journal';
import { PracticeConnection } from './connection';
import {
  eraseOwnedDatabase,
  inspectOwnedDatabase,
} from './erase-owned-database';
import { ForensicHost } from './host';

export function createForensicHost(
  leases: LocalModelContextLeaseRegistry,
  journal: LocalDeletionJournalPort
) {
  const key = 'passport.forensic.practice.seed.v1';
  const databaseName = 'passport-forensic-v1.sqlite';
  const databaseFile = (suffix: string) =>
    new File(defaultDatabaseDirectory, databaseName + suffix);
  const database = new PracticeConnection(
    () => openDatabaseAsync(databaseName),
    (value) => value.closeAsync(),
    () =>
      eraseOwnedDatabase(
        (suffix) => databaseFile(suffix).info().exists,
        (suffix) => databaseFile(suffix).delete(),
        () => deleteDatabaseAsync(databaseName)
      )
  );
  return new ForensicHost(
    () => database.open(),
    {
      read: () => SecureStore.getItemAsync(key),
      write: (value) =>
        SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      remove: () => SecureStore.deleteItemAsync(key),
    },
    () => bytesToHex(webCryptoRandomBytes(32)),
    (operation) => withLocalDataWrite(leases, journal, operation),
    {
      erase: () => database.erase(),
      inspect: async () =>
        inspectOwnedDatabase((suffix) => databaseFile(suffix).info()),
    }
  );
}
