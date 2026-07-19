import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  type FileHandle,
  lstat,
  mkdtemp,
  open,
  readdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import {
  assertRegularFileIdentitiesNoFollowAt,
  atomicRenameDirectoryNoReplace,
  type DescriptorRelativeFileHash,
  type DescriptorRelativeFileIdentity,
  hashRegularFileNoFollowAt,
  readRegularFileNoFollowAtWithIdentity,
} from './atomic-output-publisher';
import type { ExclusiveOutputRecord } from './exclusive-output-writer';
import { firstDecodedDuplicateJsoncKey } from './jsonc-duplicate-key';

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SAFE_GIT_REF = /^(?:HEAD|[0-9A-Za-z][0-9A-Za-z._/-]*)$/;
const ALLOWED_RELEASE_ROOT_DIRECTORIES = new Set([
  '.claude',
  '.github',
  '.husky',
  'assets',
  'docs',
  'scripts',
  'src',
]);
const ALLOWED_RELEASE_ROOT_FILES = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.huskyrc.json',
  '.jscpd.json',
  '.lintstagedrc.json',
  '.oxfmtrc.jsonc',
  '.textlintignore',
  '.textlintrc',
  'AGENTS.md',
  'App.tsx',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONCEPT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'Makefile',
  'Plan.md',
  'README.en.md',
  'README.md',
  'SECURITY.md',
  'app.json',
  'babel.config.js',
  'biome.json',
  'bun.lock',
  'bunfig.toml',
  'index.ts',
  'knip.json',
  'metro.config.cjs',
  'package.json',
  'renovate.json',
  'tsconfig.base.json',
  'tsconfig.json',
]);
const ALLOWED_RELEASE_EXTENSIONS_BY_ROOT: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  '.claude': new Set(['.json', '.md', '.sh']),
  '.github': new Set(['.md', '.yaml', '.yml']),
  assets: new Set(['.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']),
  docs: new Set(['.md']),
  scripts: new Set(['.json', '.sh', '.ts']),
  src: new Set(['.json', '.snap', '.ts', '.tsx']),
};
const ALLOWED_EXTENSIONLESS_FILES = new Set([
  '.github/workflows/CODEOWNERS',
  '.husky/pre-commit',
]);
const ALLOWED_PLACEHOLDER_BASENAMES = new Set(['.gitkeep', '.keep']);
const ALLOWED_DOC_DATA_FILES = new Set([
  'docs/evidence/nearby-transport-static-screening.json',
  'docs/research/event-aggregate.schema.json',
]);
const ALLOWED_RESEARCH_GUIDE_FILES = new Set([
  'docs/research/interview-guide.md',
]);
const MAX_RELEASE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RELEASE_TREE_BYTES = 25 * 1024 * 1024;
const MAX_RELEASE_ARCHIVE_BYTES =
  MAX_RELEASE_TREE_BYTES + 2 * MAX_RELEASE_FILE_BYTES;
const SPDX_ROOT_PACKAGE_ID = 'SPDXRef-Package-TenkaCloudPassport';
const SPDX_CREATOR = 'Tool: TenkaCloud Passport repository source-release.ts';
const ALLOWED_SPDX_LICENSE_EXPRESSIONS = new Set([
  'Apache-2.0',
  'BlueOak-1.0.0',
  'ISC',
  'MIT',
  'MIT OR Apache-2.0',
  'NOASSERTION',
]);
const FORBIDDEN_RELEASE_PATHS = [
  /(?:^|\/)node_modules(?:\/|$)/,
  /(?:^|\/)dist(?:\/|$)/,
  /(?:^|\/)coverage(?:\/|$)/,
  /(?:^|\/)\.expo(?:\/|$)/,
  /(?:^|\/)(?:participant|pilot)[-_]?data(?:\/|$)/i,
  /(?:^|\/)research\/raw(?:\/|$)/i,
  /^(?:ios|android)(?:\/|$)/,
  /(?:^|\/)\.env(?:\.|$)/,
  /\.(?:gguf|safetensors|onnx|mlmodelc?)$/i,
  /\.(?:p8|p12|pem|key|mobileprovision|keystore|jks|cer)$/i,
  /\.(?:aab|apk|bin|ckpt|crt|db|der|dmg|gz|ipa|onnx|pfx|pt|pth|sqlite|tar|tflite|xcarchive|zip)$/i,
  /(?:^|\/)(?:credentials?|private[-_.]?keys?|secrets?|tokens?)(?:[./_-]|$)/i,
  /(?:^|\/)(?:id_ed25519|id_rsa)(?:\.|$)/i,
  /(?:^|\/)(?:attendees?|participants?)(?:[./_-]|$)/i,
  /(?:^|\/)(?:interviews?|transcripts?|field[-_.]?stud(?:y|ies))(?:[./_-]|$)/i,
  /(?:^|\/)people[-_.]?(?:data|notes?)(?:[./_-]|$)/i,
  /(?:^|\/)(?:lounge|passport|pilot|session)[-_.]?(?:data|dump|export)(?:[./_-]|$)/i,
  /(?:^|\/)exports?(?:\/|$)/i,
] as const;
const KNOWN_SECRET_CONTENT =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|github_pat_[0-9A-Za-z_]{60,}|gh[pousr]_[0-9A-Za-z]{36,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[0-9A-Za-z-]{20,}|sk-[0-9A-Za-z]{32,}/;

export type ReleaseCandidateErrorCode =
  | 'INVALID_VERSION'
  | 'INVALID_GIT_REF'
  | 'VERSION_MISMATCH'
  | 'INVALID_LOCKFILE'
  | 'INVALID_PACKAGE_METADATA'
  | 'FORBIDDEN_RELEASE_PATH'
  | 'FORBIDDEN_RELEASE_CONTENT'
  | 'UNSAFE_OUTPUT_DIRECTORY'
  | 'INVALID_SBOM'
  | 'INVALID_MANIFEST'
  | 'INVALID_CHECKSUM'
  | 'COMMAND_FAILED';

export class ReleaseCandidateError extends Error {
  constructor(
    readonly code: ReleaseCandidateErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ReleaseCandidateError';
  }
}

export interface LockedPackage {
  readonly lockKey: string;
  readonly name: string;
  readonly version: string;
  readonly sha512: string;
}

export interface SourceReleaseOptions {
  readonly repositoryRoot: string;
  readonly version: string;
  readonly ref: string;
  readonly outputDirectory: string;
}

export interface SourceReleaseResult {
  readonly version: string;
  readonly commit: string;
  readonly outputDirectory: string;
  readonly files: readonly string[];
}

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

interface DirectDependency {
  readonly lockKey: string;
  readonly name: string;
  readonly version: string;
  readonly scope: 'runtime' | 'development';
  readonly license: string;
}

interface ReleaseFile {
  readonly fileName: string;
  readonly sha256: string;
  readonly byteLength: number;
}

const EXCLUDED_RELEASE_CATEGORIES = [
  'model-weight',
  'secret-or-token',
  'certificate-or-provisioning',
  'participant-data',
  'generated-native-project',
  'build-output',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidLockfile(): ReleaseCandidateError {
  return new ReleaseCandidateError(
    'INVALID_LOCKFILE',
    'bun.lock contains an invalid package record.'
  );
}

function parseCanonicalPackage(value: string): {
  readonly name: string;
  readonly version: string;
} {
  const delimiter = value.lastIndexOf('@');
  if (delimiter <= 0 || delimiter === value.length - 1) throw invalidLockfile();
  const name = value.slice(0, delimiter);
  const version = value.slice(delimiter + 1);
  if (!isCanonicalNpmPackageName(name) || !isStrictSemver(version)) {
    throw invalidLockfile();
  }
  return { name, version };
}

const NPM_PACKAGE_COMPONENT = /^[a-z0-9][a-z0-9._~-]*$/;

function isCanonicalNpmPackageName(value: string): boolean {
  if (value.length === 0 || value.length > 214) return false;
  if (!value.startsWith('@')) return NPM_PACKAGE_COMPONENT.test(value);
  const separator = value.indexOf('/');
  return (
    separator > 1 &&
    separator === value.lastIndexOf('/') &&
    NPM_PACKAGE_COMPONENT.test(value.slice(1, separator)) &&
    NPM_PACKAGE_COMPONENT.test(value.slice(separator + 1))
  );
}

function sha512Hex(integrity: string): string {
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
    throw invalidLockfile();
  }
  const encoded = integrity.slice('sha512-'.length);
  if (encoded.length % 4 !== 0) throw invalidLockfile();
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength !== 64) throw invalidLockfile();
  return bytes.toString('hex');
}

export function parseLockedPackages(source: string): readonly LockedPackage[] {
  if (firstDecodedDuplicateJsoncKey(source, 'bun.lock') !== null) {
    throw invalidLockfile();
  }
  let lockfile: unknown;
  try {
    lockfile = Bun.JSONC.parse(source);
  } catch {
    throw invalidLockfile();
  }
  if (!isRecord(lockfile)) throw invalidLockfile();
  const packageRecords = Reflect.get(lockfile, 'packages');
  if (!isRecord(packageRecords)) {
    throw invalidLockfile();
  }
  const packages: LockedPackage[] = [];
  for (const [lockKey, value] of Object.entries(packageRecords)) {
    if (
      lockKey.length === 0 ||
      !Array.isArray(value) ||
      value.length !== 4 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string' ||
      !isRecord(value[2]) ||
      typeof value[3] !== 'string'
    ) {
      throw invalidLockfile();
    }
    const canonical = parseCanonicalPackage(value[0]);
    packages.push({
      lockKey,
      ...canonical,
      sha512: sha512Hex(value[3]),
    });
  }
  return packages.sort((left, right) =>
    left.lockKey.localeCompare(right.lockKey)
  );
}

