import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  realpath,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  copyStableFile,
  digestStableFile,
  type StableFileReadPolicy,
} from './android-artifact-file-guard';
import {
  AndroidArtifactIntegrityError,
  reportAndroidArtifactCliFailure,
} from './android-artifact-integrity-error';

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_TOOLCHAIN_ENTRIES = 16_384;
const MAX_TOOLCHAIN_BYTES = 4n * 1024n * 1024n * 1024n;
const MAX_TOOLCHAIN_DEPTH = 32;

interface TreeState {
  byteLength: bigint;
  entryCount: number;
  fileCount: number;
}

interface DirectorySnapshot {
  readonly changedAtNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly modifiedAtNanoseconds: bigint;
}

export interface ToolchainFingerprint {
  readonly byteLength: bigint;
  readonly fileCount: number;
  readonly sha256: string;
}

export interface ApprovedToolchainSnapshot {
  readonly fingerprint: ToolchainFingerprint;
  readonly root: string;
  readonly dispose: () => Promise<void>;
}

function toolchainError(message: string): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    'INVALID_ANDROID_TOOL_PATH',
    message
  );
}

function directorySnapshot(status: BigIntStats): DirectorySnapshot {
  return {
    changedAtNanoseconds: status.ctimeNs,
    device: status.dev,
    inode: status.ino,
    modifiedAtNanoseconds: status.mtimeNs,
  };
}

function sameDirectorySnapshot(
  left: DirectorySnapshot,
  right: DirectorySnapshot
): boolean {
  return (
    left.changedAtNanoseconds === right.changedAtNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.modifiedAtNanoseconds === right.modifiedAtNanoseconds
  );
}

function stableToolchainFilePolicy(): StableFileReadPolicy {
  return {
    noFollowFlag: constants.O_NOFOLLOW,
    symbolicLinkMessage:
      'Android verifier dependency must not be a symbolic link.',
    invalidCode: 'INVALID_ANDROID_TOOL_PATH',
    invalidMessage: 'Android verifier dependency must be a regular file.',
    changedCode: 'ANDROID_TOOL_FAILED',
    changedMessage:
      'Android verifier dependency changed while it was verified.',
  };
}

async function hashStableFile(
  path: string,
  remainingBytes: bigint
): Promise<{ readonly byteLength: bigint; readonly sha256: string }> {
  return digestStableFile(path, stableToolchainFilePolicy(), (size) => {
    if (size > remainingBytes) {
      throw toolchainError(
        'Android verifier toolchain exceeds the 4 GiB byte limit.'
      );
    }
  });
}

async function boundedEntryNames(
  directory: string,
  state: TreeState
): Promise<string[]> {
  const names: string[] = [];
  const handle = await opendir(directory);
  for await (const entry of handle) {
    state.entryCount += 1;
    if (state.entryCount > MAX_TOOLCHAIN_ENTRIES) {
      throw toolchainError(
        'Android verifier toolchain exceeds the entry-count limit.'
      );
    }
    names.push(entry.name);
  }
  names.sort((left, right) => (left < right ? -1 : Number(left > right)));
  return names;
}

interface ToolchainTreeEntry {
  readonly path: string;
  readonly relativePath: string;
  readonly status: BigIntStats;
}

interface ToolchainTreeVisitor {
  readonly changedMessage: string;
  readonly enterDirectory: (entry: ToolchainTreeEntry) => Promise<void>;
  readonly leaveDirectory: (entry: ToolchainTreeEntry) => Promise<void>;
  readonly visitFile: (
    entry: ToolchainTreeEntry,
    remainingBytes: bigint
  ) => Promise<bigint>;
}

function assertEntryInsideRoot(root: string, path: string): string {
  const relativePath = relative(root, path);
  if (
    relativePath === '' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw toolchainError(
      'Android verifier dependency escaped the approved root.'
    );
  }
  return relativePath;
}

