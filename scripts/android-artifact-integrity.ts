import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  assertOpenedFilePathUnchanged,
  openStableFileForRead,
  type StableFileReadPolicy,
} from './android-artifact-file-guard';
import { AndroidArtifactIntegrityError } from './android-artifact-integrity-error';

export {
  AndroidArtifactIntegrityError,
  type AndroidArtifactIntegrityErrorCode,
} from './android-artifact-integrity-error';

export interface AndroidArtifactIntegrityResult {
  readonly apkFileName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly checksumPath: string;
}

const SAFE_APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/;
const CHECKSUM_RECORD =
  /^([0-9a-f]{64}) {2}([A-Za-z0-9][A-Za-z0-9._-]*\.apk)\n$/;
const MAX_CHECKSUM_RECORD_BYTES = 512;
const MAX_APP_CONFIG_BYTES = 128 * 1024;
const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const INVALID_ANDROID_VERSION_CODE_MESSAGE =
  'Expo app config must contain a positive integer Android versionCode.';
const INVALID_PREVIOUS_VERSION_CODE_MESSAGE =
  'Previous Android versionCode must be a non-negative integer.';

interface FileSnapshot {
  readonly device: bigint;
  readonly inode: bigint;
  readonly size: bigint;
  readonly modifiedAtNanoseconds: bigint;
  readonly changedAtNanoseconds: bigint;
}

function fileSnapshot(status: {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}): FileSnapshot {
  return {
    device: status.dev,
    inode: status.ino,
    size: status.size,
    modifiedAtNanoseconds: status.mtimeNs,
    changedAtNanoseconds: status.ctimeNs,
  };
}

function sameFileSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedAtNanoseconds === right.modifiedAtNanoseconds &&
    left.changedAtNanoseconds === right.changedAtNanoseconds
  );
}

function errorCode(error: unknown): unknown {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  return Reflect.get(error, 'code');
}

function isFileNotFound(error: unknown): boolean {
  return errorCode(error) === 'ENOENT';
}

async function discardTemporaryFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
  }
}

async function hashArtifact(
  path: string
): Promise<{ readonly byteLength: number; readonly sha256: string }> {
  const fileName = basename(path);
  if (!SAFE_APK_NAME.test(fileName)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_APK_PATH',
      'Android release artifact must use a safe .apk file name.'
    );
  }
  const policy: StableFileReadPolicy = {
    noFollowFlag: constants.O_NOFOLLOW,
    symbolicLinkMessage:
      'Android release artifact must not be a symbolic link.',
    invalidCode: 'INVALID_APK_PATH',
    invalidMessage: 'Android release artifact must be a regular .apk file.',
    changedCode: 'ARTIFACT_CHANGED',
    changedMessage: 'Android release artifact changed while it was being read.',
  };
  const { handle, identity } = await openStableFileForRead(path, policy);
  try {
    const status = await handle.stat({ bigint: true });
    if (status.size === 0n) {
      throw new AndroidArtifactIntegrityError(
        'EMPTY_ARTIFACT',
        'Android release artifact must not be empty.'
      );
    }

    if (status.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AndroidArtifactIntegrityError(
        'INVALID_APK_PATH',
        'Android release artifact is too large to verify safely.'
      );
    }

    const before = fileSnapshot(status);
    const hash = createHash('sha256');
    let byteLength = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      byteLength += chunk.length;
    }
    const after = fileSnapshot(await handle.stat({ bigint: true }));
    if (
      BigInt(byteLength) !== status.size ||
      !sameFileSnapshot(before, after)
    ) {
      throw new AndroidArtifactIntegrityError(
        policy.changedCode,
        policy.changedMessage
      );
    }
    await assertOpenedFilePathUnchanged(path, identity, policy);
    return { byteLength, sha256: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}