function isAllowedReleasePath(trackedPath: string): boolean {
  const [root, ...rest] = trackedPath.split('/');
  if (root === undefined || root.length === 0) return false;
  if (rest.length === 0) return ALLOWED_RELEASE_ROOT_FILES.has(root);
  if (!ALLOWED_RELEASE_ROOT_DIRECTORIES.has(root)) return false;
  if (ALLOWED_EXTENSIONLESS_FILES.has(trackedPath)) return true;
  if (ALLOWED_PLACEHOLDER_BASENAMES.has(path.basename(trackedPath))) {
    return true;
  }
  if (ALLOWED_DOC_DATA_FILES.has(trackedPath)) return true;
  if (root === '.husky') return false;
  const extension = path.extname(trackedPath).toLowerCase();
  return ALLOWED_RELEASE_EXTENSIONS_BY_ROOT[root]?.has(extension) === true;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

export function assertSafeTrackedPaths(paths: readonly string[]): void {
  for (const trackedPath of paths) {
    if (
      trackedPath.length === 0 ||
      trackedPath.startsWith('/') ||
      trackedPath.includes('\\') ||
      hasControlCharacter(trackedPath) ||
      trackedPath.split('/').includes('..') ||
      !isAllowedReleasePath(trackedPath) ||
      (!ALLOWED_RESEARCH_GUIDE_FILES.has(trackedPath) &&
        FORBIDDEN_RELEASE_PATHS.some((pattern) => pattern.test(trackedPath)))
    ) {
      throw new ReleaseCandidateError(
        'FORBIDDEN_RELEASE_PATH',
        `Release tree contains a forbidden path: ${trackedPath}`
      );
    }
  }
}

function trackedPathsFromGitTree(source: string): readonly string[] {
  return source
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('\t');
      const metadata = entry.slice(0, separator).split(' ');
      const trackedPath = entry.slice(separator + 1);
      if (
        separator < 0 ||
        metadata.length !== 3 ||
        !['100644', '100755'].includes(metadata[0] ?? '') ||
        metadata[1] !== 'blob' ||
        !/^[0-9a-f]{40,64}$/.test(metadata[2] ?? '') ||
        trackedPath.length === 0
      ) {
        throw new ReleaseCandidateError(
          'FORBIDDEN_RELEASE_PATH',
          'Release tree contains a non-regular or invalid entry.'
        );
      }
      return trackedPath;
    });
}

export function assertNoKnownSecretContent(contents: readonly string[]): void {
  if (contents.some((content) => KNOWN_SECRET_CONTENT.test(content))) {
    throw new ReleaseCandidateError(
      'FORBIDDEN_RELEASE_CONTENT',
      'Release tree contains known secret material.'
    );
  }
}

function isStrictSemver(version: string): boolean {
  const match = SEMVER.exec(version);
  const prerelease = match?.[4];
  const hasInvalidNumericIdentifier = prerelease
    ?.split('.')
    .some((identifier) => /^0\d+$/.test(identifier));
  return match !== null && hasInvalidNumericIdentifier !== true;
}

function validateVersion(version: string): void {
  if (!isStrictSemver(version)) {
    throw new ReleaseCandidateError(
      'INVALID_VERSION',
      'Release version must be a strict SemVer value.'
    );
  }
}

function validateGitRef(ref: string): void {
  if (
    !SAFE_GIT_REF.test(ref) ||
    ref.includes('..') ||
    ref.includes('//') ||
    ref.endsWith('/')
  ) {
    throw new ReleaseCandidateError(
      'INVALID_GIT_REF',
      'Git ref contains unsupported characters or traversal syntax.'
    );
  }
}

async function runCommand(
  command: readonly string[],
  cwd: string
): Promise<string> {
  return new TextDecoder().decode(await runCommandBytes(command, cwd));
}

async function runCommandBytes(
  command: readonly string[],
  cwd: string
): Promise<Uint8Array> {
  const process = Bun.spawn([...command], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new ReleaseCandidateError(
      'COMMAND_FAILED',
      `${command[0]} command failed: ${stderr.trim() || `exit ${exitCode}`}`
    );
  }
  return new Uint8Array(stdout);
}

async function runExclusiveOutputWriter(
  transaction: SafeOutputTransaction,
  fileName: string,
  source:
    | { readonly command: readonly string[] }
    | { readonly contents: string | Uint8Array }
): Promise<ExclusiveOutputRecord> {
  const command = 'command' in source ? source.command : [];
  const stdin =
    'contents' in source
      ? typeof source.contents === 'string'
        ? new TextEncoder().encode(source.contents)
        : source.contents
      : undefined;
  const child = Bun.spawn(
    [
      'bun',
      '-e',
      'const writer = await import(Bun.argv[1]); const result = await writer.writeExclusiveOutput(Bun.argv.slice(2), Bun.stdin.stream(), "."); process.stdout.write(JSON.stringify(result));',
      '--',
      path.join(import.meta.dir, 'exclusive-output-writer.ts'),
      fileName,
      String(transaction.staging.device),
      String(transaction.staging.inode),
      '--',
      ...command,
    ],
    {
      cwd: transaction.staging.path,
      stdin,
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new ReleaseCandidateError(
      'COMMAND_FAILED',
      `Exclusive output writer failed: ${stderr.trim() || `exit ${exitCode}`}`
    );
  }
  const record = parseExclusiveOutputRecord(stdout, fileName);
  if ('contents' in source) {
    const expected =
      typeof source.contents === 'string'
        ? new TextEncoder().encode(source.contents)
        : source.contents;
    const expectedHash = createHash('sha256').update(expected).digest('hex');
    if (
      record.byteLength !== expected.byteLength ||
      record.sha256 !== expectedHash
    ) {
      throw new ReleaseCandidateError(
        'UNSAFE_OUTPUT_DIRECTORY',
        'Release output writer record differs from the requested contents.'
      );
    }
  }
  return record;
}

function parseExclusiveOutputRecord(
  source: string,
  expectedFileName: string
): ExclusiveOutputRecord {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output writer did not return one valid file record.'
    );
  }
  const expectedKeys = [
    'byteLength',
    'changeTimeNanoseconds',
    'device',
    'fileName',
    'inode',
    'modificationTimeNanoseconds',
    'sha256',
  ].sort();
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join('\0') !== expectedKeys.join('\0')
  ) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output writer did not return one valid file record.'
    );
  }
  const byteLength = Reflect.get(value, 'byteLength');
  const changeTimeNanoseconds = Reflect.get(value, 'changeTimeNanoseconds');
  const device = Reflect.get(value, 'device');
  const fileName = Reflect.get(value, 'fileName');
  const inode = Reflect.get(value, 'inode');
  const modificationTimeNanoseconds = Reflect.get(
    value,
    'modificationTimeNanoseconds'
  );
  const sha256 = Reflect.get(value, 'sha256');
  if (
    !Number.isSafeInteger(byteLength) ||
    Number(byteLength) < 0 ||
    typeof changeTimeNanoseconds !== 'string' ||
    !/^\d+$/.test(changeTimeNanoseconds) ||
    !Number.isSafeInteger(device) ||
    Number(device) < 0 ||
    fileName !== expectedFileName ||
    !Number.isSafeInteger(inode) ||
    Number(inode) < 0 ||
    typeof modificationTimeNanoseconds !== 'string' ||
    !/^\d+$/.test(modificationTimeNanoseconds) ||
    typeof sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(sha256)
  ) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output writer did not return one valid file record.'
    );
  }
  return {
    byteLength: Number(byteLength),
    changeTimeNanoseconds,
    device: Number(device),
    fileName,
    inode: Number(inode),
    modificationTimeNanoseconds,
    sha256,
  };
}

async function pipeCommandToExclusiveFile(
  command: readonly string[],
  transaction: SafeOutputTransaction,
  fileName: string
): Promise<ExclusiveOutputRecord> {
  return runExclusiveOutputWriter(transaction, fileName, { command });
}

async function writeExclusiveFile(
  transaction: SafeOutputTransaction,
  fileName: string,
  contents: string | Uint8Array
): Promise<ExclusiveOutputRecord> {
  return runExclusiveOutputWriter(transaction, fileName, { contents });
}

interface SourceReleaseInventory {
  readonly paths: readonly string[];
  readonly binaryAssets: Readonly<Record<string, string>>;
}

function invalidSourceReleaseInventory(): ReleaseCandidateError {
  return new ReleaseCandidateError(
    'FORBIDDEN_RELEASE_PATH',
    'Release tree does not match the reviewed source inventory.'
  );
}

