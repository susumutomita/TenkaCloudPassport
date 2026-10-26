export const OWNED_DATABASE_SUFFIXES = [
  '',
  '-journal',
  '-wal',
  '-shm',
] as const;
/** Inspection must not parse/open a damaged database before an explicit erase. */
export function inspectOwnedDatabase(
  info: (suffix: string) => { exists: boolean; size?: number }
) {
  let count = 0;
  let bytes = 0;
  for (const suffix of OWNED_DATABASE_SUFFIXES) {
    const file = info(suffix);
    if (file.exists) {
      if (
        typeof file.size !== 'number' ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0
      )
        throw new Error('Practice file size could not be confirmed.');
      count++;
      bytes += file.size;
    }
  }
  return { count, bytes };
}
/** Native delete must succeed before retryable cleanup of this database's sidecars. */
export async function eraseOwnedDatabase(
  exists: (suffix: string) => boolean,
  removeSidecar: (suffix: string) => void,
  deleteDatabase: () => Promise<void>
): Promise<void> {
  if (exists('')) await deleteDatabase();
  if (exists(''))
    throw new Error('Practice database removal was not confirmed.');
  for (const suffix of OWNED_DATABASE_SUFFIXES.slice(1)) {
    if (exists(suffix)) removeSidecar(suffix);
    if (exists(suffix))
      throw new Error('Practice journal removal was not confirmed.');
  }
}
