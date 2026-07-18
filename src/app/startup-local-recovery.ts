import type { LocalPrivateProfile } from '../domain/passport';
import type { LocalDataControl } from './local-data-control';
import type { LocalProfileStoragePort } from './local-profile-storage';

type StartupLocalDataControl = Pick<LocalDataControl, 'recoverPendingDeletion'>;
type StartupLocalProfileStorage = Pick<LocalProfileStoragePort, 'load'>;

export type StartupLocalRecoveryResult =
  | {
      readonly kind: 'loaded';
      readonly profile: LocalPrivateProfile | null;
      readonly recovery: 'not-pending' | 'recovered';
    }
  | { readonly kind: 'recovery-failed'; readonly error: unknown }
  | { readonly kind: 'profile-load-failed'; readonly error: unknown };

/** tombstone の確認・回復に成功するまで Profile load を開始しない。 */
export async function recoverLocalStateAtStartup(
  localDataControl: StartupLocalDataControl,
  localProfileStorage: StartupLocalProfileStorage
): Promise<StartupLocalRecoveryResult> {
  let recovery: 'not-pending' | 'recovered';
  try {
    recovery = await localDataControl.recoverPendingDeletion();
  } catch (error: unknown) {
    return { kind: 'recovery-failed', error };
  }
  if (recovery === 'recovered') {
    return { kind: 'loaded', profile: null, recovery };
  }
  try {
    return {
      kind: 'loaded',
      profile: await localProfileStorage.load(),
      recovery,
    };
  } catch (error: unknown) {
    return { kind: 'profile-load-failed', error };
  }
}
