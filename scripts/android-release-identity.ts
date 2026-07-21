import { type BigIntStats, constants } from 'node:fs';
import { access, lstat, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { platform } from 'node:process';
import {
  digestStableFile,
  type StableFileReadPolicy,
} from './android-artifact-file-guard';
import {
  AndroidArtifactIntegrityError,
  type AndroidArtifactIntegrityResult,
  type AndroidArtifactSnapshot,
  type AndroidReleaseAppIdentity,
  atomicWriteTextFile,
  createAndroidArtifactSnapshot,
  inspectAndroidArtifact,
  parseAndroidReleaseAppIdentityText,
  readAndroidReleaseManifestText,
  verifyAndroidArtifactChecksum,
} from './android-artifact-integrity';
import { reportAndroidArtifactCliFailure } from './android-artifact-integrity-error';
import {
  type ApprovedToolchainSnapshot,
  assertApprovedToolchainDirectory,
  assertCanonicalToolchainFile,
  createApprovedToolchainSnapshot,
  type ToolchainFingerprint,
} from './android-toolchain-integrity';
import {
  type BoundedProcessResult,
  runBoundedProcess,
} from './process-capture-bounded';

const RELEASE_SCHEMA_VERSION = 1;
const MAX_TOOL_OUTPUT_BYTES = 256 * 1024;
const MAX_EXECUTABLE_BYTES = 64 * 1024 * 1024;
const MAX_APK_BYTES = 512 * 1024 * 1024;
const GIT_PROCESS_TIMEOUT_MILLISECONDS = 15_000;
const ANDROID_PROCESS_TIMEOUT_MILLISECONDS = 60_000;
const SOURCE_TAG = /^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/;
const SOURCE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ANDROID_PACKAGE_ID =
  /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CERTIFICATE_DIGEST_LINE =
  /^Signer #([1-9][0-9]*) certificate SHA-256 digest: ([0-9A-Fa-f]{64}|(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})$/gm;
const APK_PROVENANCE_PATH = '/res/raw/tenka_release_provenance.json';
const CLI_USAGE =
  'Usage: provenance <raw-resource-json> <annotated-source-tag> <absolute-git> <git-sha256> | write <apk> <checksum> <tag> <certificate-sha256> <android-toolchain-root> <toolchain-sha256> <apkanalyzer-classpath-jar> <apksigner-jar> <java-home> <java-runtime-sha256> <absolute-git> <git-sha256> | verify <apk> <checksum> <release-json> <tag> <certificate-sha256> <android-toolchain-root> <toolchain-sha256> <apkanalyzer-classpath-jar> <apksigner-jar> <java-home> <java-runtime-sha256> <absolute-git> <git-sha256>';

export interface AndroidReleaseProvenance {
  readonly schemaVersion: 1;
  readonly sourceTag: string;
  readonly sourceCommit: string;
}

export interface AndroidReleaseManifest extends AndroidReleaseProvenance {
  readonly androidToolchainSha256: string;
  readonly apkFileName: string;
  readonly byteLength: number;
  readonly gitSha256: string;
  readonly javaRuntimeSha256: string;
  readonly packageId: string;
  readonly sha256: string;
  readonly signerCertificateSha256: string;
  readonly versionCode: number;
}

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

type ProcessEnvironment = Readonly<Record<string, string>>;

export interface GitToolIdentity {
  readonly git: string;
  readonly gitSha256: string;
}

interface AndroidToolPaths extends GitToolIdentity {
  readonly androidToolchainRoot: string;
  readonly androidToolchainSha256: string;
  readonly apkanalyzerClasspath: string;
  readonly apksignerJar: string;
  readonly javaHome: string;
  readonly javaRuntimeSha256: string;
}

interface ReleaseIdentityInput extends AndroidToolPaths {
  readonly apkPath: string;
  readonly checksumPath: string;
  readonly expectedCertificateSha256: string;
  readonly sourceTag: string;
  readonly repositoryPath?: string;
}

interface VerifyReleaseIdentityInput extends ReleaseIdentityInput {
  readonly manifestPath: string;
}

function invalidProvenance(): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    'INVALID_RELEASE_PROVENANCE',
    'Android release provenance is invalid.'
  );
}

function invalidManifest(): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    'INVALID_RELEASE_MANIFEST',
    'Android release manifest is invalid.'
  );
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  error: AndroidArtifactIntegrityError
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw error;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw error;
  }
  return record;
}

function parseJson(
  value: string,
  error: AndroidArtifactIntegrityError
): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw error;
  }
}

function validSourceTag(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_TAG.test(value);
}

function validSourceCommit(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_COMMIT.test(value);
}

