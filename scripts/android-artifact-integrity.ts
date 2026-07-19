import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  mkdtemp,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  assertOpenedFilePathUnchanged,
  copyStableFile,
  digestStableFile,
  openStableFileForRead,
  type StableFileReadPolicy,
  sameStableFileSnapshot,
  stableFileSnapshot,
} from './android-artifact-file-guard';
import {
  AndroidArtifactIntegrityError,
  reportAndroidArtifactCliFailure,
} from './android-artifact-integrity-error';

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

export interface AndroidArtifactSnapshot {
  readonly apkFileName: string;
  readonly byteLength: number;
  readonly path: string;
  readonly sha256: string;
  readonly dispose: () => Promise<void>;
}

export interface AndroidReleaseAppIdentity {
  readonly packageId: string;
  readonly versionCode: number;
}

export interface AndroidArtifactIntegrityHooks {
  readonly afterChecksumPublished?: () => Promise<void>;
  readonly afterInitialChecksumRead?: () => Promise<void>;
}

const SAFE_APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/;
const CHECKSUM_RECORD =
  /^([0-9a-f]{64}) {2}([A-Za-z0-9][A-Za-z0-9._-]*\.apk)\n$/;
const MAX_CHECKSUM_RECORD_BYTES = 512;
const MAX_APP_CONFIG_BYTES = 128 * 1024;
const MAX_RELEASE_MANIFEST_BYTES = 4 * 1024;
const MAX_APK_BYTES = 512 * 1024 * 1024;
const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const ANDROID_PACKAGE_ID =
  /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const INVALID_ANDROID_VERSION_CODE_MESSAGE =
  'Expo app config must contain a positive integer Android versionCode.';
const INVALID_PREVIOUS_VERSION_CODE_MESSAGE =
  'Previous Android versionCode must be a non-negative integer.';

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

async function discardTemporaryDirectory(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
  }
}

function apkReadPolicy(): StableFileReadPolicy {
  return {
    noFollowFlag: constants.O_NOFOLLOW,
    symbolicLinkMessage:
      'Android release artifact must not be a symbolic link.',
    invalidCode: 'INVALID_APK_PATH',
    invalidMessage: 'Android release artifact must be a regular .apk file.',
    changedCode: 'ARTIFACT_CHANGED',
    changedMessage: 'Android release artifact changed while it was being read.',
  };
}

function assertValidApkSize(size: bigint): void {
  if (size === 0n) {
    throw new AndroidArtifactIntegrityError(
      'EMPTY_ARTIFACT',
      'Android release artifact must not be empty.'
    );
  }
  if (size > BigInt(MAX_APK_BYTES)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_APK_PATH',
      'Android release artifact exceeds the 512 MiB verification limit.'
    );
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
  const policy = apkReadPolicy();
  const result = await digestStableFile(path, policy, assertValidApkSize);
  return { byteLength: Number(result.byteLength), sha256: result.sha256 };
}

export async function inspectAndroidArtifact(
  path: string
): Promise<Omit<AndroidArtifactIntegrityResult, 'checksumPath'>> {
  return { apkFileName: basename(path), ...(await hashArtifact(path)) };
}

export async function createAndroidArtifactSnapshot(
  sourcePath: string
): Promise<AndroidArtifactSnapshot> {
  const apkFileName = basename(sourcePath);
  if (!SAFE_APK_NAME.test(apkFileName)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_APK_PATH',
      'Android release artifact must use a safe .apk file name.'
    );
  }
  const directory = await mkdtemp(
    join(tmpdir(), 'tenka-android-release-snapshot-')
  );
  await chmod(directory, 0o700);
  const snapshotPath = join(directory, apkFileName);
  const policy = apkReadPolicy();
  try {
    const copied = await copyStableFile(
      sourcePath,
      snapshotPath,
      policy,
      0o400,
      assertValidApkSize
    );
    const inspected = await inspectAndroidArtifact(snapshotPath);
    if (
      BigInt(inspected.byteLength) !== copied.byteLength ||
      inspected.sha256 !== copied.sha256 ||
      inspected.apkFileName !== apkFileName
    ) {
      throw new AndroidArtifactIntegrityError(
        'ARTIFACT_CHANGED',
        'Android release artifact snapshot changed after it was created.'
      );
    }
    let disposed = false;
    return {
      ...inspected,
      path: snapshotPath,
      async dispose() {
        if (disposed) return;
        disposed = true;
        await discardTemporaryFile(snapshotPath);
        await discardTemporaryDirectory(directory);
      },
    };
  } catch (error) {
    await discardTemporaryFile(snapshotPath);
    await discardTemporaryDirectory(directory);
    throw error;
  }
}

