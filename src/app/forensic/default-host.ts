import type { LocalModelContextLeaseRegistry } from '../local-data-control';
import type { LocalDeletionJournalPort } from '../local-deletion-journal';
import type { ForensicPort } from './host';

/** Native SQLite/Keychain feature. Web never substitutes weaker persistence. */
export function createForensicHost(
  _leases: LocalModelContextLeaseRegistry,
  _journal: LocalDeletionJournalPort
): ForensicPort & {
  available: boolean;
  inspect(): Promise<{ count: number; bytes: number }>;
  remove(): Promise<void>;
} {
  const unavailable = async (): Promise<never> => {
    throw new Error('Device-only practice requires the iOS or Android app.');
  };
  return {
    available: false,
    load: unavailable,
    submit: unavailable,
    inspect: async () => ({ count: 0, bytes: 0 }),
    remove: async () => undefined,
  };
}