export function parseAndroidReleaseProvenance(
  value: string
): AndroidReleaseProvenance {
  const error = invalidProvenance();
  const record = exactRecord(
    parseJson(value, error),
    ['schemaVersion', 'sourceCommit', 'sourceTag'],
    error
  );
  const schemaVersion = record['schemaVersion'];
  const sourceTag = record['sourceTag'];
  const sourceCommit = record['sourceCommit'];
  if (
    schemaVersion !== RELEASE_SCHEMA_VERSION ||
    !validSourceTag(sourceTag) ||
    !validSourceCommit(sourceCommit)
  ) {
    throw error;
  }
  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    sourceTag,
    sourceCommit,
  };
}

export function parseAndroidReleaseManifest(
  value: string
): AndroidReleaseManifest {
  const error = invalidManifest();
  const record = exactRecord(
    parseJson(value, error),
    [
      'androidToolchainSha256',
      'apkFileName',
      'byteLength',
      'gitSha256',
      'javaRuntimeSha256',
      'packageId',
      'schemaVersion',
      'sha256',
      'signerCertificateSha256',
      'sourceCommit',
      'sourceTag',
      'versionCode',
    ],
    error
  );
  const androidToolchainSha256 = record['androidToolchainSha256'];
  const apkFileName = record['apkFileName'];
  const byteLength = record['byteLength'];
  const gitSha256 = record['gitSha256'];
  const javaRuntimeSha256 = record['javaRuntimeSha256'];
  const packageId = record['packageId'];
  const schemaVersion = record['schemaVersion'];
  const sha256 = record['sha256'];
  const signerCertificateSha256 = record['signerCertificateSha256'];
  const sourceCommit = record['sourceCommit'];
  const sourceTag = record['sourceTag'];
  const versionCode = record['versionCode'];
  if (
    schemaVersion !== RELEASE_SCHEMA_VERSION ||
    typeof androidToolchainSha256 !== 'string' ||
    !SHA256.test(androidToolchainSha256) ||
    typeof apkFileName !== 'string' ||
    basename(apkFileName) !== apkFileName ||
    !apkFileName.endsWith('.apk') ||
    typeof byteLength !== 'number' ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MAX_APK_BYTES ||
    typeof gitSha256 !== 'string' ||
    !SHA256.test(gitSha256) ||
    typeof javaRuntimeSha256 !== 'string' ||
    !SHA256.test(javaRuntimeSha256) ||
    typeof packageId !== 'string' ||
    !ANDROID_PACKAGE_ID.test(packageId) ||
    typeof sha256 !== 'string' ||
    !SHA256.test(sha256) ||
    typeof signerCertificateSha256 !== 'string' ||
    !SHA256.test(signerCertificateSha256) ||
    !validSourceTag(sourceTag) ||
    !validSourceCommit(sourceCommit) ||
    typeof versionCode !== 'number' ||
    !Number.isSafeInteger(versionCode) ||
    versionCode <= 0
  ) {
    throw error;
  }
  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    androidToolchainSha256,
    apkFileName,
    byteLength,
    gitSha256,
    javaRuntimeSha256,
    packageId,
    sha256,
    signerCertificateSha256,
    sourceCommit,
    sourceTag,
    versionCode,
  };
}

function singleOutputLine(
  output: string,
  pattern: RegExp,
  label: string
): string {
  const normalized = output.replaceAll('\r\n', '\n');
  const line = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (line.includes('\n') || !pattern.test(line)) {
    throw new AndroidArtifactIntegrityError(
      'ANDROID_TOOL_FAILED',
      `Android SDK returned an invalid ${label}.`
    );
  }
  return line;
}

export function parseApkanalyzerPackageId(output: string): string {
  return singleOutputLine(output, ANDROID_PACKAGE_ID, 'package ID');
}

export function parseApkanalyzerVersionCode(output: string): number {
  const line = singleOutputLine(
    output,
    CANONICAL_POSITIVE_INTEGER,
    'versionCode'
  );
  const versionCode = Number(line);
  if (!Number.isSafeInteger(versionCode)) {
    throw new AndroidArtifactIntegrityError(
      'ANDROID_TOOL_FAILED',
      'Android SDK returned an invalid versionCode.'
    );
  }
  return versionCode;
}

export function parseApksignerCertificateSha256(output: string): string {
  const matches = [...output.matchAll(CERTIFICATE_DIGEST_LINE)];
  if (matches.length !== 1 || matches[0]?.[1] !== '1') {
    throw new AndroidArtifactIntegrityError(
      'ANDROID_TOOL_FAILED',
      'Android release APK must have exactly one signing certificate.'
    );
  }
  const digest = matches[0][2]?.replaceAll(':', '').toLowerCase();
  if (digest === undefined || !SHA256.test(digest)) {
    throw new AndroidArtifactIntegrityError(
      'ANDROID_TOOL_FAILED',
      'Android SDK returned an invalid signing certificate digest.'
    );
  }
  return digest;
}