async function readBoundedStableTextFile(
  path: string,
  maximumBytes: number,
  symbolicLinkMessage: string,
  invalidCode: 'INVALID_CHECKSUM_RECORD' | 'INVALID_ANDROID_VERSION_CODE',
  invalidMessage: string,
  changedCode: 'CHECKSUM_RECORD_CHANGED' | 'ANDROID_CONFIG_CHANGED',
  changedMessage: string
): Promise<string> {
  const policy: StableFileReadPolicy = {
    noFollowFlag: constants.O_NOFOLLOW,
    symbolicLinkMessage,
    invalidCode,
    invalidMessage,
    changedCode,
    changedMessage,
  };
  const { handle, identity } = await openStableFileForRead(path, policy);
  try {
    const status = await handle.stat({ bigint: true });
    if (status.size > BigInt(maximumBytes)) {
      throw new AndroidArtifactIntegrityError(invalidCode, invalidMessage);
    }
    const before = fileSnapshot(status);
    const expectedBytes = Number(status.size);
    const contents = Buffer.alloc(expectedBytes);
    let bytesRead = 0;
    while (bytesRead < expectedBytes) {
      const result = await handle.read(
        contents,
        bytesRead,
        expectedBytes - bytesRead,
        bytesRead
      );
      if (result.bytesRead === 0) {
        throw new AndroidArtifactIntegrityError(changedCode, changedMessage);
      }
      bytesRead += result.bytesRead;
    }
    const after = fileSnapshot(await handle.stat({ bigint: true }));
    if (!sameFileSnapshot(before, after)) {
      throw new AndroidArtifactIntegrityError(changedCode, changedMessage);
    }
    await assertOpenedFilePathUnchanged(path, identity, policy);
    return contents.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

async function readChecksumFile(path: string): Promise<string> {
  return readBoundedStableTextFile(
    path,
    MAX_CHECKSUM_RECORD_BYTES,
    'Android checksum record must not be a symbolic link.',
    'INVALID_CHECKSUM_RECORD',
    'Android artifact checksum record is invalid.',
    'CHECKSUM_RECORD_CHANGED',
    'Android checksum record changed while it was being read.'
  );
}

function property(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Reflect.get(value, key);
}

export async function readAndroidReleaseVersionCode(
  appConfigPath: string
): Promise<number> {
  const rawConfig = await readBoundedStableTextFile(
    appConfigPath,
    MAX_APP_CONFIG_BYTES,
    'Expo app config must not be a symbolic link.',
    'INVALID_ANDROID_VERSION_CODE',
    INVALID_ANDROID_VERSION_CODE_MESSAGE,
    'ANDROID_CONFIG_CHANGED',
    'Expo app config changed while it was being read.'
  );
  let config: unknown;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_VERSION_CODE',
      INVALID_ANDROID_VERSION_CODE_MESSAGE
    );
  }
  const versionCode = property(
    property(property(config, 'expo'), 'android'),
    'versionCode'
  );
  if (
    typeof versionCode !== 'number' ||
    !Number.isSafeInteger(versionCode) ||
    versionCode <= 0
  ) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_VERSION_CODE',
      INVALID_ANDROID_VERSION_CODE_MESSAGE
    );
  }
  return versionCode;
}

export function assertAndroidReleaseVersionIncrement(
  versionCode: number,
  previousVersionCode: number
): number {
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_VERSION_CODE',
      INVALID_ANDROID_VERSION_CODE_MESSAGE
    );
  }
  if (!Number.isSafeInteger(previousVersionCode) || previousVersionCode < 0) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_PREVIOUS_VERSION_CODE',
      INVALID_PREVIOUS_VERSION_CODE_MESSAGE
    );
  }
  if (versionCode <= previousVersionCode) {
    throw new AndroidArtifactIntegrityError(
      'VERSION_CODE_NOT_INCREMENTED',
      'Android versionCode must be greater than the previous release.'
    );
  }
  return versionCode;
}