async function readSourceReleaseInventory(
  repositoryRoot: string,
  commit: string,
  trackedPaths: readonly string[]
): Promise<SourceReleaseInventory> {
  let value: unknown;
  try {
    value = JSON.parse(
      await runCommand(
        ['git', 'show', `${commit}:scripts/source-release-inventory.json`],
        repositoryRoot
      )
    );
  } catch {
    throw invalidSourceReleaseInventory();
  }
  const paths = isRecord(value) ? Reflect.get(value, 'paths') : undefined;
  const binaryAssets = isRecord(value)
    ? Reflect.get(value, 'binaryAssets')
    : undefined;
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join('\0') !==
      ['binaryAssets', 'paths', 'schemaVersion'].join('\0') ||
    Reflect.get(value, 'schemaVersion') !== 1 ||
    !Array.isArray(paths) ||
    paths.some((trackedPath) => typeof trackedPath !== 'string') ||
    !isRecord(binaryAssets)
  ) {
    throw invalidSourceReleaseInventory();
  }
  const reviewedPaths = [...paths].sort();
  if (
    new Set(reviewedPaths).size !== reviewedPaths.length ||
    reviewedPaths.join('\0') !== [...trackedPaths].sort().join('\0')
  ) {
    throw invalidSourceReleaseInventory();
  }
  const binaryEntries = Object.entries(binaryAssets);
  if (
    binaryEntries.some(
      ([binaryPath, sha256]) =>
        !reviewedPaths.includes(binaryPath) ||
        !binaryPath.startsWith('assets/') ||
        typeof sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(sha256)
    )
  ) {
    throw invalidSourceReleaseInventory();
  }
  return {
    paths: reviewedPaths,
    binaryAssets: binaryAssets as Readonly<Record<string, string>>,
  };
}

async function readGitBlobSize(
  repositoryRoot: string,
  commit: string,
  trackedPath: string
): Promise<number> {
  const source = (
    await runCommand(
      ['git', 'cat-file', '-s', `${commit}:${trackedPath}`],
      repositoryRoot
    )
  ).trim();
  const size = Number(source);
  if (!/^\d+$/.test(source) || !Number.isSafeInteger(size)) {
    throw new ReleaseCandidateError(
      'FORBIDDEN_RELEASE_CONTENT',
      'Release tree contains an invalid blob size.'
    );
  }
  return size;
}

function validateReleaseBlob(
  contents: Uint8Array,
  expectedBinaryHash: string | undefined
): void {
  assertNoKnownSecretContent([new TextDecoder().decode(contents)]);
  let text: string | undefined;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    text = undefined;
  }
  const isReviewedText = text !== undefined && !text.includes('\0');
  if (isReviewedText && expectedBinaryHash === undefined) return;
  const actualBinaryHash = createHash('sha256').update(contents).digest('hex');
  if (
    isReviewedText ||
    expectedBinaryHash === undefined ||
    actualBinaryHash !== expectedBinaryHash
  ) {
    throw invalidSourceReleaseInventory();
  }
}

async function validateReleaseTreeContents(
  repositoryRoot: string,
  commit: string,
  trackedPaths: readonly string[]
): Promise<void> {
  const inventory = await readSourceReleaseInventory(
    repositoryRoot,
    commit,
    trackedPaths
  );
  let totalBytes = 0;
  const blobSizes = new Map<string, number>();
  for (const trackedPath of inventory.paths) {
    const size = await readGitBlobSize(repositoryRoot, commit, trackedPath);
    totalBytes += size;
    if (size > MAX_RELEASE_FILE_BYTES || totalBytes > MAX_RELEASE_TREE_BYTES) {
      throw new ReleaseCandidateError(
        'FORBIDDEN_RELEASE_CONTENT',
        'Release tree exceeds the reviewed source size limits.'
      );
    }
    blobSizes.set(trackedPath, size);
  }
  for (const trackedPath of inventory.paths) {
    const contents = await runCommandBytes(
      ['git', 'cat-file', 'blob', `${commit}:${trackedPath}`],
      repositoryRoot
    );
    if (contents.byteLength !== blobSizes.get(trackedPath)) {
      throw new ReleaseCandidateError(
        'FORBIDDEN_RELEASE_CONTENT',
        'Release tree changed while its contents were being reviewed.'
      );
    }
    validateReleaseBlob(contents, inventory.binaryAssets[trackedPath]);
  }
}

async function readRefPackage(
  repositoryRoot: string,
  commit: string
): Promise<PackageMetadata> {
  const source = await runCommand(
    ['git', 'show', `${commit}:package.json`],
    repositoryRoot
  );
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'The release ref package.json is not valid JSON.'
    );
  }
  if (!isRecord(value)) {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'The release ref package.json must be an object.'
    );
  }
  const { name, version, license } = value;
  const dependencies = dependencyRecord(Reflect.get(value, 'dependencies'));
  const devDependencies = dependencyRecord(
    Reflect.get(value, 'devDependencies')
  );
  if (
    typeof name !== 'string' ||
    name !== 'tenkacloud-passport' ||
    typeof version !== 'string' ||
    typeof license !== 'string' ||
    license.length === 0
  ) {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'The release ref package metadata is incomplete.'
    );
  }
  return { name, version, license, dependencies, devDependencies };
}

function dependencyRecord(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'Package dependencies must be an object.'
    );
  }
  const entries = Object.entries(value);
  if (entries.some(([, range]) => typeof range !== 'string')) {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'Package dependency ranges must be strings.'
    );
  }
  return Object.fromEntries(entries) as Readonly<Record<string, string>>;
}

export interface DirectoryIdentity {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
}

interface SafeOutputTransaction {
  readonly requestedPath: string;
  readonly parent: DirectoryIdentity;
  readonly parentHandle: FileHandle;
  readonly staging: DirectoryIdentity;
  readonly handle: FileHandle;
  readonly inspectionPath: string;
  readonly createdFiles: Map<string, ExclusiveOutputRecord>;
}

function fileSystemErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : undefined;
}

async function assertPathDoesNotExist(outputDirectory: string): Promise<void> {
  try {
    await lstat(outputDirectory);
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output must not already exist.'
    );
  } catch (error) {
    if (error instanceof ReleaseCandidateError) throw error;
    if (fileSystemErrorCode(error) !== 'ENOENT') {
      throw new ReleaseCandidateError(
        'UNSAFE_OUTPUT_DIRECTORY',
        'Release output path cannot be inspected safely.'
      );
    }
  }
}

async function openDirectoryIdentity(directoryPath: string): Promise<{
  readonly identity: DirectoryIdentity;
  readonly handle: FileHandle;
}> {
  let handle: FileHandle | undefined;
  try {
    const status = await lstat(directoryPath);
    handle = await open(
      directoryPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const descriptorStatus = await handle.stat();
    if (
      status.isSymbolicLink() ||
      !status.isDirectory() ||
      status.dev !== descriptorStatus.dev ||
      status.ino !== descriptorStatus.ino
    ) {
      throw new Error();
    }
    return {
      identity: {
        path: directoryPath,
        device: status.dev,
        inode: status.ino,
      },
      handle,
    };
  } catch (error) {
    if (handle !== undefined) await handle.close();
    throw error;
  }
}

async function openSafeExistingDirectory(directoryPath: string): Promise<{
  readonly identity: DirectoryIdentity;
  readonly handle: FileHandle;
}> {
  const absoluteDirectory = path.resolve(directoryPath);
  const parentPath = path.dirname(absoluteDirectory);
  try {
    const [parentStatus, resolvedParent, directoryStatus, resolvedDirectory] =
      await Promise.all([
        lstat(parentPath),
        realpath(parentPath),
        lstat(absoluteDirectory),
        realpath(absoluteDirectory),
      ]);
    if (
      parentStatus.isSymbolicLink() ||
      !parentStatus.isDirectory() ||
      resolvedParent !== parentPath ||
      directoryStatus.isSymbolicLink() ||
      !directoryStatus.isDirectory() ||
      resolvedDirectory !== absoluteDirectory
    ) {
      throw new Error();
    }
    const opened = await openDirectoryIdentity(absoluteDirectory);
    if (
      opened.identity.device !== directoryStatus.dev ||
      opened.identity.inode !== directoryStatus.ino
    ) {
      await opened.handle.close();
      throw new Error();
    }
    return opened;
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release candidate directory and its ancestors must not use symbolic links.'
    );
  }
}

async function assertOpenedDirectoryPathIdentity(
  directory: DirectoryIdentity,
  handle: FileHandle
): Promise<void> {
  try {
    const [status, resolved, descriptorStatus] = await Promise.all([
      lstat(directory.path),
      realpath(directory.path),
      handle.stat(),
    ]);
    if (
      status.isSymbolicLink() ||
      !status.isDirectory() ||
      resolved !== directory.path ||
      status.dev !== directory.device ||
      status.ino !== directory.inode ||
      descriptorStatus.dev !== directory.device ||
      descriptorStatus.ino !== directory.inode
    ) {
      throw new Error();
    }
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release candidate directory identity changed during validation.'
    );
  }
}

async function createSafeOutputTransaction(
  outputDirectory: string
): Promise<SafeOutputTransaction> {
  await assertPathDoesNotExist(outputDirectory);
  const parent = path.dirname(outputDirectory);
  let parentStatus: Awaited<ReturnType<typeof lstat>>;
  let resolvedParent: string;
  try {
    [parentStatus, resolvedParent] = await Promise.all([
      lstat(parent),
      realpath(parent),
    ]);
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output parent must be an existing real directory.'
    );
  }
  if (parentStatus.isSymbolicLink() || !parentStatus.isDirectory()) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output parent must not traverse a symbolic link.'
    );
  }
  if (resolvedParent !== parent) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output ancestors must not traverse symbolic links.'
    );
  }
  let openedParent: Awaited<ReturnType<typeof openDirectoryIdentity>>;
  try {
    openedParent = await openDirectoryIdentity(resolvedParent);
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output parent could not be opened safely.'
    );
  }
  if (
    openedParent.identity.device !== parentStatus.dev ||
    openedParent.identity.inode !== parentStatus.ino
  ) {
    await openedParent.handle.close();
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output parent identity changed before staging.'
    );
  }
  let stagingPath: string;
  try {
    stagingPath = await mkdtemp(
      path.join(resolvedParent, '.tenkacloud-passport-release-')
    );
  } catch {
    await openedParent.handle.close();
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release staging directory could not be created safely.'
    );
  }
  try {
    const { identity, handle } = await openDirectoryIdentity(stagingPath);
    return {
      requestedPath: outputDirectory,
      parent: openedParent.identity,
      parentHandle: openedParent.handle,
      staging: identity,
      handle,
      inspectionPath: stagingPath,
      createdFiles: new Map(),
    };
  } catch {
    await openedParent.handle.close();
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release staging directory could not be opened safely.'
    );
  }
}