function processFailed(
  failureCode: 'ANDROID_TOOL_FAILED' | 'GIT_SOURCE_MISMATCH'
): AndroidArtifactIntegrityError {
  return new AndroidArtifactIntegrityError(
    failureCode,
    failureCode === 'ANDROID_TOOL_FAILED'
      ? 'Android release tool failed.'
      : 'Git source does not match the release provenance.'
  );
}

async function runProcess(
  command: readonly string[],
  cwd: string,
  failureCode: 'ANDROID_TOOL_FAILED' | 'GIT_SOURCE_MISMATCH',
  timeoutMilliseconds: number,
  environment?: ProcessEnvironment
): Promise<ProcessResult> {
  let result: BoundedProcessResult;
  try {
    result = await runBoundedProcess(command, {
      cwd,
      ...(environment === undefined ? {} : { env: environment }),
      maxOutputBytes: MAX_TOOL_OUTPUT_BYTES,
      timeoutMilliseconds,
    });
  } catch {
    throw processFailed(failureCode);
  }
  if (result.timedOut) {
    throw new AndroidArtifactIntegrityError(
      failureCode,
      failureCode === 'ANDROID_TOOL_FAILED'
        ? 'Android release tool exceeded the 60 second timeout.'
        : 'Git exceeded the 15 second release verification timeout.'
    );
  }
  if (result.overflowed !== false) {
    throw new AndroidArtifactIntegrityError(
      failureCode,
      failureCode === 'ANDROID_TOOL_FAILED'
        ? 'Android release tool output exceeded the safe limit.'
        : 'Git output exceeded the safe release verification limit.'
    );
  }
  if (result.exitCode !== 0) throw processFailed(failureCode);
  return { stderr: result.stderr, stdout: result.stdout };
}

function gitEnvironment(git: string): ProcessEnvironment {
  const environment: Record<string, string> = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.fsmonitor',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_VALUE_0: 'false',
    GIT_NO_REPLACE_OBJECTS: '1',
    LANG: 'C',
    LC_ALL: 'C',
    PATH: dirname(git),
  };
  if (platform === 'win32') {
    const systemRoot = process.env['SystemRoot'];
    if (systemRoot !== undefined) environment['SystemRoot'] = systemRoot;
  } else {
    environment['GIT_CONFIG_GLOBAL'] = '/dev/null';
  }
  return environment;
}

interface ToolSnapshot {
  readonly changedAtNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly modifiedAtNanoseconds: bigint;
  readonly sha256: string;
  readonly size: bigint;
}

function executablePolicy(): StableFileReadPolicy {
  return {
    noFollowFlag: constants.O_NOFOLLOW,
    symbolicLinkMessage: 'Release tool must not be a symbolic link.',
    invalidCode: 'INVALID_ANDROID_TOOL_PATH',
    invalidMessage: 'Release tool path must be an executable regular file.',
    changedCode: 'ANDROID_TOOL_FAILED',
    changedMessage: 'Release tool changed while it was being verified.',
  };
}

async function hashExecutable(path: string): Promise<string> {
  const policy = executablePolicy();
  const result = await digestStableFile(path, policy, (size) => {
    if (size === 0n || size > BigInt(MAX_EXECUTABLE_BYTES)) {
      throw new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Release tool must be between 1 byte and 64 MiB.'
      );
    }
  });
  return result.sha256;
}

async function toolSnapshot(
  path: string,
  expectedSha256: string
): Promise<ToolSnapshot> {
  if (!SHA256.test(expectedSha256)) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_TOOL_PATH',
      'Release tool SHA-256 must be 64 lowercase hexadecimal characters.'
    );
  }
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_TOOL_PATH',
      'Android release tools must use normalized absolute paths.'
    );
  }
  if (platform === 'darwin' && path === '/usr/bin/git') {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_TOOL_PATH',
      'Use the canonical real Git executable instead of the macOS system shim.'
    );
  }
  let canonicalPath: string;
  let status: BigIntStats;
  try {
    [canonicalPath, status] = await Promise.all([
      realpath(path),
      lstat(path, { bigint: true }),
      access(path, constants.X_OK),
    ]).then(([resolvedPath, toolStatus]) => [resolvedPath, toolStatus]);
  } catch {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_TOOL_PATH',
      'Android release tool path must be an executable regular file.'
    );
  }
  if (
    canonicalPath !== path ||
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.ino <= 0n
  ) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_TOOL_PATH',
      'Android release tool path must be a canonical regular file.'
    );
  }
  const sha256 = await hashExecutable(path);
  if (sha256 !== expectedSha256) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_ANDROID_TOOL_PATH',
      'Release tool SHA-256 does not match the approved fingerprint.'
    );
  }
  return {
    changedAtNanoseconds: status.ctimeNs,
    device: status.dev,
    inode: status.ino,
    modifiedAtNanoseconds: status.mtimeNs,
    sha256,
    size: status.size,
  };
}

