import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const OFFICIAL_REPOSITORY_URL = 'https://github.com/mybigday/llama.rn';

export type NativeArtifactConfigErrorCode =
  | 'PACKAGE_NOT_INSTALLED'
  | 'INVALID_PACKAGE'
  | 'INVALID_MANIFEST'
  | 'ARTIFACT_NOT_INSTALLED'
  | 'CHECKSUM_MISMATCH';

export class NativeArtifactConfigError extends Error {
  readonly code: NativeArtifactConfigErrorCode;

  constructor(code: NativeArtifactConfigErrorCode, message: string) {
    super(message);
    this.name = 'NativeArtifactConfigError';
    this.code = code;
  }
}

export interface NativeArtifactPlanItem {
  readonly assetName: string;
  readonly sourceUrl: string;
  readonly expectedSha256: string;
  readonly installedPath: string;
  readonly markerPath: string;
}

export interface LlamaNativeArtifactPlan {
  readonly packageVersion: string;
  readonly downloaderPath: string;
  readonly artifacts: readonly NativeArtifactPlanItem[];
}

export interface VerifiedNativeArtifact {
  readonly assetName: string;
  readonly sha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  code: 'INVALID_PACKAGE' | 'INVALID_MANIFEST'
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new NativeArtifactConfigError(
      code,
      `${key} は空でない文字列である必要があります。`
    );
  }
  return value;
}

function normalizeSha256(value: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      'Native Artifact の SHA-256 は 64 桁の hexadecimal である必要があります。'
    );
  }
  return value.toLowerCase();
}

function resolvePackagePath(packageRoot: string, relativePath: string): string {
  const hasUnsafeSegment = relativePath
    .split('/')
    .some((segment) => segment.length === 0 || segment === '..');
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    hasUnsafeSegment
  ) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      `Native Artifact path が package 外を指しています: ${relativePath}`
    );
  }
  const resolved = path.resolve(packageRoot, relativePath);
  const rootPrefix = `${path.resolve(packageRoot)}${path.sep}`;
  if (!resolved.startsWith(rootPrefix)) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      `Native Artifact path が package 外を指しています: ${relativePath}`
    );
  }
  return resolved;
}

function repositoryUrl(packageJson: Readonly<Record<string, unknown>>): string {
  const repository = Reflect.get(packageJson, 'repository');
  let raw = '';
  if (typeof repository === 'string') {
    raw = repository;
  } else if (isRecord(repository)) {
    const url = Reflect.get(repository, 'url');
    if (typeof url === 'string') raw = url;
  }
  const normalized = raw
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      throw new Error('GitHub HTTPS URL ではありません。');
    }
  } catch {
    throw new NativeArtifactConfigError(
      'INVALID_PACKAGE',
      'llama.rn repository は GitHub の HTTPS URL である必要があります。'
    );
  }
  if (normalized !== OFFICIAL_REPOSITORY_URL) {
    throw new NativeArtifactConfigError(
      'INVALID_PACKAGE',
      `llama.rn の取得元 repository が公式 URL ではありません: ${normalized}`
    );
  }
  return normalized;
}

async function readJson(
  filePath: string,
  code: 'PACKAGE_NOT_INSTALLED' | 'INVALID_MANIFEST'
): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch {
    throw new NativeArtifactConfigError(
      code,
      `${filePath} を読み込めません。llama.rn を lifecycle script 無効で install した後に再実行してください。`
    );
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new NativeArtifactConfigError(
      code === 'PACKAGE_NOT_INSTALLED' ? 'INVALID_PACKAGE' : code,
      `${filePath} は有効な JSON ではありません。`
    );
  }
}

async function assertDownloaderExists(downloaderPath: string): Promise<void> {
  const isFile = await stat(downloaderPath).then(
    (info) => info.isFile(),
    () => false
  );
  if (isFile) return;
  throw new NativeArtifactConfigError(
    'INVALID_PACKAGE',
    `llama.rn 公式 downloader がありません: ${downloaderPath}`
  );
}

function parseArtifact(
  packageRoot: string,
  releaseBaseUrl: string,
  value: unknown
): NativeArtifactPlanItem {
  if (!isRecord(value)) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      'Native Artifact entry は object である必要があります。'
    );
  }
  const assetName = requiredString(value, 'assetName', 'INVALID_MANIFEST');
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(assetName)) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      `Native Artifact 名が不正です: ${assetName}`
    );
  }
  const expectedSha256 = normalizeSha256(
    requiredString(value, 'sha256', 'INVALID_MANIFEST')
  );
  const installedPath = resolvePackagePath(
    packageRoot,
    requiredString(value, 'relativePath', 'INVALID_MANIFEST')
  );
  const markerPath = resolvePackagePath(
    packageRoot,
    requiredString(value, 'markerPath', 'INVALID_MANIFEST')
  );
  return {
    assetName,
    sourceUrl: `${releaseBaseUrl}/${assetName}`,
    expectedSha256,
    installedPath,
    markerPath,
  };
}