async function assertDirectoryIdentity(
  transaction: SafeOutputTransaction
): Promise<void> {
  try {
    const [
      parentStatus,
      resolvedParent,
      parentDescriptorStatus,
      stagingStatus,
      descriptorStatus,
    ] = await Promise.all([
      lstat(transaction.parent.path),
      realpath(transaction.parent.path),
      transaction.parentHandle.stat(),
      lstat(transaction.staging.path),
      transaction.handle.stat(),
    ]);
    if (
      parentStatus.isSymbolicLink() ||
      !parentStatus.isDirectory() ||
      resolvedParent !== transaction.parent.path ||
      parentStatus.dev !== transaction.parent.device ||
      parentStatus.ino !== transaction.parent.inode ||
      parentDescriptorStatus.dev !== transaction.parent.device ||
      parentDescriptorStatus.ino !== transaction.parent.inode ||
      stagingStatus.isSymbolicLink() ||
      !stagingStatus.isDirectory() ||
      stagingStatus.dev !== transaction.staging.device ||
      stagingStatus.ino !== transaction.staging.inode ||
      descriptorStatus.dev !== transaction.staging.device ||
      descriptorStatus.ino !== transaction.staging.inode
    ) {
      throw new Error();
    }
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output directory identity changed during generation.'
    );
  }
}

async function writeOutputExclusive(
  transaction: SafeOutputTransaction,
  fileName: string,
  contents: string | Uint8Array
): Promise<void> {
  await assertDirectoryIdentity(transaction);
  const record = await writeExclusiveFile(transaction, fileName, contents);
  recordCreatedFile(transaction, fileName, record);
  await assertDirectoryIdentity(transaction);
  await assertRecordedOutputFiles(transaction);
}

async function streamOutputExclusive(
  transaction: SafeOutputTransaction,
  fileName: string,
  command: readonly string[]
): Promise<void> {
  await assertDirectoryIdentity(transaction);
  const record = await pipeCommandToExclusiveFile(
    command,
    transaction,
    fileName
  );
  recordCreatedFile(transaction, fileName, record);
  await assertDirectoryIdentity(transaction);
  await assertRecordedOutputFiles(transaction);
}

function recordCreatedFile(
  transaction: SafeOutputTransaction,
  fileName: string,
  record: ExclusiveOutputRecord
): void {
  if (record.fileName !== fileName || transaction.createdFiles.has(fileName)) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output writer did not create one unique regular file.'
    );
  }
  transaction.createdFiles.set(fileName, record);
}

async function assertRecordedOutputFiles(
  transaction: SafeOutputTransaction
): Promise<void> {
  if (transaction.createdFiles.size === 0) return;
  try {
    await assertRegularFileIdentitiesNoFollowAt(transaction.handle.fd, [
      ...transaction.createdFiles.values(),
    ]);
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output no longer names the file closed by its writer.'
    );
  }
}

function sameRecordedOutputHash(
  expected: ExclusiveOutputRecord,
  actual: DescriptorRelativeFileHash
): boolean {
  return (
    expected.byteLength === actual.byteLength &&
    expected.changeTimeNanoseconds === actual.changeTimeNanoseconds &&
    expected.device === actual.device &&
    expected.inode === actual.inode &&
    expected.modificationTimeNanoseconds ===
      actual.modificationTimeNanoseconds &&
    expected.sha256 === actual.sha256
  );
}

async function recordedOutputReleaseFile(
  transaction: SafeOutputTransaction,
  fileName: string,
  maximumBytes: number
): Promise<ReleaseFile> {
  const expected = transaction.createdFiles.get(fileName);
  if (expected === undefined) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output was not created by the retained writer boundary.'
    );
  }
  let actual: DescriptorRelativeFileHash;
  try {
    actual = await hashRegularFileNoFollowAt(
      transaction.handle.fd,
      fileName,
      maximumBytes
    );
  } catch {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output could not be rebound to its writer record.'
    );
  }
  if (!sameRecordedOutputHash(expected, actual)) {
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Release output differs from the file closed by its writer.'
    );
  }
  return {
    fileName,
    sha256: actual.sha256,
    byteLength: actual.byteLength,
  };
}

export interface RecordedOutputCleanup {
  readonly parent: DirectoryIdentity;
  readonly parentHandle: FileHandle;
  readonly directory: DirectoryIdentity;
  readonly handle: FileHandle;
  readonly files: readonly {
    readonly fileName: string;
    readonly device: number;
    readonly inode: number;
  }[];
}

async function cleanupDirectoryIdentityMatches(
  cleanup: RecordedOutputCleanup
): Promise<boolean> {
  try {
    const [parentDescriptorStatus, descriptorStatus] = await Promise.all([
      cleanup.parentHandle.stat(),
      cleanup.handle.stat(),
    ]);
    return (
      parentDescriptorStatus.dev === cleanup.parent.device &&
      parentDescriptorStatus.ino === cleanup.parent.inode &&
      descriptorStatus.dev === cleanup.directory.device &&
      descriptorStatus.ino === cleanup.directory.inode
    );
  } catch (error) {
    void error;
    return false;
  }
}