function sameToolSnapshot(left: ToolSnapshot, right: ToolSnapshot): boolean {
  return (
    left.changedAtNanoseconds === right.changedAtNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.modifiedAtNanoseconds === right.modifiedAtNanoseconds &&
    left.sha256 === right.sha256 &&
    left.size === right.size
  );
}

function javaExecutable(javaHome: string): string {
  return resolve(javaHome, 'bin', platform === 'win32' ? 'java.exe' : 'java');
}

function androidToolEnvironment(
  javaHome: string,
  java: string
): ProcessEnvironment {
  const environment: Record<string, string> = {
    JAVA_HOME: javaHome,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: dirname(java),
  };
  if (platform === 'win32') {
    const systemRoot = process.env['SystemRoot'];
    if (systemRoot !== undefined) environment['SystemRoot'] = systemRoot;
  }
  return environment;
}

function sameToolchainFingerprint(
  left: ToolchainFingerprint,
  right: ToolchainFingerprint
): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.fileCount === right.fileCount &&
    left.sha256 === right.sha256
  );
}

interface AndroidToolchainSession {
  readonly tools: AndroidToolPaths;
  readonly verify: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

function pathInsideSnapshot(
  sourceRoot: string,
  sourcePath: string,
  snapshotRoot: string
): string {
  return resolve(snapshotRoot, relative(sourceRoot, sourcePath));
}

async function createAndroidToolchainSession(
  tools: AndroidToolPaths
): Promise<AndroidToolchainSession> {
  const sourceJava = javaExecutable(tools.javaHome);
  await Promise.all([
    assertCanonicalToolchainFile(
      tools.androidToolchainRoot,
      tools.apkanalyzerClasspath,
      false
    ),
    assertCanonicalToolchainFile(
      tools.androidToolchainRoot,
      tools.apksignerJar,
      false
    ),
    assertCanonicalToolchainFile(tools.javaHome, sourceJava, true),
  ]);
  let android: ApprovedToolchainSnapshot | undefined;
  let java: ApprovedToolchainSnapshot | undefined;
  try {
    android = await createApprovedToolchainSnapshot(
      tools.androidToolchainRoot,
      tools.androidToolchainSha256
    );
    java = await createApprovedToolchainSnapshot(
      tools.javaHome,
      tools.javaRuntimeSha256
    );
    const snapshotTools: AndroidToolPaths = {
      ...tools,
      androidToolchainRoot: android.root,
      apkanalyzerClasspath: pathInsideSnapshot(
        tools.androidToolchainRoot,
        tools.apkanalyzerClasspath,
        android.root
      ),
      apksignerJar: pathInsideSnapshot(
        tools.androidToolchainRoot,
        tools.apksignerJar,
        android.root
      ),
      javaHome: java.root,
    };
    await Promise.all([
      assertCanonicalToolchainFile(
        snapshotTools.androidToolchainRoot,
        snapshotTools.apkanalyzerClasspath,
        false
      ),
      assertCanonicalToolchainFile(
        snapshotTools.androidToolchainRoot,
        snapshotTools.apksignerJar,
        false
      ),
      assertCanonicalToolchainFile(
        snapshotTools.javaHome,
        javaExecutable(snapshotTools.javaHome),
        true
      ),
    ]);
    const approvedAndroid = android;
    const approvedJava = java;
    return {
      tools: snapshotTools,
      verify: async () => {
        const [androidAfter, javaAfter] = await Promise.all([
          assertApprovedToolchainDirectory(
            approvedAndroid.root,
            tools.androidToolchainSha256
          ),
          assertApprovedToolchainDirectory(
            approvedJava.root,
            tools.javaRuntimeSha256
          ),
        ]);
        if (
          !sameToolchainFingerprint(
            approvedAndroid.fingerprint,
            androidAfter
          ) ||
          !sameToolchainFingerprint(approvedJava.fingerprint, javaAfter)
        ) {
          throw new AndroidArtifactIntegrityError(
            'ANDROID_TOOL_FAILED',
            'Private Android verifier toolchain snapshot changed while it was used.'
          );
        }
      },
      dispose: async () => {
        try {
          await approvedJava.dispose();
        } finally {
          await approvedAndroid.dispose();
        }
      },
    };
  } catch (error) {
    try {
      await java?.dispose();
    } finally {
      await android?.dispose();
    }
    throw error;
  }
}

async function runAndroidTool(
  tools: AndroidToolPaths,
  kind: 'apkanalyzer' | 'apksigner',
  arguments_: readonly string[],
  cwd: string
): Promise<string> {
  const java = javaExecutable(tools.javaHome);
  const command =
    kind === 'apkanalyzer'
      ? [
          java,
          `-Dcom.android.sdklib.toolsdir=${dirname(dirname(tools.apkanalyzerClasspath))}`,
          '-classpath',
          tools.apkanalyzerClasspath,
          'com.android.tools.apk.analyzer.ApkAnalyzerCli',
          ...arguments_,
        ]
      : [java, '-Xmx1024M', '-jar', tools.apksignerJar, ...arguments_];
  const result = await runProcess(
    command,
    cwd,
    'ANDROID_TOOL_FAILED',
    ANDROID_PROCESS_TIMEOUT_MILLISECONDS,
    androidToolEnvironment(tools.javaHome, java)
  );
  if (result.stderr.length > 0) {
    throw new AndroidArtifactIntegrityError(
      'ANDROID_TOOL_FAILED',
      'Android verifier tool wrote to stderr while it was running.'
    );
  }
  return result.stdout;
}

async function gitOutput(
  repositoryPath: string,
  arguments_: readonly string[],
  git: string,
  expectedGitSha256: string
): Promise<string> {
  const before = await toolSnapshot(git, expectedGitSha256);
  const result = await runProcess(
    [git, '--no-replace-objects', ...arguments_],
    repositoryPath,
    'GIT_SOURCE_MISMATCH',
    GIT_PROCESS_TIMEOUT_MILLISECONDS,
    gitEnvironment(git)
  );
  const after = await toolSnapshot(git, expectedGitSha256);
  if (!sameToolSnapshot(before, after) || result.stderr !== '') {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Git wrote an unexpected release provenance warning.'
    );
  }
  return result.stdout;
}