export async function loadLlamaNativeArtifactPlan(
  packageRoot: string
): Promise<LlamaNativeArtifactPlan> {
  const packagePath = path.join(packageRoot, 'package.json');
  const packageValue = await readJson(packagePath, 'PACKAGE_NOT_INSTALLED');
  if (!isRecord(packageValue)) {
    throw new NativeArtifactConfigError(
      'INVALID_PACKAGE',
      'llama.rn package.json は object である必要があります。'
    );
  }
  const packageName = requiredString(packageValue, 'name', 'INVALID_PACKAGE');
  if (packageName !== 'llama.rn') {
    throw new NativeArtifactConfigError(
      'INVALID_PACKAGE',
      `想定外の package です: ${packageName}`
    );
  }
  const packageVersion = requiredString(
    packageValue,
    'version',
    'INVALID_PACKAGE'
  );
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
    throw new NativeArtifactConfigError(
      'INVALID_PACKAGE',
      `llama.rn Version が不正です: ${packageVersion}`
    );
  }
  const releaseBaseUrl = `${repositoryUrl(packageValue)}/releases/download/v${packageVersion}`;
  const downloaderPath = path.join(
    packageRoot,
    'install/download-native-artifacts.js'
  );
  await assertDownloaderExists(downloaderPath);

  const manifestPath = path.join(packageRoot, 'install/native-artifacts.json');
  const manifestValue = await readJson(manifestPath, 'INVALID_MANIFEST');
  const artifactsValue = isRecord(manifestValue)
    ? Reflect.get(manifestValue, 'artifacts')
    : undefined;
  if (!Array.isArray(artifactsValue)) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      'llama.rn Native Artifact manifest に artifacts 配列が必要です。'
    );
  }
  if (artifactsValue.length === 0) {
    throw new NativeArtifactConfigError(
      'INVALID_MANIFEST',
      'llama.rn Native Artifact manifest が空です。'
    );
  }
  return {
    packageVersion,
    downloaderPath,
    artifacts: artifactsValue.map((artifact) =>
      parseArtifact(packageRoot, releaseBaseUrl, artifact)
    ),
  };
}

async function artifactExists(artifactPath: string): Promise<boolean> {
  try {
    await stat(artifactPath);
    return true;
  } catch {
    return false;
  }
}

export async function verifyLlamaNativeArtifactMarkers(
  plan: LlamaNativeArtifactPlan
): Promise<readonly VerifiedNativeArtifact[]> {
  const verified: VerifiedNativeArtifact[] = [];
  for (const artifact of plan.artifacts) {
    if (!(await artifactExists(artifact.installedPath))) {
      throw new NativeArtifactConfigError(
        'ARTIFACT_NOT_INSTALLED',
        `Native Artifact の展開先がありません: ${artifact.installedPath}`
      );
    }
    let marker: string;
    try {
      marker = (await readFile(artifact.markerPath, 'utf8')).trim();
    } catch {
      throw new NativeArtifactConfigError(
        'ARTIFACT_NOT_INSTALLED',
        `Native Artifact の SHA-256 marker がありません: ${artifact.markerPath}`
      );
    }
    if (marker.toLowerCase() !== artifact.expectedSha256) {
      throw new NativeArtifactConfigError(
        'CHECKSUM_MISMATCH',
        `SHA-256 検証に失敗しました: ${artifact.assetName} expected=${artifact.expectedSha256} actual=${marker}`
      );
    }
    verified.push({
      assetName: artifact.assetName,
      sha256: artifact.expectedSha256,
    });
  }
  return verified;
}

function printPlan(plan: LlamaNativeArtifactPlan): void {
  console.log(`llama.rn ${plan.packageVersion} Native Artifact 取得計画。`);
  for (const artifact of plan.artifacts) {
    console.log(`Artifact: ${artifact.assetName}`);
    console.log(`取得元 URL: ${artifact.sourceUrl}`);
    console.log(`期待 SHA-256: ${artifact.expectedSha256}`);
  }
}

async function printVerification(plan: LlamaNativeArtifactPlan): Promise<void> {
  const verified = await verifyLlamaNativeArtifactMarkers(plan);
  for (const artifact of verified) {
    console.log(
      `SHA-256 検証結果: OK artifact=${artifact.assetName} sha256=${artifact.sha256}`
    );
  }
}

async function main(): Promise<void> {
  const [command, packageRootArgument] = Bun.argv.slice(2);
  const packageRoot = path.resolve(
    packageRootArgument ?? 'node_modules/llama.rn'
  );
  const plan = await loadLlamaNativeArtifactPlan(packageRoot);
  if (command === 'inspect') {
    printPlan(plan);
    return;
  }
  if (command === 'verify') {
    await printVerification(plan);
    return;
  }
  throw new NativeArtifactConfigError(
    'INVALID_PACKAGE',
    'command は inspect または verify を指定してください。'
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof NativeArtifactConfigError) {
      console.error(`[${error.code}] ${error.message}`);
    } else {
      console.error('llama.rn Native Artifact setup に失敗しました。', error);
    }
    process.exitCode = 1;
  });
}