function parsePreviousVersionCode(value: string): number {
  if (!CANONICAL_NON_NEGATIVE_INTEGER.test(value)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_PREVIOUS_VERSION_CODE',
      INVALID_PREVIOUS_VERSION_CODE_MESSAGE
    );
  }
  const versionCode = Number(value);
  if (!Number.isSafeInteger(versionCode)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_PREVIOUS_VERSION_CODE',
      INVALID_PREVIOUS_VERSION_CODE_MESSAGE
    );
  }
  return versionCode;
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error) {
    await discardTemporaryFile(temporaryPath);
    throw error;
  }
}

function parseChecksumRecord(record: string, expectedFileName: string): string {
  const match = CHECKSUM_RECORD.exec(record);
  if (match === null) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_CHECKSUM_RECORD',
      'Android artifact checksum record is invalid.'
    );
  }
  const [, sha256, fileName] = match;
  if (fileName !== expectedFileName) {
    throw new AndroidArtifactIntegrityError(
      'ARTIFACT_NAME_MISMATCH',
      'Android artifact name does not match the checksum record.'
    );
  }
  return sha256;
}

export async function createAndroidArtifactChecksum(
  apkPath: string
): Promise<AndroidArtifactIntegrityResult> {
  const apkFileName = basename(apkPath);
  const { byteLength, sha256 } = await hashArtifact(apkPath);
  const checksumPath = `${apkPath}.sha256`;
  await atomicWrite(checksumPath, `${sha256}  ${apkFileName}\n`);
  return { apkFileName, byteLength, sha256, checksumPath };
}

export async function verifyAndroidArtifactChecksum(
  apkPath: string,
  checksumPath: string
): Promise<AndroidArtifactIntegrityResult> {
  const apkFileName = basename(apkPath);
  const expectedSha256 = parseChecksumRecord(
    await readChecksumFile(checksumPath),
    apkFileName
  );
  const { byteLength, sha256 } = await hashArtifact(apkPath);
  if (sha256 !== expectedSha256) {
    throw new AndroidArtifactIntegrityError(
      'CHECKSUM_MISMATCH',
      'Android artifact SHA-256 does not match the checksum record.'
    );
  }
  return { apkFileName, byteLength, sha256, checksumPath };
}

async function runCli(arguments_: readonly string[]): Promise<void> {
  const [command, firstPath, secondArgument] = arguments_;
  if (
    command === 'write' &&
    firstPath !== undefined &&
    secondArgument === undefined
  ) {
    const result = await createAndroidArtifactChecksum(firstPath);
    console.log(`${result.sha256}  ${result.apkFileName}`);
    return;
  }
  if (
    command === 'verify' &&
    firstPath !== undefined &&
    secondArgument !== undefined &&
    arguments_.length === 3
  ) {
    const result = await verifyAndroidArtifactChecksum(
      firstPath,
      secondArgument
    );
    console.log(`verified ${result.sha256}  ${result.apkFileName}`);
    return;
  }
  if (
    command === 'version' &&
    firstPath !== undefined &&
    secondArgument !== undefined &&
    arguments_.length === 3
  ) {
    const previousVersionCode = parsePreviousVersionCode(secondArgument);
    const versionCode = assertAndroidReleaseVersionIncrement(
      await readAndroidReleaseVersionCode(firstPath),
      previousVersionCode
    );
    console.log(
      `verified Android versionCode ${versionCode} > ${previousVersionCode}`
    );
    return;
  }
  throw new AndroidArtifactIntegrityError(
    'INVALID_COMMAND',
    'Usage: version <app-json> <previous-version-code> | write <apk> | verify <apk> <checksum-file>'
  );
}

if (import.meta.main) {
  try {
    await runCli(Bun.argv.slice(2));
  } catch (error) {
    if (error instanceof AndroidArtifactIntegrityError) {
      console.error(`${error.code}: ${error.message}`);
    } else {
      console.error('UNEXPECTED_ERROR: Android artifact verification failed.');
    }
    process.exitCode = 1;
  }
}