async function canonicalRepositoryRoot(
  repositoryPath: string,
  tools: GitToolIdentity
): Promise<string> {
  const root = (
    await gitOutput(
      repositoryPath,
      ['rev-parse', '--show-toplevel'],
      tools.git,
      tools.gitSha256
    )
  ).trimEnd();
  if (!isAbsolute(root) || resolve(root) !== root) {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Git repository root must be a canonical absolute path.'
    );
  }
  if ((await realpath(root)) !== root) {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Git repository root must not traverse a symbolic link.'
    );
  }
  const requestedRoot = await realpath(resolve(repositoryPath));
  if (requestedRoot !== root) {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Git repository root does not match the requested release repository.'
    );
  }
  return root;
}

async function readGitSourceIdentity(
  repositoryPath: string,
  sourceTag: string,
  tools: GitToolIdentity
): Promise<AndroidReleaseProvenance> {
  if (!SOURCE_TAG.test(sourceTag)) throw invalidProvenance();
  const status = await gitOutput(
    repositoryPath,
    ['status', '--porcelain=v1', '--untracked-files=all'],
    tools.git,
    tools.gitSha256
  );
  if (status !== '') {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Android release source worktree must be clean.'
    );
  }
  const [replaceReferences, indexFlags] = await Promise.all([
    gitOutput(
      repositoryPath,
      ['for-each-ref', '--format=%(refname)', 'refs/replace/'],
      tools.git,
      tools.gitSha256
    ),
    gitOutput(repositoryPath, ['ls-files', '-v'], tools.git, tools.gitSha256),
  ]);
  if (
    replaceReferences !== '' ||
    indexFlags
      .split('\n')
      .some((line) => line.startsWith('S ') || /^[a-z] /.test(line))
  ) {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Git replacement refs and hidden index entries are not allowed for a release.'
    );
  }
  const tagReference = `refs/tags/${sourceTag}`;
  const tagType = (
    await gitOutput(
      repositoryPath,
      ['cat-file', '-t', tagReference],
      tools.git,
      tools.gitSha256
    )
  ).trimEnd();
  if (tagType !== 'tag') {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Android release source tag must be annotated.'
    );
  }
  const [head, taggedCommit] = await Promise.all([
    gitOutput(
      repositoryPath,
      ['rev-parse', 'HEAD'],
      tools.git,
      tools.gitSha256
    ),
    gitOutput(
      repositoryPath,
      ['rev-parse', `${tagReference}^{commit}`],
      tools.git,
      tools.gitSha256
    ),
  ]).then((values) => values.map((value) => value.trimEnd()));
  if (
    !validSourceCommit(head) ||
    !validSourceCommit(taggedCommit) ||
    head !== taggedCommit
  ) {
    throw new AndroidArtifactIntegrityError(
      'GIT_SOURCE_MISMATCH',
      'Android release source tag must resolve to the current HEAD.'
    );
  }
  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    sourceTag,
    sourceCommit: head,
  };
}