async function closeCleanupHandle(handle: FileHandle): Promise<boolean> {
  try {
    await handle.close();
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

async function quarantineFailedOutputDirectory(
  cleanup: RecordedOutputCleanup
): Promise<boolean> {
  try {
    await atomicRenameDirectoryNoReplace(
      cleanup.parentHandle.fd,
      path.basename(cleanup.directory.path),
      `.tenkacloud-passport-failed-${randomUUID()}`,
      {
        device: cleanup.directory.device,
        inode: cleanup.directory.inode,
      }
    );
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

export async function cleanupRecordedOutputDirectory(
  cleanup: RecordedOutputCleanup
): Promise<boolean> {
  if (!(await cleanupDirectoryIdentityMatches(cleanup))) {
    await Promise.all([
      closeCleanupHandle(cleanup.handle),
      closeCleanupHandle(cleanup.parentHandle),
    ]);
    return false;
  }
  const quarantined = await quarantineFailedOutputDirectory(cleanup);
  const closed = await Promise.all([
    closeCleanupHandle(cleanup.handle),
    closeCleanupHandle(cleanup.parentHandle),
  ]);
  return quarantined && closed.every((result) => result);
}

async function cleanupSafeOutput(
  transaction: SafeOutputTransaction
): Promise<boolean> {
  const stagingClean = await cleanupRecordedOutputDirectory({
    parent: transaction.parent,
    parentHandle: transaction.parentHandle,
    directory: transaction.staging,
    handle: transaction.handle,
    files: [...transaction.createdFiles.entries()].map(
      ([fileName, identity]) => ({
        fileName,
        device: identity.device,
        inode: identity.inode,
      })
    ),
  });
  return stagingClean;
}

async function publishSafeOutput(
  transaction: SafeOutputTransaction,
  version: string
): Promise<void> {
  const stagingName = path.basename(transaction.staging.path);
  const outputName = path.basename(transaction.requestedPath);
  await assertDirectoryIdentity(transaction);
  await assertRecordedOutputFiles(transaction);
  await atomicRenameDirectoryNoReplace(
    transaction.parentHandle.fd,
    stagingName,
    outputName,
    {
      device: transaction.staging.device,
      inode: transaction.staging.inode,
    }
  );
  let requestedPathMatches = false;
  try {
    const [
      parentStatus,
      resolvedParent,
      outputStatus,
      resolvedOutput,
      parentDescriptorStatus,
      descriptorStatus,
    ] = await Promise.all([
      lstat(transaction.parent.path),
      realpath(transaction.parent.path),
      lstat(transaction.requestedPath),
      realpath(transaction.requestedPath),
      transaction.parentHandle.stat(),
      transaction.handle.stat(),
    ]);
    requestedPathMatches =
      !parentStatus.isSymbolicLink() &&
      parentStatus.isDirectory() &&
      resolvedParent === transaction.parent.path &&
      parentStatus.dev === transaction.parent.device &&
      parentStatus.ino === transaction.parent.inode &&
      !outputStatus.isSymbolicLink() &&
      outputStatus.isDirectory() &&
      resolvedOutput === transaction.requestedPath &&
      outputStatus.dev === transaction.staging.device &&
      outputStatus.ino === transaction.staging.inode &&
      parentDescriptorStatus.dev === transaction.parent.device &&
      parentDescriptorStatus.ino === transaction.parent.inode &&
      descriptorStatus.dev === transaction.staging.device &&
      descriptorStatus.ino === transaction.staging.inode;
  } catch (error) {
    void error;
  }
  if (!requestedPathMatches) {
    try {
      await atomicRenameDirectoryNoReplace(
        transaction.parentHandle.fd,
        outputName,
        stagingName,
        {
          device: transaction.staging.device,
          inode: transaction.staging.inode,
        }
      );
    } catch {
      throw new ReleaseCandidateError(
        'UNSAFE_OUTPUT_DIRECTORY',
        'Published Output path changed and descriptor-relative rollback failed.'
      );
    }
    throw new ReleaseCandidateError(
      'UNSAFE_OUTPUT_DIRECTORY',
      'Published Output path changed and was rolled back safely.'
    );
  }
  try {
    await assertRecordedOutputFiles(transaction);
    await validateOpenedSourceReleaseDirectory(
      {
        handle: transaction.handle,
        identity: {
          path: transaction.requestedPath,
          device: transaction.staging.device,
          inode: transaction.staging.inode,
        },
      },
      version
    );
    await assertRecordedOutputFiles(transaction);
  } catch (error) {
    try {
      await atomicRenameDirectoryNoReplace(
        transaction.parentHandle.fd,
        outputName,
        stagingName,
        {
          device: transaction.staging.device,
          inode: transaction.staging.inode,
        }
      );
    } catch {
      throw new ReleaseCandidateError(
        'UNSAFE_OUTPUT_DIRECTORY',
        'Published Output verification failed and descriptor-relative rollback was not possible.'
      );
    }
    throw error;
  }
  try {
    await transaction.handle.close();
  } catch (error) {
    void error;
  }
  try {
    await transaction.parentHandle.close();
  } catch (error) {
    void error;
  }
}

async function readReviewedDirectDependencies(
  repositoryRoot: string,
  commit: string,
  metadata: PackageMetadata,
  lockedPackages: readonly LockedPackage[]
): Promise<readonly DirectDependency[]> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      await runCommand(
        ['git', 'show', `${commit}:scripts/direct-dependency-licenses.json`],
        repositoryRoot
      )
    );
  } catch (error) {
    if (error instanceof ReleaseCandidateError) throw error;
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'Reviewed dependency license manifest is invalid.'
    );
  }
  const reviewedPackages = isRecord(manifest)
    ? Reflect.get(manifest, 'packages')
    : undefined;
  if (
    !isRecord(manifest) ||
    Reflect.get(manifest, 'schemaVersion') !== 1 ||
    !isRecord(reviewedPackages)
  ) {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'Reviewed dependency license manifest is invalid.'
    );
  }
  const scopes = new Map<string, DirectDependency['scope']>([
    ...Object.keys(metadata.dependencies).map(
      (name) => [name, 'runtime'] as const
    ),
    ...Object.keys(metadata.devDependencies).map(
      (name) => [name, 'development'] as const
    ),
  ]);
  const names = [...scopes.keys()].sort();
  if (Object.keys(reviewedPackages).sort().join('\0') !== names.join('\0')) {
    throw new ReleaseCandidateError(
      'INVALID_PACKAGE_METADATA',
      'Reviewed dependency licenses must exactly cover direct dependencies.'
    );
  }
  return names.map((name) => {
    const scope = scopes.get(name);
    const lockedPackage = lockedPackages.find((item) => item.lockKey === name);
    const reviewed = Reflect.get(reviewedPackages, name);
    const reviewedVersion = isRecord(reviewed)
      ? Reflect.get(reviewed, 'version')
      : undefined;
    const reviewedLicense = isRecord(reviewed)
      ? Reflect.get(reviewed, 'license')
      : undefined;
    if (
      scope === undefined ||
      lockedPackage === undefined ||
      lockedPackage.name !== name ||
      typeof reviewedVersion !== 'string' ||
      reviewedVersion !== lockedPackage.version ||
      typeof reviewedLicense !== 'string' ||
      reviewedLicense.length === 0
    ) {
      throw new ReleaseCandidateError(
        'INVALID_PACKAGE_METADATA',
        `Reviewed dependency does not match the top-level lock resolution: ${name}`
      );
    }
    return {
      lockKey: lockedPackage.lockKey,
      name,
      version: reviewedVersion,
      scope,
      license: reviewedLicense,
    };
  });
}

function spdxId(
  item: Pick<LockedPackage, 'lockKey' | 'name' | 'version' | 'sha512'>
): string {
  return `SPDXRef-Package-${createHash('sha256')
    .update(`${item.lockKey}\0${item.name}@${item.version}\0${item.sha512}`)
    .digest('hex')
    .slice(0, 20)}`;
}

function npmPurl(name: string, version: string): string {
  const encodedName = name.startsWith('@')
    ? `${encodeURIComponent(name.slice(0, name.indexOf('/')))}/${encodeURIComponent(
        name.slice(name.indexOf('/') + 1)
      )}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function createSpdxDocument(input: {
  readonly version: string;
  readonly commit: string;
  readonly createdAt: string;
  readonly archive: ReleaseFile;
  readonly project: PackageMetadata;
  readonly lockedPackages: readonly LockedPackage[];
  readonly directDependencies: readonly DirectDependency[];
}): string {
  const rootId = SPDX_ROOT_PACKAGE_ID;
  const licenseByPackage = new Map(
    input.directDependencies.map((dependency) => [
      `${dependency.name}@${dependency.version}`,
      dependency.license,
    ])
  );
  const packages = input.lockedPackages.map((item) => ({
    name: item.name,
    SPDXID: spdxId(item),
    versionInfo: item.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared:
      licenseByPackage.get(`${item.name}@${item.version}`) ?? 'NOASSERTION',
    checksums: [{ algorithm: 'SHA512', checksumValue: item.sha512 }],
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: npmPurl(item.name, item.version),
      },
    ],
  }));
  const directLockKeys = new Set(
    input.directDependencies.map(({ lockKey }) => lockKey)
  );
  const directIds = new Set(
    input.lockedPackages
      .filter(({ lockKey }) => directLockKeys.has(lockKey))
      .map(spdxId)
  );
  const relationships = [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: rootId,
    },
    ...packages
      .filter(({ SPDXID }) => directIds.has(SPDXID))
      .map(({ SPDXID }) => ({
        spdxElementId: rootId,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: SPDXID,
      })),
  ];
  const document = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `TenkaCloud Passport ${input.version} Source Release`,
    documentNamespace: `https://github.com/susumutomita/TenkaCloudPassport/releases/tag/v${input.version}/spdx/${input.commit}`,
    creationInfo: {
      created: input.createdAt,
      creators: [SPDX_CREATOR],
    },
    packages: [
      {
        name: input.project.name,
        SPDXID: rootId,
        versionInfo: input.version,
        packageFileName: input.archive.fileName,
        downloadLocation: `git+https://github.com/susumutomita/TenkaCloudPassport.git@${input.commit}`,
        filesAnalyzed: false,
        licenseConcluded: input.project.license,
        licenseDeclared: input.project.license,
        checksums: [
          { algorithm: 'SHA256', checksumValue: input.archive.sha256 },
        ],
      },
      ...packages,
    ],
    relationships,
  };
  validateSpdxDocument(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean {
  return Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function isValidSpdxChecksum(value: unknown, algorithm: string): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['algorithm', 'checksumValue'])
  ) {
    return false;
  }
  const checksumValue = Reflect.get(value, 'checksumValue');
  const pattern = algorithm === 'SHA256' ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{128}$/;
  return (
    Reflect.get(value, 'algorithm') === algorithm &&
    typeof checksumValue === 'string' &&
    pattern.test(checksumValue)
  );
}

function isValidRootSpdxPackage(
  value: Record<string, unknown>,
  name: string,
  downloadLocation: string
): boolean {
  const packageFileName = Reflect.get(value, 'packageFileName');
  return (
    typeof packageFileName === 'string' &&
    /^tenkacloud-passport-[0-9A-Za-z.+-]+\.tar\.gz$/.test(packageFileName) &&
    name === 'tenkacloud-passport' &&
    /^git\+https:\/\/github\.com\/susumutomita\/TenkaCloudPassport\.git@[0-9a-f]{40}$/.test(
      downloadLocation
    )
  );
}

function isValidNpmSpdxPackage(
  value: Record<string, unknown>,
  identifier: string,
  name: string,
  versionInfo: string,
  downloadLocation: string
): boolean {
  const externalRefs = Reflect.get(value, 'externalRefs');
  const externalRef = Array.isArray(externalRefs) ? externalRefs[0] : undefined;
  return (
    /^SPDXRef-Package-[0-9a-f]{20}$/.test(identifier) &&
    isCanonicalNpmPackageName(name) &&
    isStrictSemver(versionInfo) &&
    downloadLocation === 'NOASSERTION' &&
    Array.isArray(externalRefs) &&
    externalRefs.length === 1 &&
    isRecord(externalRef) &&
    hasExactKeys(externalRef, [
      'referenceCategory',
      'referenceLocator',
      'referenceType',
    ]) &&
    Reflect.get(externalRef, 'referenceCategory') === 'PACKAGE-MANAGER' &&
    Reflect.get(externalRef, 'referenceType') === 'purl' &&
    Reflect.get(externalRef, 'referenceLocator') === npmPurl(name, versionInfo)
  );
}

