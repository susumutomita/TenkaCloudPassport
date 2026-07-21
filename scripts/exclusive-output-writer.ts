import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  createWriteStream,
  fchmodSync,
  fstatSync,
  fsyncSync,
  openSync,
} from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openEntryExclusiveNative as openDarwinEntryExclusive } from './atomic-output-publisher-darwin';
import { openEntryExclusiveNative as openLinuxEntryExclusive } from './atomic-output-publisher-linux';
import { isolatedGitEnv } from './git-env-isolation';
import { runProcessStdoutIntoSink } from './process-capture';

export interface ExclusiveOutputRecord {
  readonly byteLength: number;
  readonly changeTimeNanoseconds: string;
  readonly device: number;
  readonly fileName: string;
  readonly inode: number;
  readonly modificationTimeNanoseconds: string;
  readonly sha256: string;
}

type ExclusiveEntryOpener = (
  parentDescriptor: number,
  fileName: string,
  mode: number
) => number;

const PLATFORM_OPENERS: Readonly<Record<string, ExclusiveEntryOpener>> = {
  darwin: openDarwinEntryExclusive,
  linux: openLinuxEntryExclusive,
};

export function openExclusiveEntryAt(
  parentDescriptor: number,
  fileName: string,
  platform: string = process.platform
): number {
  const openEntry = Reflect.get(PLATFORM_OPENERS, platform);
  if (typeof openEntry !== 'function') {
    throw new Error('Exclusive output writer is unsupported on this platform.');
  }
  const descriptor = openEntry(parentDescriptor, fileName, 0);
  if (descriptor < 0) {
    throw new Error('Exclusive output file could not be created.');
  }
  return descriptor;
}

function parseIdentity(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Invalid output directory identity.');
  }
  return parsed;
}

export function assertWrittenOutputSnapshot(
  isRegularFile: boolean,
  actualByteLength: bigint,
  expectedByteLength: number
): void {
  if (!isRegularFile || actualByteLength !== BigInt(expectedByteLength)) {
    throw new Error('Output file identity changed while writing.');
  }
}

export async function writeExclusiveOutput(
  arguments_: readonly string[],
  standardInput: ReadableStream<Uint8Array>,
  workingDirectory: string
): Promise<ExclusiveOutputRecord> {
  const [fileName, deviceSource, inodeSource, separator, ...command] =
    arguments_;
  if (
    fileName === undefined ||
    fileName.length === 0 ||
    path.basename(fileName) !== fileName ||
    separator !== '--'
  ) {
    throw new Error('Invalid exclusive output writer arguments.');
  }
  const expectedDevice = parseIdentity(deviceSource);
  const expectedInode = parseIdentity(inodeSource);
  const cwdStatus = await lstat(workingDirectory);
  let parentDescriptor = -1;
  let descriptor = -1;
  try {
    parentDescriptor = openSync(
      workingDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const parentStatus = fstatSync(parentDescriptor);
    if (
      !cwdStatus.isDirectory() ||
      cwdStatus.isSymbolicLink() ||
      cwdStatus.dev !== expectedDevice ||
      cwdStatus.ino !== expectedInode ||
      !parentStatus.isDirectory() ||
      parentStatus.dev !== expectedDevice ||
      parentStatus.ino !== expectedInode
    ) {
      throw new Error('Output directory identity changed before writing.');
    }
    descriptor = openExclusiveEntryAt(parentDescriptor, fileName);
    fchmodSync(descriptor, 0o600);
    const output = createWriteStream(fileName, {
      fd: descriptor,
      autoClose: false,
    });
    const hash = createHash('sha256');
    let byteLength = 0;
    const hashingStream = new PassThrough();
    hashingStream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      byteLength += chunk.byteLength;
    });
    if (command.length === 0) {
      await pipeline(Readable.from(standardInput), hashingStream, output);
    } else {
      // `command` is `git show <commit>:<path>` in every current caller
      // (`source-release.ts`). Stripping GIT_DIR-family vars keeps this
      // scoped to `cwd` even when the parent process inherited them from
      // an active git hook invocation; it is a no-op for non-git commands,
      // so this is safe even though this module itself is generic (see
      // `git-env-isolation.ts` for why this matters).
      const { exitCode, stderr } = await runProcessStdoutIntoSink(
        command,
        async (stdout) => {
          await pipeline(stdout, hashingStream, output);
        },
        { cwd: workingDirectory, env: isolatedGitEnv() }
      );
      if (exitCode !== 0) {
        throw new Error(`Output source command failed: ${stderr.trim()}`);
      }
    }
    fsyncSync(descriptor);
    const status = fstatSync(descriptor, { bigint: true });
    assertWrittenOutputSnapshot(status.isFile(), status.size, byteLength);
    return {
      byteLength,
      changeTimeNanoseconds: status.ctimeNs.toString(),
      device: Number(status.dev),
      fileName,
      inode: Number(status.ino),
      modificationTimeNanoseconds: status.mtimeNs.toString(),
      sha256: hash.digest('hex'),
    };
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
    if (parentDescriptor >= 0) closeSync(parentDescriptor);
  }
}