async function readTaggedAppIdentity(
  repositoryPath: string,
  sourceCommit: string,
  tools: GitToolIdentity
): Promise<AndroidReleaseAppIdentity> {
  if (!validSourceCommit(sourceCommit)) throw invalidProvenance();
  const appConfig = await gitOutput(
    repositoryPath,
    ['show', `${sourceCommit}:app.json`],
    tools.git,
    tools.gitSha256
  );
  return parseAndroidReleaseAppIdentityText(appConfig);
}

function serializeProvenance(provenance: AndroidReleaseProvenance): string {
  return `${JSON.stringify(provenance, null, 2)}\n`;
}

function serializeManifest(manifest: AndroidReleaseManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

type ArtifactIdentity = Pick<
  AndroidArtifactIntegrityResult,
  'apkFileName' | 'byteLength' | 'sha256'
>;

function sameArtifact(
  left: ArtifactIdentity,
  right: ArtifactIdentity
): boolean {
  return (
    left.apkFileName === right.apkFileName &&
    left.byteLength === right.byteLength &&
    left.sha256 === right.sha256
  );
}

function sameSource(
  left: AndroidReleaseProvenance,
  right: AndroidReleaseProvenance
): boolean {
  return (
    left.sourceTag === right.sourceTag &&
    left.sourceCommit === right.sourceCommit
  );
}

function sameAppIdentity(
  left: AndroidReleaseAppIdentity,
  right: AndroidReleaseAppIdentity
): boolean {
  return (
    left.packageId === right.packageId && left.versionCode === right.versionCode
  );
}

function assertExpectedIdentity(
  manifest: AndroidReleaseManifest,
  artifact: ArtifactIdentity,
  app: AndroidReleaseAppIdentity,
  provenance: AndroidReleaseProvenance,
  signerCertificateSha256: string,
  expectedCertificateSha256: string,
  tools: AndroidToolPaths
): void {
  if (
    manifest.apkFileName !== artifact.apkFileName ||
    manifest.byteLength !== artifact.byteLength ||
    manifest.sha256 !== artifact.sha256 ||
    manifest.packageId !== app.packageId ||
    manifest.versionCode !== app.versionCode ||
    manifest.sourceTag !== provenance.sourceTag ||
    manifest.sourceCommit !== provenance.sourceCommit ||
    manifest.signerCertificateSha256 !== signerCertificateSha256 ||
    signerCertificateSha256 !== expectedCertificateSha256 ||
    manifest.androidToolchainSha256 !== tools.androidToolchainSha256 ||
    manifest.gitSha256 !== tools.gitSha256 ||
    manifest.javaRuntimeSha256 !== tools.javaRuntimeSha256
  ) {
    throw new AndroidArtifactIntegrityError(
      'RELEASE_IDENTITY_MISMATCH',
      'Android release APK identity does not match the approved release inputs.'
    );
  }
}

interface BuildReleaseManifestInput {
  readonly app: AndroidReleaseAppIdentity;
  readonly artifact: ArtifactIdentity;
  readonly embeddedProvenance: AndroidReleaseProvenance;
  readonly expectedCertificateSha256: string;
  readonly extractedPackageId: string;
  readonly extractedVersionCode: number;
  readonly provenance: AndroidReleaseProvenance;
  readonly signerCertificateSha256: string;
  readonly tools: AndroidToolPaths;
}

export function buildAndroidReleaseManifest(
  input: BuildReleaseManifestInput
): AndroidReleaseManifest {
  const manifest: AndroidReleaseManifest = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    androidToolchainSha256: input.tools.androidToolchainSha256,
    apkFileName: input.artifact.apkFileName,
    byteLength: input.artifact.byteLength,
    gitSha256: input.tools.gitSha256,
    javaRuntimeSha256: input.tools.javaRuntimeSha256,
    packageId: input.extractedPackageId,
    sha256: input.artifact.sha256,
    signerCertificateSha256: input.signerCertificateSha256,
    sourceCommit: input.provenance.sourceCommit,
    sourceTag: input.provenance.sourceTag,
    versionCode: input.extractedVersionCode,
  };
  if (!sameSource(input.provenance, input.embeddedProvenance)) {
    throw new AndroidArtifactIntegrityError(
      'RELEASE_IDENTITY_MISMATCH',
      'Android release APK identity does not match the approved release inputs.'
    );
  }
  assertExpectedIdentity(
    manifest,
    input.artifact,
    input.app,
    input.provenance,
    input.signerCertificateSha256,
    input.expectedCertificateSha256,
    input.tools
  );
  return manifest;
}