function addSpdxPackageIdentifier(
  value: unknown,
  identifiers: Set<string>
): boolean {
  if (!isRecord(value)) return false;
  const identifier = Reflect.get(value, 'SPDXID');
  const name = Reflect.get(value, 'name');
  const versionInfo = Reflect.get(value, 'versionInfo');
  const downloadLocation = Reflect.get(value, 'downloadLocation');
  const licenseConcluded = Reflect.get(value, 'licenseConcluded');
  const licenseDeclared = Reflect.get(value, 'licenseDeclared');
  const checksums = Reflect.get(value, 'checksums');
  const isRoot = identifier === SPDX_ROOT_PACKAGE_ID;
  const expectedKeys = isRoot
    ? [
        'SPDXID',
        'checksums',
        'downloadLocation',
        'filesAnalyzed',
        'licenseConcluded',
        'licenseDeclared',
        'name',
        'packageFileName',
        'versionInfo',
      ]
    : [
        'SPDXID',
        'checksums',
        'downloadLocation',
        'externalRefs',
        'filesAnalyzed',
        'licenseConcluded',
        'licenseDeclared',
        'name',
        'versionInfo',
      ];
  if (
    !hasExactKeys(value, expectedKeys) ||
    typeof identifier !== 'string' ||
    identifier.length === 0 ||
    identifiers.has(identifier) ||
    typeof name !== 'string' ||
    name.length === 0 ||
    typeof versionInfo !== 'string' ||
    versionInfo.length === 0 ||
    typeof downloadLocation !== 'string' ||
    downloadLocation.length === 0 ||
    Reflect.get(value, 'filesAnalyzed') !== false ||
    typeof licenseConcluded !== 'string' ||
    !ALLOWED_SPDX_LICENSE_EXPRESSIONS.has(licenseConcluded) ||
    typeof licenseDeclared !== 'string' ||
    !ALLOWED_SPDX_LICENSE_EXPRESSIONS.has(licenseDeclared) ||
    !Array.isArray(checksums) ||
    checksums.length !== 1 ||
    !isValidSpdxChecksum(checksums[0], isRoot ? 'SHA256' : 'SHA512')
  ) {
    return false;
  }
  const packageValid = isRoot
    ? isValidRootSpdxPackage(value, name, downloadLocation)
    : isValidNpmSpdxPackage(
        value,
        identifier,
        name,
        versionInfo,
        downloadLocation
      );
  if (!packageValid) {
    return false;
  }
  identifiers.add(identifier);
  return true;
}

function isValidSpdxRelationship(
  value: unknown,
  identifiers: ReadonlySet<string>,
  relationshipKeys: Set<string>
): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'relatedSpdxElement',
      'relationshipType',
      'spdxElementId',
    ])
  ) {
    return false;
  }
  const source = Reflect.get(value, 'spdxElementId');
  const target = Reflect.get(value, 'relatedSpdxElement');
  const relationshipType = Reflect.get(value, 'relationshipType');
  if (
    typeof source !== 'string' ||
    typeof target !== 'string' ||
    typeof relationshipType !== 'string' ||
    !identifiers.has(source) ||
    !identifiers.has(target) ||
    source === target ||
    !(
      (relationshipType === 'DESCRIBES' &&
        source === 'SPDXRef-DOCUMENT' &&
        target === SPDX_ROOT_PACKAGE_ID) ||
      (relationshipType === 'DEPENDS_ON' &&
        source === SPDX_ROOT_PACKAGE_ID &&
        target !== 'SPDXRef-DOCUMENT')
    )
  ) {
    return false;
  }
  const key = `${source}\0${relationshipType}\0${target}`;
  if (relationshipKeys.has(key)) return false;
  relationshipKeys.add(key);
  return true;
}

export function validateSpdxDocument(value: unknown): void {
  const document = isRecord(value) ? value : undefined;
  const packageValues =
    document === undefined ? undefined : Reflect.get(document, 'packages');
  const relationshipValues =
    document === undefined ? undefined : Reflect.get(document, 'relationships');
  const packages = Array.isArray(packageValues) ? packageValues : [];
  const relationships = Array.isArray(relationshipValues)
    ? relationshipValues
    : [];
  const identifiers = new Set<string>(['SPDXRef-DOCUMENT']);
  const creationInfo =
    document === undefined ? undefined : Reflect.get(document, 'creationInfo');
  const creators = isRecord(creationInfo)
    ? Reflect.get(creationInfo, 'creators')
    : undefined;
  const relationshipKeys = new Set<string>();
  const namespaceMatch =
    document === undefined
      ? null
      : /^https:\/\/github\.com\/susumutomita\/TenkaCloudPassport\/releases\/tag\/v([^/]+)\/spdx\/([0-9a-f]{40})$/.exec(
          String(Reflect.get(document, 'documentNamespace'))
        );
  const rootPackage = packages.find(
    (item) =>
      isRecord(item) && Reflect.get(item, 'SPDXID') === SPDX_ROOT_PACKAGE_ID
  );
  const packagesValid = packages.every((item) =>
    addSpdxPackageIdentifier(item, identifiers)
  );
  const relationshipsValid = relationships.every((item) =>
    isValidSpdxRelationship(item, identifiers, relationshipKeys)
  );
  const valid =
    document !== undefined &&
    hasExactKeys(document, [
      'SPDXID',
      'creationInfo',
      'dataLicense',
      'documentNamespace',
      'name',
      'packages',
      'relationships',
      'spdxVersion',
    ]) &&
    Reflect.get(document, 'spdxVersion') === 'SPDX-2.3' &&
    Reflect.get(document, 'dataLicense') === 'CC0-1.0' &&
    Reflect.get(document, 'SPDXID') === 'SPDXRef-DOCUMENT' &&
    Reflect.get(document, 'name') ===
      `TenkaCloud Passport ${namespaceMatch?.[1] ?? ''} Source Release` &&
    namespaceMatch !== null &&
    isRecord(creationInfo) &&
    hasExactKeys(creationInfo, ['created', 'creators']) &&
    isCanonicalTimestamp(Reflect.get(creationInfo, 'created')) &&
    Array.isArray(creators) &&
    creators.length === 1 &&
    creators[0] === SPDX_CREATOR &&
    packages.length > 0 &&
    relationships.length > 0 &&
    packagesValid &&
    identifiers.has(SPDX_ROOT_PACKAGE_ID) &&
    isRecord(rootPackage) &&
    Reflect.get(rootPackage, 'versionInfo') === namespaceMatch[1] &&
    Reflect.get(rootPackage, 'downloadLocation') ===
      `git+https://github.com/susumutomita/TenkaCloudPassport.git@${namespaceMatch[2]}` &&
    relationshipsValid &&
    relationships.filter(
      (item) =>
        isRecord(item) && Reflect.get(item, 'relationshipType') === 'DESCRIBES'
    ).length === 1;
  if (!valid) {
    throw new ReleaseCandidateError(
      'INVALID_SBOM',
      'Generated SPDX document is internally inconsistent.'
    );
  }
}

function isValidReleaseFile(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['byteLength', 'fileName', 'sha256'])
  ) {
    return false;
  }
  const fileName = Reflect.get(value, 'fileName');
  const sha256 = Reflect.get(value, 'sha256');
  const byteLength = Reflect.get(value, 'byteLength');
  return (
    typeof fileName === 'string' &&
    path.basename(fileName) === fileName &&
    fileName.length > 0 &&
    typeof sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(sha256) &&
    typeof byteLength === 'number' &&
    Number.isSafeInteger(byteLength) &&
    byteLength > 0
  );
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function validateReleaseManifest(value: unknown): void {
  const manifest = isRecord(value) ? value : undefined;
  const version =
    manifest === undefined ? undefined : Reflect.get(manifest, 'version');
  const commitTimestamp =
    manifest === undefined
      ? undefined
      : Reflect.get(manifest, 'commitTimestamp');
  const fileValues =
    manifest === undefined ? undefined : Reflect.get(manifest, 'files');
  const binaryArtifacts =
    manifest === undefined
      ? undefined
      : Reflect.get(manifest, 'binaryArtifacts');
  const excludedCategories =
    manifest === undefined
      ? undefined
      : Reflect.get(manifest, 'excludedCategories');
  const files = Array.isArray(fileValues) ? fileValues : [];
  const fileNames = files
    .filter(isRecord)
    .map((file) => Reflect.get(file, 'fileName'));
  const expectedFileNames =
    typeof version === 'string'
      ? [
          'LICENSE',
          'THIRD_PARTY_NOTICES.md',
          `tenkacloud-passport-${version}.spdx.json`,
          `tenkacloud-passport-${version}.tar.gz`,
        ].sort()
      : [];
  const valid =
    manifest !== undefined &&
    hasExactKeys(manifest, [
      'artifactKind',
      'binaryArtifacts',
      'commit',
      'commitTimestamp',
      'excludedCategories',
      'files',
      'releaseStatus',
      'schemaVersion',
      'version',
    ]) &&
    Reflect.get(manifest, 'schemaVersion') === 1 &&
    typeof version === 'string' &&
    isStrictSemver(version) &&
    /^[0-9a-f]{40}$/.test(String(Reflect.get(manifest, 'commit'))) &&
    isCanonicalTimestamp(commitTimestamp) &&
    Reflect.get(manifest, 'artifactKind') === 'source-only' &&
    Reflect.get(manifest, 'releaseStatus') === 'draft-candidate' &&
    Array.isArray(binaryArtifacts) &&
    binaryArtifacts.length === 0 &&
    Array.isArray(excludedCategories) &&
    excludedCategories.join('\0') === EXCLUDED_RELEASE_CATEGORIES.join('\0') &&
    files.length === expectedFileNames.length &&
    files.every(isValidReleaseFile) &&
    new Set(fileNames).size === fileNames.length &&
    [...fileNames].sort().join('\0') === expectedFileNames.join('\0');
  if (!valid) {
    throw new ReleaseCandidateError(
      'INVALID_MANIFEST',
      'Generated release manifest is internally inconsistent.'
    );
  }
}