async function readBoundedStableTextFile(
  path: string,
  maximumBytes: number,
  symbolicLinkMessage: string,
  invalidCode:
    | 'INVALID_CHECKSUM_RECORD'
    | 'INVALID_ANDROID_VERSION_CODE'
    | 'INVALID_RELEASE_MANIFEST',
  invalidMessage: string,
  changedCode:
    | 'CHECKSUM_RECORD_CHANGED'
    | 'ANDROID_CONFIG_CHANGED'
    | 'INVALID_RELEASE_MANIFEST',
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
    const before = stableFileSnapshot(status);
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
    const after = stableFileSnapshot(await handle.stat({ bigint: true }));
    if (!sameStableFileSnapshot(before, after)) {
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

export async function readAndroidReleaseManifestText(
  path: string
): Promise<string> {
  return readBoundedStableTextFile(
    path,
    MAX_RELEASE_MANIFEST_BYTES,
    'Android release manifest must not be a symbolic link.',
    'INVALID_RELEASE_MANIFEST',
    'Android release manifest is invalid.',
    'INVALID_RELEASE_MANIFEST',
    'Android release manifest changed while it was being read.'
  );
}

function property(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Reflect.get(value, key);
}

export async function readAndroidReleaseAppIdentity(
  appConfigPath: string
): Promise<AndroidReleaseAppIdentity> {
  const rawConfig = await readBoundedStableTextFile(
    appConfigPath,
    MAX_APP_CONFIG_BYTES,
    'Expo app config must not be a symbolic link.',
    'INVALID_ANDROID_VERSION_CODE',
    INVALID_ANDROID_VERSION_CODE_MESSAGE,
    'ANDROID_CONFIG_CHANGED',
    'Expo app config changed while it was being read.'
  );
  return parseAndroidReleaseAppIdentityText(rawConfig);
}

export function parseAndroidReleaseAppIdentityText(
  rawConfig: string
): AndroidReleaseAppIdentity {
  if (Buffer.byteLength(rawConfig, 'utf8') > MAX_APP_CONFIG_BYTES) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_VERSION_CODE',
      INVALID_ANDROID_VERSION_CODE_MESSAGE
    );
  }
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
  const packageId = property(
    property(property(config, 'expo'), 'android'),
    'package'
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
  if (typeof packageId !== 'string' || !ANDROID_PACKAGE_ID.test(packageId)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_PACKAGE_ID',
      'Expo app config must contain a valid Android package ID.'
    );
  }
  return { packageId, versionCode };
}

export async function readAndroidReleaseVersionCode(
  appConfigPath: string
): Promise<number> {
  return (await readAndroidReleaseAppIdentity(appConfigPath)).versionCode;
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

export async function atomicWriteTextFile(
  path: string,
  contents: string
): Promise<void> {
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
  const sha256 = match[1];
  const fileName = match[2];
  if (sha256 === undefined || fileName === undefined) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_CHECKSUM_RECORD',
      'Android artifact checksum record is invalid.'
    );
  }
  if (fileName !== expectedFileName) {
    throw new AndroidArtifactIntegrityError(
      'ARTIFACT_NAME_MISMATCH',
      'Android artifact name does not match the checksum record.'
    );
  }
  return sha256;
}

export async function createAndroidArtifactChecksum(
  apkPath: string,
  hooks: Pick<AndroidArtifactIntegrityHooks, 'afterChecksumPublished'> = {}
): Promise<AndroidArtifactIntegrityResult> {
  const apkFileName = basename(apkPath);
  const first = await hashArtifact(apkPath);
  const checksumPath = `${apkPath}.sha256`;
  const checksumRecord = `${first.sha256}  ${apkFileName}\n`;
  await atomicWriteTextFile(checksumPath, checksumRecord);
  let afterPublish: Awaited<ReturnType<typeof hashArtifact>>;
  let checksumAfterPublish: string;
  try {
    await hooks.afterChecksumPublished?.();
    afterPublish = await hashArtifact(apkPath);
    checksumAfterPublish = await readChecksumFile(checksumPath);
  } catch (error) {
    await discardTemporaryFile(checksumPath);
    throw error;
  }
  if (
    first.sha256 !== afterPublish.sha256 ||
    first.byteLength !== afterPublish.byteLength
  ) {
    await discardTemporaryFile(checksumPath);
    throw new AndroidArtifactIntegrityError(
      'ARTIFACT_CHANGED',
      'Android release artifact changed while it was being read.'
    );
  }
  if (checksumAfterPublish !== checksumRecord) {
    await discardTemporaryFile(checksumPath);
    throw new AndroidArtifactIntegrityError(
      'CHECKSUM_RECORD_CHANGED',
      'Android checksum record changed while it was being read.'
    );
  }
  return { apkFileName, ...afterPublish, checksumPath };
}

export async function verifyAndroidArtifactChecksum(
  apkPath: string,
  checksumPath: string,
  hooks: Pick<AndroidArtifactIntegrityHooks, 'afterInitialChecksumRead'> = {}
): Promise<AndroidArtifactIntegrityResult> {
  const apkFileName = basename(apkPath);
  const checksumBefore = await readChecksumFile(checksumPath);
  const expectedSha256 = parseChecksumRecord(checksumBefore, apkFileName);
  await hooks.afterInitialChecksumRead?.();
  const { byteLength, sha256 } = await hashArtifact(apkPath);
  const checksumAfter = await readChecksumFile(checksumPath);
  if (checksumAfter !== checksumBefore) {
    throw new AndroidArtifactIntegrityError(
      'CHECKSUM_RECORD_CHANGED',
      'Android checksum record changed while it was being read.'
    );
  }
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
    reportAndroidArtifactCliFailure(
      error,
      'Android artifact verification failed.'
    );
  }
}
