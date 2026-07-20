import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AndroidArtifactIntegrityError } from './android-artifact-integrity';
import {
  buildAndroidReleaseManifest,
  createAndroidReleaseProvenance,
  parseAndroidReleaseManifest,
  parseAndroidReleaseProvenance,
  parseApkanalyzerPackageId,
  parseApkanalyzerVersionCode,
  parseApksignerCertificateSha256,
} from './android-release-identity';
import { isolatedGitEnv } from './git-env-isolation';

const directories: string[] = [];
const SOURCE_COMMIT = 'a'.repeat(40);
const APK_SHA256 = 'b'.repeat(64);
const CERTIFICATE_SHA256 = 'c'.repeat(64);
const ANDROID_TOOLCHAIN_SHA256 = 'd'.repeat(64);
const JAVA_RUNTIME_SHA256 = 'e'.repeat(64);
const GIT_SHA256 = 'f'.repeat(64);

async function approvedExecutable(command: string) {
  const discovered = Bun.which(command);
  if (discovered === null)
    throw new Error(`${command} is required for this test`);
  return approvedExecutablePath(discovered);
}

async function approvedExecutablePath(executablePath: string) {
  const path = await realpath(executablePath);
  const sha256 = createHash('sha256')
    .update(Buffer.from(await Bun.file(path).arrayBuffer()))
    .digest('hex');
  return { path, sha256 };
}

async function approvedGit() {
  let approved = await approvedExecutable('git');
  if (process.platform === 'darwin' && approved.path === '/usr/bin/git') {
    const process = Bun.spawn(['/usr/bin/xcrun', '--find', 'git'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(stderr);
    approved = await approvedExecutable(stdout.trim());
  }
  return { git: approved.path, gitSha256: approved.sha256 };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tenka-release-identity-'));
  directories.push(directory);
  return directory;
}

async function cleanupTree(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await cleanupTree(child);
      await rmdir(child);
    } else {
      await unlink(child);
    }
  }
}

/**
 * `isolatedGitEnv()` を使わないと、pre-commit hook（`git commit` →
 * `.husky/pre-commit` → `make before-commit` → `bun test scripts/`）経由で
 * このテストが起動されたとき、継承した `GIT_DIR` / `GIT_WORK_TREE` に引きずられて
 * `cwd: repositoryPath`（使い捨て fixture）ではなく呼び出し元の実リポジトリへ
 * `git` コマンドを実行してしまう（`scripts/source-release.test.ts` と同じ回帰、
 * Issue 79 実装中に実際に踏んだ）。
 */
async function runGit(repositoryPath: string, ...arguments_: string[]) {
  const process = Bun.spawn(['git', ...arguments_], {
    cwd: repositoryPath,
    env: isolatedGitEnv(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr);
  return stdout.trimEnd();
}

afterEach(async () => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined) {
      await cleanupTree(directory);
      await rmdir(directory);
    }
  }
});