function createThirdPartyNotices(
  dependencies: readonly DirectDependency[]
): string {
  const rows = dependencies.map(
    ({ name, version, scope, license }) =>
      `| ${name} | ${version} | ${scope} | ${license} |`
  );
  return `# Third-party Dependency Notices

This source-only archive does not include \`node_modules\` or binary bundles. The table records license declarations
from the reviewed direct-dependency manifest stored in the fixed release commit. The accompanying SPDX document lists
the complete locked dependency inventory; transitive packages without a reviewed declaration remain
\`NOASSERTION\` rather than being guessed.

| Package | Resolved version | Scope | Declared license |
| --- | --- | --- | --- |
${rows.join('\n')}
`;
}

function expectedPayloadNames(version: string): readonly string[] {
  return [
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    `tenkacloud-passport-${version}.spdx.json`,
    `tenkacloud-passport-${version}.tar.gz`,
  ].sort();
}

function expectedCandidateNames(version: string): readonly string[] {
  return [
    ...expectedPayloadNames(version),
    'release-manifest.json',
    'checksums.txt',
  ].sort();
}

function invalidChecksum(): ReleaseCandidateError {
  return new ReleaseCandidateError(
    'INVALID_CHECKSUM',
    'Release candidate files or checksums are internally inconsistent.'
  );
}

interface DirectoryMutationFingerprint {
  readonly changeTimeNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly linkCount: bigint;
  readonly modificationTimeNanoseconds: bigint;
  readonly size: bigint;
}

async function directoryMutationFingerprint(
  handle: FileHandle
): Promise<DirectoryMutationFingerprint> {
  const status = await handle.stat({ bigint: true });
  return {
    changeTimeNanoseconds: status.ctimeNs,
    device: status.dev,
    inode: status.ino,
    linkCount: status.nlink,
    modificationTimeNanoseconds: status.mtimeNs,
    size: status.size,
  };
}

function sameDirectoryMutationFingerprint(
  left: DirectoryMutationFingerprint,
  right: DirectoryMutationFingerprint
): boolean {
  return (
    left.changeTimeNanoseconds === right.changeTimeNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.linkCount === right.linkCount &&
    left.modificationTimeNanoseconds === right.modificationTimeNanoseconds &&
    left.size === right.size
  );
}

function sameFileSnapshot(
  left: Omit<DescriptorRelativeFileIdentity, 'fileName'>,
  right: Omit<DescriptorRelativeFileIdentity, 'fileName'>
): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.changeTimeNanoseconds === right.changeTimeNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.modificationTimeNanoseconds === right.modificationTimeNanoseconds
  );
}

function parseChecksumDocument(
  source: string,
  expectedNames: readonly string[]
): ReadonlyMap<string, string> {
  if (!source.endsWith('\n') || source.endsWith('\n\n')) {
    throw invalidChecksum();
  }
  const lines = source.slice(0, -1).split('\n');
  const checksums = new Map<string, string>();
  for (const line of lines) {
    const match = /^([0-9a-f]{64}) {2}([^/\\\0\r\n]+)$/.exec(line);
    const fileName = match?.[2];
    if (
      fileName === undefined ||
      path.basename(fileName) !== fileName ||
      checksums.has(fileName)
    ) {
      throw invalidChecksum();
    }
    checksums.set(fileName, match?.[1] ?? '');
  }
  if (
    [...checksums.keys()].sort().join('\0') !==
    [...expectedNames].sort().join('\0')
  ) {
    throw invalidChecksum();
  }
  return checksums;
}

function assertExactCandidateEntries(
  entries: readonly {
    readonly name: string;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }[],
  expectedNames: readonly string[]
): void {
  if (
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
    entries
      .map(({ name }) => name)
      .sort()
      .join('\0') !== expectedNames.join('\0')
  ) {
    throw invalidChecksum();
  }
}

async function readVerifiedReleaseMetadata(
  directoryDescriptor: number,
  version: string,
  verifiedFiles: readonly DescriptorRelativeFileIdentity[]
): Promise<{ readonly manifest: unknown; readonly sbom: unknown }> {
  try {
    const manifestRead = await readRegularFileNoFollowAtWithIdentity(
      directoryDescriptor,
      'release-manifest.json',
      MAX_RELEASE_FILE_BYTES
    );
    const sbomName = `tenkacloud-passport-${version}.spdx.json`;
    const sbomRead = await readRegularFileNoFollowAtWithIdentity(
      directoryDescriptor,
      sbomName,
      MAX_RELEASE_FILE_BYTES
    );
    const manifestIdentity = verifiedFiles.find(
      ({ fileName }) => fileName === 'release-manifest.json'
    );
    const sbomIdentity = verifiedFiles.find(
      ({ fileName }) => fileName === sbomName
    );
    if (
      manifestIdentity === undefined ||
      sbomIdentity === undefined ||
      !sameFileSnapshot(manifestIdentity, manifestRead) ||
      !sameFileSnapshot(sbomIdentity, sbomRead)
    ) {
      throw invalidChecksum();
    }
    return {
      manifest: JSON.parse(manifestRead.contents.toString('utf8')),
      sbom: JSON.parse(sbomRead.contents.toString('utf8')),
    };
  } catch {
    throw invalidChecksum();
  }
}

async function assertFinalCandidateSnapshot(
  opened: {
    readonly handle: FileHandle;
    readonly identity: DirectoryIdentity;
  },
  expectedNames: readonly string[],
  verifiedFiles: readonly DescriptorRelativeFileIdentity[],
  initialDirectoryFingerprint: DirectoryMutationFingerprint
): Promise<void> {
  await assertOpenedDirectoryPathIdentity(opened.identity, opened.handle);
  const finalEntries = await readdir(opened.identity.path, {
    withFileTypes: true,
  });
  await assertOpenedDirectoryPathIdentity(opened.identity, opened.handle);
  assertExactCandidateEntries(finalEntries, expectedNames);
  try {
    await assertRegularFileIdentitiesNoFollowAt(
      opened.handle.fd,
      verifiedFiles
    );
  } catch {
    throw invalidChecksum();
  }
  const finalDirectoryFingerprint = await directoryMutationFingerprint(
    opened.handle
  );
  if (
    !sameDirectoryMutationFingerprint(
      initialDirectoryFingerprint,
      finalDirectoryFingerprint
    )
  ) {
    throw invalidChecksum();
  }
}

export interface OpenedSourceReleaseDirectory {
  readonly handle: FileHandle;
  readonly identity: DirectoryIdentity;
}

export async function validateOpenedSourceReleaseDirectory(
  opened: OpenedSourceReleaseDirectory,
  version: string
): Promise<readonly string[]> {
  validateVersion(version);
  const expectedNames = expectedCandidateNames(version);
  await assertOpenedDirectoryPathIdentity(opened.identity, opened.handle);
  const initialDirectoryFingerprint = await directoryMutationFingerprint(
    opened.handle
  );
  const entries = await readdir(opened.identity.path, {
    withFileTypes: true,
  });
  await assertOpenedDirectoryPathIdentity(opened.identity, opened.handle);
  assertExactCandidateEntries(entries, expectedNames);
  await assertOpenedDirectoryPathIdentity(opened.identity, opened.handle);
  const checksumNames = expectedNames.filter(
    (fileName) => fileName !== 'checksums.txt'
  );
  const checksumRead = await readRegularFileNoFollowAtWithIdentity(
    opened.handle.fd,
    'checksums.txt',
    MAX_RELEASE_FILE_BYTES
  );
  const checksums = parseChecksumDocument(
    checksumRead.contents.toString('utf8'),
    checksumNames
  );
  const actualFiles: ReleaseFile[] = [];
  const verifiedFiles: DescriptorRelativeFileIdentity[] = [
    {
      byteLength: checksumRead.byteLength,
      changeTimeNanoseconds: checksumRead.changeTimeNanoseconds,
      device: checksumRead.device,
      fileName: 'checksums.txt',
      inode: checksumRead.inode,
      modificationTimeNanoseconds: checksumRead.modificationTimeNanoseconds,
    },
  ];
  for (const fileName of checksumNames) {
    const fileHash = await hashRegularFileNoFollowAt(
      opened.handle.fd,
      fileName,
      fileName.endsWith('.tar.gz')
        ? MAX_RELEASE_ARCHIVE_BYTES
        : MAX_RELEASE_FILE_BYTES
    );
    actualFiles.push({
      fileName,
      sha256: fileHash.sha256,
      byteLength: fileHash.byteLength,
    });
    verifiedFiles.push({
      byteLength: fileHash.byteLength,
      changeTimeNanoseconds: fileHash.changeTimeNanoseconds,
      device: fileHash.device,
      fileName,
      inode: fileHash.inode,
      modificationTimeNanoseconds: fileHash.modificationTimeNanoseconds,
    });
  }
  if (
    actualFiles.some(
      ({ fileName, sha256 }) => checksums.get(fileName) !== sha256
    )
  ) {
    throw invalidChecksum();
  }
  const { manifest, sbom } = await readVerifiedReleaseMetadata(
    opened.handle.fd,
    version,
    verifiedFiles
  );
  validateReleaseManifest(manifest);
  validateSpdxDocument(sbom);
  const manifestFiles = isRecord(manifest)
    ? Reflect.get(manifest, 'files')
    : undefined;
  const payloadNames = expectedPayloadNames(version);
  const actualPayloadFiles = actualFiles
    .filter(({ fileName }) => payloadNames.includes(fileName))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
  const recordedPayloadFiles = Array.isArray(manifestFiles)
    ? manifestFiles
        .filter(isRecord)
        .map((file) => ({
          fileName: Reflect.get(file, 'fileName'),
          sha256: Reflect.get(file, 'sha256'),
          byteLength: Reflect.get(file, 'byteLength'),
        }))
        .sort((left, right) =>
          String(left.fileName).localeCompare(String(right.fileName))
        )
    : [];
  const archiveName = `tenkacloud-passport-${version}.tar.gz`;
  const archiveFile = actualPayloadFiles.find(
    ({ fileName }) => fileName === archiveName
  );
  const sbomPackages = isRecord(sbom)
    ? Reflect.get(sbom, 'packages')
    : undefined;
  const rootPackage = Array.isArray(sbomPackages)
    ? sbomPackages.find(
        (item) =>
          isRecord(item) && Reflect.get(item, 'SPDXID') === SPDX_ROOT_PACKAGE_ID
      )
    : undefined;
  const rootChecksums = isRecord(rootPackage)
    ? Reflect.get(rootPackage, 'checksums')
    : undefined;
  const rootChecksum = Array.isArray(rootChecksums)
    ? rootChecksums[0]
    : undefined;
  if (
    !isRecord(manifest) ||
    Reflect.get(manifest, 'version') !== version ||
    JSON.stringify(recordedPayloadFiles) !==
      JSON.stringify(actualPayloadFiles) ||
    !isRecord(sbom) ||
    !String(Reflect.get(sbom, 'documentNamespace')).endsWith(
      `/spdx/${String(Reflect.get(manifest, 'commit'))}`
    ) ||
    !isRecord(rootPackage) ||
    Reflect.get(rootPackage, 'versionInfo') !== version ||
    Reflect.get(rootPackage, 'packageFileName') !== archiveName ||
    !isRecord(rootChecksum) ||
    Reflect.get(rootChecksum, 'checksumValue') !== archiveFile?.sha256
  ) {
    throw invalidChecksum();
  }
  await assertFinalCandidateSnapshot(
    opened,
    expectedNames,
    verifiedFiles,
    initialDirectoryFingerprint
  );
  return expectedNames;
}

