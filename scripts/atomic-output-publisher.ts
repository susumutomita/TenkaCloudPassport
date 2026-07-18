import { createHash } from 'node:crypto';
import { type BigIntStats, closeSync, fstatSync, readSync } from 'node:fs';
import path from 'node:path';

const PLATFORM_MODULES: Readonly<Record<string, string>> = {
  darwin: './atomic-output-publisher-darwin.ts',
  linux: './atomic-output-publisher-linux.ts',
};

export class AtomicOutputPublicationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_PUBLICATION_PATH'
      | 'UNSUPPORTED_PLATFORM'
      | 'ATOMIC_RENAME_FAILED'
      | 'ENTRY_READ_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'AtomicOutputPublicationError';
  }
}

export interface ExpectedPublishedDirectory {
  readonly device: number;
  readonly inode: number;
}

interface DescriptorRelativeFileSnapshot {
  readonly byteLength: number;
  readonly changeTimeNanoseconds: string;
  readonly device: number;
  readonly inode: number;
  readonly modificationTimeNanoseconds: string;
}

export interface DescriptorRelativeFileHash
  extends DescriptorRelativeFileSnapshot {
  readonly sha256: string;
}

export interface DescriptorRelativeFileIdentity
  extends DescriptorRelativeFileSnapshot {
  readonly fileName: string;
}

export interface DescriptorRelativeFileRead
  extends DescriptorRelativeFileSnapshot {
  readonly contents: Buffer;
}

interface NativeEntryFunctions {
  readonly openEntry: (...arguments_: readonly unknown[]) => unknown;
  readonly renameEntry: (...arguments_: readonly unknown[]) => unknown;
}

function isSafeBasename(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('\0') &&
    path.basename(value) === value
  );
}

function validateParentDescriptor(parentDescriptor: number): void {
  if (!Number.isInteger(parentDescriptor) || parentDescriptor < 0) {
    throw new AtomicOutputPublicationError(
      'INVALID_PUBLICATION_PATH',
      'Descriptor-relative operation requires one open parent directory.'
    );
  }
}

function validateDescriptorPublication(
  parentDescriptor: number,
  sourceName: string,
  destinationName: string,
  expectedDirectory: ExpectedPublishedDirectory
): void {
  validateParentDescriptor(parentDescriptor);
  if (
    !isSafeBasename(sourceName) ||
    !isSafeBasename(destinationName) ||
    sourceName === destinationName ||
    !Number.isInteger(expectedDirectory.device) ||
    expectedDirectory.device < 0 ||
    !Number.isInteger(expectedDirectory.inode) ||
    expectedDirectory.inode < 0
  ) {
    throw new AtomicOutputPublicationError(
      'INVALID_PUBLICATION_PATH',
      'Atomic publication requires one directory descriptor and distinct safe basenames.'
    );
  }
}

async function loadNativeEntryFunctions(
  platform: string
): Promise<NativeEntryFunctions> {
  const modulePath = Reflect.get(PLATFORM_MODULES, platform);
  if (typeof modulePath !== 'string') {
    throw new AtomicOutputPublicationError(
      'UNSUPPORTED_PLATFORM',
      'Descriptor-relative release operations are unsupported on this platform.'
    );
  }
  const nativeModule: unknown = await import(modulePath);
  const openEntry =
    nativeModule !== null && typeof nativeModule === 'object'
      ? Reflect.get(nativeModule, 'openEntryNoFollowNative')
      : undefined;
  const renameEntry =
    nativeModule !== null && typeof nativeModule === 'object'
      ? Reflect.get(nativeModule, 'renameEntryNoReplaceNative')
      : undefined;
  if (typeof openEntry !== 'function' || typeof renameEntry !== 'function') {
    throw new AtomicOutputPublicationError(
      'UNSUPPORTED_PLATFORM',
      'Descriptor-relative release operations could not be loaded.'
    );
  }
  return { openEntry, renameEntry };
}

function nativeRenameNoReplace(
  native: NativeEntryFunctions,
  parentDescriptor: number,
  sourceName: string,
  destinationName: string
): boolean {
  return (
    Reflect.apply(native.renameEntry, undefined, [
      parentDescriptor,
      sourceName,
      destinationName,
    ]) === true
  );
}

