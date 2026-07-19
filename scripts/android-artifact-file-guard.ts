import { constants } from 'node:fs';
import { type FileHandle, lstat, open } from 'node:fs/promises';
import { AndroidArtifactIntegrityError } from './android-artifact-integrity-error';

type StableFileInvalidCode =
  | 'INVALID_APK_PATH'
  | 'INVALID_CHECKSUM_RECORD'
  | 'INVALID_ANDROID_VERSION_CODE';
type StableFileChangedCode =
  | 'ARTIFACT_CHANGED'
  | 'CHECKSUM_RECORD_CHANGED'
  | 'ANDROID_CONFIG_CHANGED';

export interface StableFileReadPolicy {
  readonly noFollowFlag: number | undefined;
  readonly symbolicLinkMessage: string;
  readonly invalidCode: StableFileInvalidCode;
  readonly invalidMessage: string;
  readonly changedCode: StableFileChangedCode;
  readonly changedMessage: string;
  readonly afterInitialLstat?: () => Promise<void>;
}

export interface FileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

export interface OpenedStableFile {
  readonly handle: FileHandle;
  readonly identity: FileIdentity;
}

function errorCode(error: unknown): unknown {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  return Reflect.get(error, 'code');
}

function invalidFileError(
  policy: StableFileReadPolicy
): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    policy.invalidCode,
    policy.invalidMessage
  );
}

function changedFileError(
  policy: StableFileReadPolicy
): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    policy.changedCode,
    policy.changedMessage
  );
}

function symbolicLinkError(
  policy: StableFileReadPolicy
): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    'SYMLINK_NOT_ALLOWED',
    policy.symbolicLinkMessage
  );
}

function fileIdentity(status: {
  readonly dev: bigint;
  readonly ino: bigint;
}): FileIdentity {
  return { device: status.dev, inode: status.ino };
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function usableFileIdentity(status: {
  readonly dev: bigint;
  readonly ino: bigint;
}): FileIdentity | null {
  const identity = fileIdentity(status);
  return identity.inode > 0n ? identity : null;
}

async function initialFileIdentity(
  path: string,
  policy: StableFileReadPolicy
): Promise<FileIdentity> {
  let status: Awaited<ReturnType<typeof lstat>>;
  try {
    status = await lstat(path, { bigint: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw invalidFileError(policy);
    throw error;
  }
  if (status.isSymbolicLink()) throw symbolicLinkError(policy);
  if (!status.isFile()) throw invalidFileError(policy);
  const identity = usableFileIdentity(status);
  if (identity === null) throw changedFileError(policy);
  return identity;
}

async function openCheckedPath(
  path: string,
  policy: StableFileReadPolicy
): Promise<FileHandle> {
  try {
    const flags =
      constants.O_RDONLY |
      (typeof policy.noFollowFlag === 'number' ? policy.noFollowFlag : 0);
    return await open(path, flags);
  } catch (error) {
    if (errorCode(error) === 'ELOOP') throw symbolicLinkError(policy);
    if (errorCode(error) === 'ENOENT') throw changedFileError(policy);
    throw error;
  }
}

export async function openStableFileForRead(
  path: string,
  policy: StableFileReadPolicy
): Promise<OpenedStableFile> {
  const beforeIdentity = await initialFileIdentity(path, policy);
  await policy.afterInitialLstat?.();
  const handle = await openCheckedPath(path, policy);

  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) throw changedFileError(policy);
    const openedIdentity = usableFileIdentity(opened);
    if (
      openedIdentity === null ||
      !sameFileIdentity(beforeIdentity, openedIdentity)
    ) {
      throw changedFileError(policy);
    }
    await assertOpenedFilePathUnchanged(path, openedIdentity, policy);
    return { handle, identity: openedIdentity };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function assertOpenedFilePathUnchanged(
  path: string,
  openedIdentity: FileIdentity,
  policy: StableFileReadPolicy
): Promise<void> {
  let currentStatus: Awaited<ReturnType<typeof lstat>>;
  try {
    currentStatus = await lstat(path, { bigint: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw changedFileError(policy);
    throw error;
  }
  if (!currentStatus.isFile()) throw changedFileError(policy);
  const currentIdentity = usableFileIdentity(currentStatus);
  if (
    currentIdentity === null ||
    !sameFileIdentity(openedIdentity, currentIdentity)
  ) {
    throw changedFileError(policy);
  }
}