export async function validateSourceReleaseDirectory(
  directory: string,
  version: string
): Promise<readonly string[]> {
  const opened = await openSafeExistingDirectory(directory);
  try {
    return await validateOpenedSourceReleaseDirectory(opened, version);
  } finally {
    await opened.handle.close();
  }
}

async function assertArchiveMatchesTrackedFiles(
  archivePath: string,
  prefix: string,
  trackedPaths: readonly string[],
  repositoryRoot: string
): Promise<void> {
  const listing = await runCommand(
    ['tar', '-tzf', archivePath],
    repositoryRoot
  );
  const archivedFiles: string[] = [];
  for (const entry of listing.split('\n').filter(Boolean)) {
    if (!entry.startsWith(prefix) || entry.includes('\\')) {
      throw new ReleaseCandidateError(
        'FORBIDDEN_RELEASE_PATH',
        'Generated archive inventory differs from the reviewed Git tree.'
      );
    }
    const relativePath = entry.slice(prefix.length);
    if (relativePath.length > 0 && !relativePath.endsWith('/')) {
      archivedFiles.push(relativePath);
    }
  }
  if (archivedFiles.sort().join('\0') !== [...trackedPaths].sort().join('\0')) {
    throw new ReleaseCandidateError(
      'FORBIDDEN_RELEASE_PATH',
      'Generated archive inventory differs from the reviewed Git tree.'
    );
  }
}

export async function buildSourceRelease(
  options: SourceReleaseOptions
): Promise<SourceReleaseResult> {
  validateVersion(options.version);
  validateGitRef(options.ref);
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const requestedOutputDirectory = path.resolve(options.outputDirectory);
  const commit = (
    await runCommand(
      ['git', 'rev-parse', '--verify', `${options.ref}^{commit}`],
      repositoryRoot
    )
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new ReleaseCandidateError(
      'INVALID_GIT_REF',
      'Git ref did not resolve to one commit.'
    );
  }
  const project = await readRefPackage(repositoryRoot, commit);
  if (project.version !== options.version) {
    throw new ReleaseCandidateError(
      'VERSION_MISMATCH',
      `Release version ${options.version} does not match package.json ${project.version}.`
    );
  }
  const trackedOutput = await runCommand(
    ['git', 'ls-tree', '-r', '-z', commit],
    repositoryRoot
  );
  const trackedPaths = trackedPathsFromGitTree(trackedOutput);
  assertSafeTrackedPaths(trackedPaths);
  await validateReleaseTreeContents(repositoryRoot, commit, trackedPaths);
  const lockSource = await runCommand(
    ['git', 'show', `${commit}:bun.lock`],
    repositoryRoot
  );
  const lockedPackages = parseLockedPackages(lockSource);
  const directDependencies = await readReviewedDirectDependencies(
    repositoryRoot,
    commit,
    project,
    lockedPackages
  );
  const transaction = await createSafeOutputTransaction(
    requestedOutputDirectory
  );
  try {
    const outputDirectory = transaction.inspectionPath;
    const archiveName = `tenkacloud-passport-${options.version}.tar.gz`;
    const archivePath = path.join(outputDirectory, archiveName);
    await streamOutputExclusive(transaction, archiveName, [
      'git',
      '-C',
      repositoryRoot,
      'archive',
      '--format=tar.gz',
      `--prefix=tenkacloud-passport-${options.version}/`,
      commit,
    ]);
    await assertArchiveMatchesTrackedFiles(
      archivePath,
      `tenkacloud-passport-${options.version}/`,
      trackedPaths,
      repositoryRoot
    );
    const archive = await recordedOutputReleaseFile(
      transaction,
      archiveName,
      MAX_RELEASE_ARCHIVE_BYTES
    );
    const createdAt = new Date(
      (
        await runCommand(
          ['git', 'show', '-s', '--format=%cI', commit],
          repositoryRoot
        )
      ).trim()
    ).toISOString();

    const sbomName = `tenkacloud-passport-${options.version}.spdx.json`;
    await writeOutputExclusive(
      transaction,
      sbomName,
      createSpdxDocument({
        version: options.version,
        commit,
        createdAt,
        archive,
        project,
        lockedPackages,
        directDependencies,
      })
    );
    await writeOutputExclusive(
      transaction,
      'THIRD_PARTY_NOTICES.md',
      createThirdPartyNotices(directDependencies)
    );
    await writeOutputExclusive(
      transaction,
      'LICENSE',
      await runCommand(['git', 'show', `${commit}:LICENSE`], repositoryRoot)
    );

    const payloadNames = expectedPayloadNames(options.version);
    const payloadFiles = await Promise.all(
      payloadNames.map((fileName) =>
        recordedOutputReleaseFile(
          transaction,
          fileName,
          fileName.endsWith('.tar.gz')
            ? MAX_RELEASE_ARCHIVE_BYTES
            : MAX_RELEASE_FILE_BYTES
        )
      )
    );
    const manifestName = 'release-manifest.json';
    const manifest = {
      schemaVersion: 1,
      version: options.version,
      commit,
      commitTimestamp: createdAt,
      artifactKind: 'source-only',
      releaseStatus: 'draft-candidate',
      binaryArtifacts: [],
      excludedCategories: EXCLUDED_RELEASE_CATEGORIES,
      files: payloadFiles,
    };
    validateReleaseManifest(manifest);
    await writeOutputExclusive(
      transaction,
      manifestName,
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    const checksumFiles = [
      ...payloadFiles,
      await recordedOutputReleaseFile(
        transaction,
        manifestName,
        MAX_RELEASE_FILE_BYTES
      ),
    ].sort((left, right) => left.fileName.localeCompare(right.fileName));
    await writeOutputExclusive(
      transaction,
      'checksums.txt',
      `${checksumFiles
        .map(({ sha256, fileName }) => `${sha256}  ${fileName}`)
        .join('\n')}\n`
    );
    await assertRecordedOutputFiles(transaction);
    const files = await validateOpenedSourceReleaseDirectory(
      {
        handle: transaction.handle,
        identity: transaction.staging,
      },
      options.version
    );
    await assertRecordedOutputFiles(transaction);
    await publishSafeOutput(transaction, options.version);
    return {
      version: options.version,
      commit,
      outputDirectory: requestedOutputDirectory,
      files,
    };
  } catch (error) {
    const clean = await cleanupSafeOutput(transaction);
    if (!clean) {
      throw new ReleaseCandidateError(
        'UNSAFE_OUTPUT_DIRECTORY',
        'Release generation failed and staging cleanup could not be verified.'
      );
    }
    throw error;
  }
}

export async function runCli(
  arguments_: readonly string[],
  repositoryRoot = process.cwd(),
  log: (message: string) => void = console.log
): Promise<void> {
  const [version, ref, outputDirectory] = arguments_;
  if (
    version === undefined ||
    ref === undefined ||
    outputDirectory === undefined ||
    arguments_.length !== 3
  ) {
    throw new ReleaseCandidateError(
      'INVALID_VERSION',
      'Usage: bun scripts/source-release-cli.ts <version> <git-ref> <output-directory>'
    );
  }
  const result = await buildSourceRelease({
    repositoryRoot,
    version,
    ref,
    outputDirectory,
  });
  log(
    `Source release candidate ${result.version} (${result.commit}) created with ${result.files.length} files.`
  );
}