function nativeOpenEntry(
  native: NativeEntryFunctions,
  parentDescriptor: number,
  entryName: string,
  directoryOnly: boolean
): number {
  const descriptor: unknown = Reflect.apply(native.openEntry, undefined, [
    parentDescriptor,
    entryName,
    directoryOnly,
  ]);
  return typeof descriptor === 'number' && Number.isInteger(descriptor)
    ? descriptor
    : -1;
}

export async function atomicRenameDirectoryNoReplace(
  parentDescriptor: number,
  sourceName: string,
  destinationName: string,
  expectedDirectory: ExpectedPublishedDirectory,
  platform: string = process.platform
): Promise<void> {
  validateDescriptorPublication(
    parentDescriptor,
    sourceName,
    destinationName,
    expectedDirectory
  );
  const native = await loadNativeEntryFunctions(platform);
  if (
    !nativeRenameNoReplace(
      native,
      parentDescriptor,
      sourceName,
      destinationName
    )
  ) {
    throw new AtomicOutputPublicationError(
      'ATOMIC_RENAME_FAILED',
      'Atomic no-replace directory publication failed.'
    );
  }
  let publishedDescriptor = -1;
  try {
    publishedDescriptor = nativeOpenEntry(
      native,
      parentDescriptor,
      destinationName,
      true
    );
    const publishedStatus = fstatSync(publishedDescriptor);
    if (
      !publishedStatus.isDirectory() ||
      publishedStatus.dev !== expectedDirectory.device ||
      publishedStatus.ino !== expectedDirectory.inode
    ) {
      throw new AtomicOutputPublicationError(
        'ATOMIC_RENAME_FAILED',
        'Atomically published directory identity changed.'
      );
    }
  } catch (error) {
    const rolledBack = nativeRenameNoReplace(
      native,
      parentDescriptor,
      destinationName,
      sourceName
    );
    if (!rolledBack) {
      throw new AtomicOutputPublicationError(
        'ATOMIC_RENAME_FAILED',
        'Atomic publication validation failed and Output rollback was not possible.'
      );
    }
    if (error instanceof AtomicOutputPublicationError) throw error;
    throw new AtomicOutputPublicationError(
      'ATOMIC_RENAME_FAILED',
      'Atomically published directory could not be inspected.'
    );
  } finally {
    if (publishedDescriptor >= 0) closeSync(publishedDescriptor);
  }
}

export async function readRegularFileNoFollowAt(
  parentDescriptor: number,
  fileName: string,
  maximumBytes: number,
  platform: string = process.platform
): Promise<Buffer> {
  return (
    await readRegularFileNoFollowAtWithIdentity(
      parentDescriptor,
      fileName,
      maximumBytes,
      platform
    )
  ).contents;
}