async function collectReleaseIdentity(
  input: ReleaseIdentityInput
): Promise<AndroidReleaseManifest> {
  if (!SHA256.test(input.expectedCertificateSha256)) {
    throw new AndroidArtifactIntegrityError(
      'RELEASE_IDENTITY_MISMATCH',
      'Approved signing certificate SHA-256 is invalid.'
    );
  }
  const repositoryPath = await canonicalRepositoryRoot(
    input.repositoryPath ?? process.cwd(),
    input
  );
  const apkPath = resolve(repositoryPath, input.apkPath);
  const checksumPath = resolve(repositoryPath, input.checksumPath);
  const sourceBefore = await readGitSourceIdentity(
    repositoryPath,
    input.sourceTag,
    input
  );
  const [appBefore, artifactBefore] = await Promise.all([
    readTaggedAppIdentity(repositoryPath, sourceBefore.sourceCommit, input),
    verifyAndroidArtifactChecksum(apkPath, checksumPath),
  ]);
  let snapshot: AndroidArtifactSnapshot | undefined;
  let toolchain: AndroidToolchainSession | undefined;
  try {
    snapshot = await createAndroidArtifactSnapshot(apkPath);
    if (!sameArtifact(artifactBefore, snapshot)) {
      throw new AndroidArtifactIntegrityError(
        'RELEASE_IDENTITY_MISMATCH',
        'Android release artifact changed before its private snapshot was created.'
      );
    }
    toolchain = await createAndroidToolchainSession(input);
    const packageOutput = await runAndroidTool(
      toolchain.tools,
      'apkanalyzer',
      ['manifest', 'application-id', snapshot.path],
      repositoryPath
    );
    const versionOutput = await runAndroidTool(
      toolchain.tools,
      'apkanalyzer',
      ['manifest', 'version-code', snapshot.path],
      repositoryPath
    );
    const provenanceOutput = await runAndroidTool(
      toolchain.tools,
      'apkanalyzer',
      ['files', 'cat', '--file', APK_PROVENANCE_PATH, snapshot.path],
      repositoryPath
    );
    const signerOutput = await runAndroidTool(
      toolchain.tools,
      'apksigner',
      ['verify', '--verbose', '--print-certs', '-Werr', snapshot.path],
      repositoryPath
    );
    await toolchain.verify();
    const snapshotAfter = await inspectAndroidArtifact(snapshot.path);
    const packageId = parseApkanalyzerPackageId(packageOutput);
    const versionCode = parseApkanalyzerVersionCode(versionOutput);
    const embeddedProvenance = parseAndroidReleaseProvenance(provenanceOutput);
    const signerCertificateSha256 =
      parseApksignerCertificateSha256(signerOutput);
    const sourceAfter = await readGitSourceIdentity(
      repositoryPath,
      input.sourceTag,
      input
    );
    const [appAfter, artifactAfter] = await Promise.all([
      readTaggedAppIdentity(repositoryPath, sourceAfter.sourceCommit, input),
      verifyAndroidArtifactChecksum(apkPath, checksumPath),
    ]);
    if (
      !sameSource(sourceBefore, sourceAfter) ||
      !sameAppIdentity(appBefore, appAfter) ||
      !sameArtifact(artifactBefore, artifactAfter) ||
      !sameArtifact(snapshot, snapshotAfter) ||
      !sameArtifact(artifactAfter, snapshotAfter)
    ) {
      throw new AndroidArtifactIntegrityError(
        'RELEASE_IDENTITY_MISMATCH',
        'Android release inputs changed during identity verification.'
      );
    }
    return buildAndroidReleaseManifest({
      app: appAfter,
      artifact: artifactAfter,
      embeddedProvenance,
      expectedCertificateSha256: input.expectedCertificateSha256,
      extractedPackageId: packageId,
      extractedVersionCode: versionCode,
      provenance: sourceAfter,
      signerCertificateSha256,
      tools: input,
    });
  } finally {
    try {
      await toolchain?.dispose();
    } finally {
      await snapshot?.dispose();
    }
  }
}

export async function createAndroidReleaseProvenance(
  outputPath: string,
  sourceTag: string,
  tools: GitToolIdentity,
  repositoryPath = process.cwd()
): Promise<AndroidReleaseProvenance> {
  const root = await canonicalRepositoryRoot(repositoryPath, tools);
  const provenance = await readGitSourceIdentity(root, sourceTag, tools);
  await atomicWriteTextFile(outputPath, serializeProvenance(provenance));
  return provenance;
}