describe('Issue 28: Android Release Binary identity 境界', () => {
  it('strict provenance と release manifest を exact schema から再構築する', () => {
    const provenance = {
      schemaVersion: 1,
      sourceTag: 'v1.0.0',
      sourceCommit: SOURCE_COMMIT,
    } as const;
    const manifest = {
      ...provenance,
      androidToolchainSha256: ANDROID_TOOLCHAIN_SHA256,
      apkFileName: 'tenkacloud-passport.apk',
      byteLength: 123_456,
      gitSha256: GIT_SHA256,
      javaRuntimeSha256: JAVA_RUNTIME_SHA256,
      packageId: 'cloud.tenka.passport',
      sha256: APK_SHA256,
      signerCertificateSha256: CERTIFICATE_SHA256,
      versionCode: 1,
    } as const;

    expect(parseAndroidReleaseProvenance(JSON.stringify(provenance))).toEqual(
      provenance
    );
    expect(parseAndroidReleaseManifest(JSON.stringify(manifest))).toEqual(
      manifest
    );
  });

  it('unknown field、path traversal、非正規 digest を manifest から拒否する', () => {
    const valid = {
      schemaVersion: 1,
      sourceTag: 'v1.0.0',
      sourceCommit: SOURCE_COMMIT,
      androidToolchainSha256: ANDROID_TOOLCHAIN_SHA256,
      apkFileName: 'tenkacloud-passport.apk',
      byteLength: 123_456,
      gitSha256: GIT_SHA256,
      javaRuntimeSha256: JAVA_RUNTIME_SHA256,
      packageId: 'cloud.tenka.passport',
      sha256: APK_SHA256,
      signerCertificateSha256: CERTIFICATE_SHA256,
      versionCode: 1,
    };
    for (const candidate of [
      { ...valid, unknown: true },
      { ...valid, apkFileName: '../passport.apk' },
      { ...valid, sha256: APK_SHA256.toUpperCase() },
      { ...valid, gitSha256: GIT_SHA256.toUpperCase() },
      { ...valid, versionCode: 0 },
      { ...valid, byteLength: 512 * 1024 * 1024 + 1 },
    ]) {
      expect(() =>
        parseAndroidReleaseManifest(JSON.stringify(candidate))
      ).toThrow(
        new AndroidArtifactIntegrityError(
          'INVALID_RELEASE_MANIFEST',
          'Android release manifest is invalid.'
        )
      );
    }
    expect(() =>
      parseAndroidReleaseProvenance(
        JSON.stringify({
          schemaVersion: 1,
          sourceTag: 'v1.0.0',
          sourceCommit: SOURCE_COMMIT,
          unknown: true,
        })
      )
    ).toThrow(
      new AndroidArtifactIntegrityError(
        'INVALID_RELEASE_PROVENANCE',
        'Android release provenance is invalid.'
      )
    );
  });

  it('apkanalyzer の Package ID と正規 versionCode だけを受理する', () => {
    expect(parseApkanalyzerPackageId('cloud.tenka.passport\n')).toBe(
      'cloud.tenka.passport'
    );
    expect(parseApkanalyzerVersionCode('42\n')).toBe(42);
    for (const output of ['cloud.tenka.passport extra\n', '0\n', '01\n']) {
      expect(() =>
        output.startsWith('cloud')
          ? parseApkanalyzerPackageId(output)
          : parseApkanalyzerVersionCode(output)
      ).toThrow();
    }
  });

  it('apksigner の単一 Signer Certificate SHA-256 だけを受理する', () => {
    const colonDigest = CERTIFICATE_SHA256.match(/.{2}/g)?.join(':');
    if (colonDigest === undefined) throw new Error('digest fixture is invalid');
    const signer = `Verifies\nSigner #1 certificate SHA-256 digest: ${CERTIFICATE_SHA256}\n`;
    expect(parseApksignerCertificateSha256(signer)).toBe(CERTIFICATE_SHA256);
    expect(
      parseApksignerCertificateSha256(
        `Signer #1 certificate SHA-256 digest: ${colonDigest}\n`
      )
    ).toBe(CERTIFICATE_SHA256);
    expect(() =>
      parseApksignerCertificateSha256(
        `${signer}Signer #2 certificate SHA-256 digest: ${colonDigest}\n`
      )
    ).toThrow(
      new AndroidArtifactIntegrityError(
        'ANDROID_TOOL_FAILED',
        'Android release APK must have exactly one signing certificate.'
      )
    );
  });

  it('抽出値、Tag blob、Signer、tool fingerprint が一致する manifest だけを構築する', () => {
    const provenance = {
      schemaVersion: 1,
      sourceTag: 'v1.0.0',
      sourceCommit: SOURCE_COMMIT,
    } as const;
    const tools = {
      androidToolchainRoot: '/approved/android-sdk',
      androidToolchainSha256: ANDROID_TOOLCHAIN_SHA256,
      apkanalyzerClasspath:
        '/approved/android-sdk/cmdline-tools/latest/lib/apkanalyzer-classpath.jar',
      apksignerJar: '/approved/android-sdk/build-tools/1.0.0/lib/apksigner.jar',
      git: '/approved/git',
      gitSha256: GIT_SHA256,
      javaHome: '/approved/java',
      javaRuntimeSha256: JAVA_RUNTIME_SHA256,
    };
    const input = {
      app: { packageId: 'cloud.tenka.passport', versionCode: 1 },
      artifact: {
        apkFileName: 'passport.apk',
        byteLength: 16,
        sha256: APK_SHA256,
      },
      embeddedProvenance: provenance,
      expectedCertificateSha256: CERTIFICATE_SHA256,
      extractedPackageId: 'cloud.tenka.passport',
      extractedVersionCode: 1,
      provenance,
      signerCertificateSha256: CERTIFICATE_SHA256,
      tools,
    } as const;

    expect(buildAndroidReleaseManifest(input)).toEqual({
      schemaVersion: 1,
      androidToolchainSha256: ANDROID_TOOLCHAIN_SHA256,
      apkFileName: 'passport.apk',
      byteLength: 16,
      gitSha256: GIT_SHA256,
      javaRuntimeSha256: JAVA_RUNTIME_SHA256,
      packageId: 'cloud.tenka.passport',
      sha256: APK_SHA256,
      signerCertificateSha256: CERTIFICATE_SHA256,
      sourceCommit: SOURCE_COMMIT,
      sourceTag: 'v1.0.0',
      versionCode: 1,
    });
    for (const candidate of [
      { ...input, extractedPackageId: 'cloud.tenka.other' },
      { ...input, extractedVersionCode: 2 },
      { ...input, signerCertificateSha256: '0'.repeat(64) },
      {
        ...input,
        embeddedProvenance: { ...provenance, sourceTag: 'v1.0.1' },
      },
    ]) {
      expect(() => buildAndroidReleaseManifest(candidate)).toThrow(
        new AndroidArtifactIntegrityError(
          'RELEASE_IDENTITY_MISMATCH',
          'Android release APK identity does not match the approved release inputs.'
        )
      );
    }
  });

  it('clean な annotated Tag / HEAD だけから atomic provenance を生成する', async () => {
    const repositoryPath = await temporaryDirectory();
    await runGit(repositoryPath, 'init', '--quiet');
    await runGit(repositoryPath, 'config', 'user.name', 'Release Test');
    await runGit(
      repositoryPath,
      'config',
      'user.email',
      'release@example.test'
    );
    await writeFile(join(repositoryPath, 'source.txt'), 'release source\n');
    await runGit(repositoryPath, 'add', 'source.txt');
    await runGit(repositoryPath, 'commit', '--quiet', '-m', 'release source');
    await runGit(repositoryPath, 'tag', '-a', 'v1.0.0', '-m', 'release v1.0.0');
    const outputPath = join(repositoryPath, 'tenka_release_provenance.json');
    const git = await approvedGit();

    await expect(
      createAndroidReleaseProvenance(
        outputPath,
        'v1.0.0',
        { ...git, gitSha256: '0'.repeat(64) },
        repositoryPath
      )
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Release tool SHA-256 does not match the approved fingerprint.'
      )
    );

    const provenance = await createAndroidReleaseProvenance(
      outputPath,
      'v1.0.0',
      git,
      repositoryPath
    );

    expect(provenance.schemaVersion).toBe(1);
    expect(provenance.sourceTag).toBe('v1.0.0');
    expect(provenance.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(
      parseAndroidReleaseProvenance(await readFile(outputPath, 'utf8'))
    ).toEqual(provenance);

    await expect(
      createAndroidReleaseProvenance(outputPath, 'v1.0.0', git, repositoryPath)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'GIT_SOURCE_MISMATCH',
        'Android release source worktree must be clean.'
      )
    );
  });

  it('macOS の system Git shim を source identity の承認済み実体として受理しない', async () => {
    if (process.platform !== 'darwin') {
      expect(process.platform).not.toBe('darwin');
      return;
    }
    const directory = await temporaryDirectory();
    // git hook 内では git が exec-path を PATH 先頭に足し Bun.which('git') が
    // CommandLineTools の実体を返すため、shim は PATH 解決でなく絶対パスで指す。
    const shim = await approvedExecutablePath('/usr/bin/git');
    expect(shim.path).toBe('/usr/bin/git');

    await expect(
      createAndroidReleaseProvenance(
        join(directory, 'provenance.json'),
        'v1.0.0',
        { git: shim.path, gitSha256: shim.sha256 },
        directory
      )
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Use the canonical real Git executable instead of the macOS system shim.'
      )
    );
  });

  it('CLI help は tool fingerprint を含む完全な引数契約を返す', async () => {
    const scriptPath = join(import.meta.dir, 'android-release-identity.ts');
    const process = Bun.spawn(['bun', scriptPath, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await process.exited).toBe(0);
    const output = await new Response(process.stdout).text();
    expect(output).toContain('<toolchain-sha256>');
    expect(output).toContain('<java-runtime-sha256>');
    expect(output).toContain('<git-sha256>');
  });

  it('replace refs が存在する Repository は置換を適用せず拒否する', async () => {
    const repositoryPath = await temporaryDirectory();
    await runGit(repositoryPath, 'init', '--quiet');
    await runGit(repositoryPath, 'config', 'user.name', 'Release Test');
    await runGit(
      repositoryPath,
      'config',
      'user.email',
      'release@example.test'
    );
    const sourcePath = join(repositoryPath, 'source.txt');
    await writeFile(sourcePath, 'release source\n');
    await runGit(repositoryPath, 'add', 'source.txt');
    await runGit(repositoryPath, 'commit', '--quiet', '-m', 'release source');
    await runGit(repositoryPath, 'tag', '-a', 'v1.0.0', '-m', 'release v1.0.0');
    const originalBlob = await runGit(
      repositoryPath,
      'hash-object',
      'source.txt'
    );
    const replacementPath = join(repositoryPath, 'replacement.txt');
    await writeFile(replacementPath, 'replacement source\n');
    const replacementBlob = await runGit(
      repositoryPath,
      'hash-object',
      '-w',
      'replacement.txt'
    );
    await unlink(replacementPath);
    await runGit(repositoryPath, 'replace', originalBlob, replacementBlob);
    const git = await approvedGit();

    await expect(
      createAndroidReleaseProvenance(
        join(repositoryPath, 'provenance.json'),
        'v1.0.0',
        git,
        repositoryPath
      )
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'GIT_SOURCE_MISMATCH',
        'Git replacement refs and hidden index entries are not allowed for a release.'
      )
    );
  });

  it('Git command の出力が 256 KiB を超える場合は Process を停止する', async () => {
    const directory = await temporaryDirectory();
    const executablePath = join(directory, 'overflow-git');
    await writeFile(
      executablePath,
      "#!/bin/sh\nwhile :; do printf '0123456789abcdef0123456789abcdef\\n'; done\n"
    );
    await chmod(executablePath, 0o500);
    const overflowingGit = await approvedExecutablePath(executablePath);

    await expect(
      createAndroidReleaseProvenance(
        join(directory, 'provenance.json'),
        'v1.0.0',
        { git: overflowingGit.path, gitSha256: overflowingGit.sha256 },
        directory
      )
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'GIT_SOURCE_MISMATCH',
        'Git output exceeded the safe release verification limit.'
      )
    );
  });
});