export async function readRegularFileNoFollowAtWithIdentity(
  parentDescriptor: number,
  fileName: string,
  maximumBytes: number,
  platform: string = process.platform
): Promise<DescriptorRelativeFileRead> {
  const { before, descriptor } = await openBoundedRegularFileNoFollowAt(
    parentDescriptor,
    fileName,
    maximumBytes,
    platform
  );
  try {
    const contents = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < contents.byteLength) {
      const bytesRead = readSync(
        descriptor,
        contents,
        offset,
        contents.byteLength - offset,
        offset
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (
      !sameOpenFileSnapshot(before, after) ||
      offset !== contents.byteLength
    ) {
      throw new AtomicOutputPublicationError(
        'ENTRY_READ_FAILED',
        'Release candidate entry identity changed while reading.'
      );
    }
    return {
      ...fileSnapshot(before),
      contents,
    };
  } finally {
    closeSync(descriptor);
  }
}

async function openBoundedRegularFileNoFollowAt(
  parentDescriptor: number,
  fileName: string,
  maximumBytes: number,
  platform: string
): Promise<{ readonly before: BigIntStats; readonly descriptor: number }> {
  validateParentDescriptor(parentDescriptor);
  if (
    !isSafeBasename(fileName) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0
  ) {
    throw new AtomicOutputPublicationError(
      'INVALID_PUBLICATION_PATH',
      'Descriptor-relative read requires one safe file basename.'
    );
  }
  const native = await loadNativeEntryFunctions(platform);
  const descriptor = nativeOpenEntry(native, parentDescriptor, fileName, false);
  if (descriptor < 0) {
    throw new AtomicOutputPublicationError(
      'ENTRY_READ_FAILED',
      'Release candidate entry could not be opened safely.'
    );
  }
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size < 0n ||
      before.size > BigInt(maximumBytes)
    ) {
      throw new AtomicOutputPublicationError(
        'ENTRY_READ_FAILED',
        'Release candidate entry is not one bounded regular file.'
      );
    }
    return { before, descriptor };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

export async function hashRegularFileNoFollowAt(
  parentDescriptor: number,
  fileName: string,
  maximumBytes: number,
  platform: string = process.platform
): Promise<DescriptorRelativeFileHash> {
  const { before, descriptor } = await openBoundedRegularFileNoFollowAt(
    parentDescriptor,
    fileName,
    maximumBytes,
    platform
  );
  try {
    const hash = createHash('sha256');
    let byteLength = 0;
    const expectedBytes = Number(before.size);
    const chunk = Buffer.alloc(64 * 1024);
    while (byteLength < expectedBytes) {
      const bytesRead = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.byteLength, expectedBytes - byteLength),
        byteLength
      );
      if (bytesRead === 0) break;
      hash.update(chunk.subarray(0, bytesRead));
      byteLength += bytesRead;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameOpenFileSnapshot(before, after) || byteLength !== expectedBytes) {
      throw new AtomicOutputPublicationError(
        'ENTRY_READ_FAILED',
        'Release candidate entry identity changed while hashing.'
      );
    }
    return {
      ...fileSnapshot(before),
      sha256: hash.digest('hex'),
    };
  } finally {
    closeSync(descriptor);
  }
}

function sameOpenFileSnapshot(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs
  );
}

function fileSnapshot(status: BigIntStats): DescriptorRelativeFileSnapshot {
  return {
    byteLength: Number(status.size),
    changeTimeNanoseconds: status.ctimeNs.toString(),
    device: Number(status.dev),
    inode: Number(status.ino),
    modificationTimeNanoseconds: status.mtimeNs.toString(),
  };
}

export async function assertRegularFileIdentitiesNoFollowAt(
  parentDescriptor: number,
  expectedFiles: readonly DescriptorRelativeFileIdentity[],
  platform: string = process.platform
): Promise<void> {
  validateParentDescriptor(parentDescriptor);
  if (
    expectedFiles.length === 0 ||
    expectedFiles.some(
      ({
        byteLength,
        changeTimeNanoseconds,
        device,
        fileName,
        inode,
        modificationTimeNanoseconds,
      }) =>
        !isSafeBasename(fileName) ||
        !Number.isSafeInteger(byteLength) ||
        byteLength < 0 ||
        !/^\d+$/.test(changeTimeNanoseconds) ||
        !Number.isInteger(device) ||
        device < 0 ||
        !Number.isInteger(inode) ||
        inode < 0 ||
        !/^\d+$/.test(modificationTimeNanoseconds)
    )
  ) {
    throw new AtomicOutputPublicationError(
      'INVALID_PUBLICATION_PATH',
      'Descriptor-relative identity verification requires safe regular files.'
    );
  }
  const native = await loadNativeEntryFunctions(platform);
  const descriptors: number[] = [];
  try {
    for (const expected of expectedFiles) {
      const descriptor = nativeOpenEntry(
        native,
        parentDescriptor,
        expected.fileName,
        false
      );
      if (descriptor < 0) {
        throw new AtomicOutputPublicationError(
          'ENTRY_READ_FAILED',
          'Release candidate entry could not be rebound safely.'
        );
      }
      descriptors.push(descriptor);
      const status = fstatSync(descriptor, { bigint: true });
      if (
        !status.isFile() ||
        status.isSymbolicLink() ||
        Number(status.dev) !== expected.device ||
        Number(status.ino) !== expected.inode ||
        status.size !== BigInt(expected.byteLength) ||
        status.ctimeNs.toString() !== expected.changeTimeNanoseconds ||
        status.mtimeNs.toString() !== expected.modificationTimeNanoseconds
      ) {
        throw new AtomicOutputPublicationError(
          'ENTRY_READ_FAILED',
          'Release candidate entry no longer names the verified file.'
        );
      }
    }
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
}