export async function writeAndroidReleaseManifest(
  input: ReleaseIdentityInput
): Promise<AndroidReleaseManifest> {
  const manifest = await collectReleaseIdentity(input);
  const repositoryPath = await canonicalRepositoryRoot(
    input.repositoryPath ?? process.cwd(),
    input
  );
  const manifestPath = `${resolve(repositoryPath, input.apkPath)}.release.json`;
  await atomicWriteTextFile(manifestPath, serializeManifest(manifest));
  try {
    return await verifyAndroidReleaseManifest({ ...input, manifestPath });
  } catch (error) {
    try {
      await unlink(manifestPath);
    } catch (cleanupError) {
      if (
        cleanupError === null ||
        typeof cleanupError !== 'object' ||
        !('code' in cleanupError) ||
        Reflect.get(cleanupError, 'code') !== 'ENOENT'
      ) {
        throw cleanupError;
      }
    }
    throw error;
  }
}

export async function verifyAndroidReleaseManifest(
  input: VerifyReleaseIdentityInput
): Promise<AndroidReleaseManifest> {
  const repositoryPath = await canonicalRepositoryRoot(
    input.repositoryPath ?? process.cwd(),
    input
  );
  const manifestPath = resolve(repositoryPath, input.manifestPath);
  const manifestBeforeText = await readAndroidReleaseManifestText(manifestPath);
  const manifestBefore = parseAndroidReleaseManifest(manifestBeforeText);
  const actual = await collectReleaseIdentity(input);
  const manifestAfterText = await readAndroidReleaseManifestText(manifestPath);
  if (manifestAfterText !== manifestBeforeText) {
    throw new AndroidArtifactIntegrityError(
      'INVALID_RELEASE_MANIFEST',
      'Android release manifest changed during identity verification.'
    );
  }
  assertExpectedIdentity(
    manifestBefore,
    {
      apkFileName: actual.apkFileName,
      byteLength: actual.byteLength,
      sha256: actual.sha256,
    },
    { packageId: actual.packageId, versionCode: actual.versionCode },
    actual,
    actual.signerCertificateSha256,
    input.expectedCertificateSha256,
    input
  );
  return manifestBefore;
}

function cliArgument(values: readonly string[], index: number): string {
  const value = values[index];
  if (value === undefined || value === '') {
    throw new AndroidArtifactIntegrityError('INVALID_COMMAND', CLI_USAGE);
  }
  return value;
}

async function runCli(arguments_: readonly string[]): Promise<void> {
  const [command, ...values] = arguments_;
  if (command === 'help' || command === '--help') {
    console.log(CLI_USAGE);
    return;
  }
  if (command === 'provenance' && values.length === 4) {
    const result = await createAndroidReleaseProvenance(
      cliArgument(values, 0),
      cliArgument(values, 1),
      { git: cliArgument(values, 2), gitSha256: cliArgument(values, 3) }
    );
    console.log(`wrote ${result.sourceTag} ${result.sourceCommit}`);
    return;
  }
  if (command === 'write' && values.length === 12) {
    const result = await writeAndroidReleaseManifest({
      apkPath: cliArgument(values, 0),
      checksumPath: cliArgument(values, 1),
      sourceTag: cliArgument(values, 2),
      expectedCertificateSha256: cliArgument(values, 3),
      androidToolchainRoot: cliArgument(values, 4),
      androidToolchainSha256: cliArgument(values, 5),
      apkanalyzerClasspath: cliArgument(values, 6),
      apksignerJar: cliArgument(values, 7),
      javaHome: cliArgument(values, 8),
      javaRuntimeSha256: cliArgument(values, 9),
      git: cliArgument(values, 10),
      gitSha256: cliArgument(values, 11),
    });
    console.log(`verified ${result.sha256}  ${result.apkFileName}`);
    return;
  }
  if (command === 'verify' && values.length === 13) {
    const result = await verifyAndroidReleaseManifest({
      apkPath: cliArgument(values, 0),
      checksumPath: cliArgument(values, 1),
      manifestPath: cliArgument(values, 2),
      sourceTag: cliArgument(values, 3),
      expectedCertificateSha256: cliArgument(values, 4),
      androidToolchainRoot: cliArgument(values, 5),
      androidToolchainSha256: cliArgument(values, 6),
      apkanalyzerClasspath: cliArgument(values, 7),
      apksignerJar: cliArgument(values, 8),
      javaHome: cliArgument(values, 9),
      javaRuntimeSha256: cliArgument(values, 10),
      git: cliArgument(values, 11),
      gitSha256: cliArgument(values, 12),
    });
    console.log(`verified ${result.sha256}  ${result.apkFileName}`);
    return;
  }
  throw new AndroidArtifactIntegrityError('INVALID_COMMAND', CLI_USAGE);
}

if (import.meta.main) {
  try {
    await runCli(Bun.argv.slice(2));
  } catch (error) {
    reportAndroidArtifactCliFailure(error, 'Android release identity failed.');
  }
}