async function walkToolchainEntry(
  root: string,
  directory: string,
  name: string,
  depth: number,
  state: TreeState,
  visitor: ToolchainTreeVisitor
): Promise<void> {
  const path = resolve(directory, name);
  const relativePath = assertEntryInsideRoot(root, path);
  const status = await lstat(path, { bigint: true });
  const entry: ToolchainTreeEntry = { path, relativePath, status };
  if (status.isSymbolicLink()) {
    throw toolchainError(
      'Android verifier toolchain must not contain symbolic links.'
    );
  }
  if (status.isDirectory()) {
    await visitor.enterDirectory(entry);
    await walkStableToolchain(root, path, depth + 1, state, visitor);
    await visitor.leaveDirectory(entry);
    return;
  }
  if (!status.isFile()) {
    throw toolchainError(
      'Android verifier toolchain must contain only regular files and directories.'
    );
  }
  const remainingBytes = MAX_TOOLCHAIN_BYTES - state.byteLength;
  if (status.size > remainingBytes) {
    throw toolchainError(
      'Android verifier toolchain exceeds the 4 GiB byte limit.'
    );
  }
  const byteLength = await visitor.visitFile(entry, remainingBytes);
  if (byteLength > remainingBytes) {
    throw toolchainError(
      'Android verifier toolchain exceeds the 4 GiB byte limit.'
    );
  }
  state.byteLength += byteLength;
  state.fileCount += 1;
}

async function walkStableToolchain(
  root: string,
  directory: string,
  depth: number,
  state: TreeState,
  visitor: ToolchainTreeVisitor
): Promise<void> {
  if (depth > MAX_TOOLCHAIN_DEPTH) {
    throw toolchainError(
      'Android verifier toolchain exceeds the directory depth limit.'
    );
  }
  const beforeStatus = await lstat(directory, { bigint: true });
  if (beforeStatus.isSymbolicLink() || !beforeStatus.isDirectory()) {
    throw toolchainError(
      'Android verifier toolchain must contain only regular files and directories.'
    );
  }
  const before = directorySnapshot(beforeStatus);
  for (const name of await boundedEntryNames(directory, state)) {
    await walkToolchainEntry(root, directory, name, depth, state, visitor);
  }
  const afterStatus = await lstat(directory, { bigint: true });
  if (!sameDirectorySnapshot(before, directorySnapshot(afterStatus))) {
    throw new AndroidArtifactIntegrityError(
      'ANDROID_TOOL_FAILED',
      visitor.changedMessage
    );
  }
}

function fingerprintVisitor(
  hash: ReturnType<typeof createHash>
): ToolchainTreeVisitor {
  return {
    changedMessage:
      'Android verifier toolchain changed while it was fingerprinted.',
    enterDirectory: async (entry) => {
      hash.update(`D\0${entry.relativePath.split(sep).join('/')}\0`);
    },
    leaveDirectory: () => Promise.resolve(),
    visitFile: async (entry, remainingBytes) => {
      const file = await hashStableFile(entry.path, remainingBytes);
      hash.update(
        `F\0${entry.relativePath.split(sep).join('/')}\0${file.byteLength.toString()}\0${file.sha256}\0`
      );
      return file.byteLength;
    },
  };
}

export async function fingerprintToolchainDirectory(
  root: string
): Promise<ToolchainFingerprint> {
  if (
    !isAbsolute(root) ||
    resolve(root) !== root ||
    (await realpath(root)) !== root
  ) {
    throw toolchainError(
      'Android verifier toolchain root must be a canonical absolute directory.'
    );
  }
  const hash = createHash('sha256');
  const state: TreeState = { byteLength: 0n, entryCount: 0, fileCount: 0 };
  await walkStableToolchain(root, root, 0, state, fingerprintVisitor(hash));
  if (state.fileCount === 0) {
    throw toolchainError('Android verifier toolchain must not be empty.');
  }
  return {
    byteLength: state.byteLength,
    fileCount: state.fileCount,
    sha256: hash.digest('hex'),
  };
}

function snapshotFileMode(status: BigIntStats): number {
  return (status.mode & 0o111n) === 0n ? 0o400 : 0o500;
}

function snapshotVisitor(destinationRoot: string): ToolchainTreeVisitor {
  return {
    changedMessage:
      'Android verifier toolchain changed while its private snapshot was created.',
    enterDirectory: async (entry) => {
      await mkdir(resolve(destinationRoot, entry.relativePath), {
        mode: 0o700,
      });
    },
    leaveDirectory: async (entry) => {
      await chmod(resolve(destinationRoot, entry.relativePath), 0o500);
    },
    visitFile: async (entry, remainingBytes) => {
      const destinationPath = resolve(destinationRoot, entry.relativePath);
      const copied = await copyStableFile(
        entry.path,
        destinationPath,
        stableToolchainFilePolicy(),
        snapshotFileMode(entry.status),
        (size) => {
          if (size > remainingBytes) {
            throw toolchainError(
              'Android verifier toolchain exceeds the 4 GiB byte limit.'
            );
          }
        }
      );
      return copied.byteLength;
    },
  };
}

async function discardSnapshotTree(directory: string): Promise<void> {
  await chmod(directory, 0o700);
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await discardSnapshotTree(path);
      await rmdir(path);
    } else {
      await unlink(path);
    }
  }
}

export async function createApprovedToolchainSnapshot(
  sourceRoot: string,
  expectedSha256: string
): Promise<ApprovedToolchainSnapshot> {
  if (!SHA256.test(expectedSha256)) {
    throw toolchainError(
      'Approved Android verifier toolchain SHA-256 is invalid.'
    );
  }
  if (
    !isAbsolute(sourceRoot) ||
    resolve(sourceRoot) !== sourceRoot ||
    (await realpath(sourceRoot)) !== sourceRoot
  ) {
    throw toolchainError(
      'Android verifier toolchain root must be a canonical absolute directory.'
    );
  }
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'tenka-android-toolchain-snapshot-'))
  );
  const root = join(directory, 'root');
  await mkdir(root, { mode: 0o700 });
  let completed = false;
  try {
    const state: TreeState = { byteLength: 0n, entryCount: 0, fileCount: 0 };
    await walkStableToolchain(
      sourceRoot,
      sourceRoot,
      0,
      state,
      snapshotVisitor(root)
    );
    if (state.fileCount === 0) {
      throw toolchainError('Android verifier toolchain must not be empty.');
    }
    await chmod(root, 0o500);
    const fingerprint = await assertApprovedToolchainDirectory(
      root,
      expectedSha256
    );
    await chmod(directory, 0o500);
    let disposed = false;
    completed = true;
    return {
      fingerprint,
      root,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await chmod(directory, 0o700);
        await discardSnapshotTree(root);
        await rmdir(root);
        await rmdir(directory);
      },
    };
  } finally {
    if (!completed) {
      await discardSnapshotTree(root);
      await rmdir(root);
      await rmdir(directory);
    }
  }
}

export async function assertApprovedToolchainDirectory(
  root: string,
  expectedSha256: string
): Promise<ToolchainFingerprint> {
  if (!SHA256.test(expectedSha256)) {
    throw toolchainError(
      'Approved Android verifier toolchain SHA-256 is invalid.'
    );
  }
  const fingerprint = await fingerprintToolchainDirectory(root);
  if (fingerprint.sha256 !== expectedSha256) {
    throw toolchainError(
      'Android verifier toolchain does not match the approved fingerprint.'
    );
  }
  return fingerprint;
}

export async function assertCanonicalToolchainFile(
  root: string,
  path: string,
  executable: boolean
): Promise<void> {
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    (await realpath(path)) !== path
  ) {
    throw toolchainError(
      'Android verifier dependency path must be canonical and absolute.'
    );
  }
  const relativePath = relative(root, path);
  if (
    relativePath === '' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw toolchainError(
      'Android verifier dependency must stay inside its approved root.'
    );
  }
  const status = await lstat(path, { bigint: true });
  if (status.isSymbolicLink() || !status.isFile()) {
    throw toolchainError('Android verifier dependency must be a regular file.');
  }
  if (executable) await access(path, constants.X_OK);
}

async function runCli(arguments_: readonly string[]): Promise<void> {
  if (arguments_.length !== 2 || arguments_[0] !== 'fingerprint') {
    throw new AndroidArtifactIntegrityError(
      'INVALID_COMMAND',
      'Usage: fingerprint <canonical-toolchain-root>'
    );
  }
  const root = arguments_[1];
  if (root === undefined || root === '') {
    throw new AndroidArtifactIntegrityError(
      'INVALID_COMMAND',
      'Usage: fingerprint <canonical-toolchain-root>'
    );
  }
  const result = await fingerprintToolchainDirectory(root);
  console.log(`${result.sha256}  ${root}`);
}

if (import.meta.main) {
  try {
    await runCli(Bun.argv.slice(2));
  } catch (error) {
    reportAndroidArtifactCliFailure(
      error,
      'Android verifier toolchain fingerprint failed.'
    );
  }
}
