import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AtomicOutputPublicationError,
  assertRegularFileIdentitiesNoFollowAt,
  atomicRenameDirectoryNoReplace,
  readRegularFileNoFollowAt,
} from './atomic-output-publisher';
import {
  assertWrittenOutputSnapshot,
  openExclusiveEntryAt,
  writeExclusiveOutput,
} from './exclusive-output-writer';
import { isolatedGitEnv } from './git-env-isolation';
import { runCapturedProcess } from './process-capture';
import {
  assertNoKnownSecretContent,
  assertSafeTrackedPaths,
  buildSourceRelease,
  cleanupRecordedOutputDirectory,
  parseLockedPackages,
  ReleaseCandidateError,
  runCli,
  validateOpenedSourceReleaseDirectory,
  validateReleaseManifest,
  validateSourceReleaseDirectory,
  validateSpdxDocument,
} from './source-release';
import {
  executeSourceReleaseCli,
  formatSourceReleaseCliError,
} from './source-release-cli';
import { verifySourceReleaseCli } from './source-release-verify-cli';

const tempRoots: string[] = [];
const TEST_VERSION = '0.1.0-alpha.1';
const TEST_INTEGRITY = `sha512-${Buffer.alloc(64, 0xa5).toString('base64')}`;

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * `runGit` はこの fixture repo 専用のヘルパー。継承した `GIT_DIR` 等を
 * `isolatedGitEnv()`（`git-env-isolation.ts`、理由はそちらの doc comment 参照）で
 * 除去しないと、`cwd: root`（使い捨て fixture）ではなく呼び出し元の実リポジトリへ
 * `git add` / `git commit` してしまう（Issue 79 実装中に実際に踏んだ回帰）。
 */
async function runGit(
  root: string,
  arguments_: readonly string[]
): Promise<string> {
  const { exitCode, stdout, stderr } = await runCapturedProcess(
    ['git', ...arguments_],
    {
      cwd: root,
      env: {
        ...isolatedGitEnv(),
        GIT_AUTHOR_DATE: '2026-07-18T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-07-18T00:00:00Z',
      },
    }
  );
  if (exitCode !== 0) {
    throw new Error(`git ${arguments_.join(' ')} failed: ${stderr}`);
  }
  return new TextDecoder().decode(stdout).trim();
}

function processEnv(): Record<string, string | undefined> {
  return process.env;
}

async function validateDuringCandidateMutation(
  outputDirectory: string,
  mutation: 'add-entry' | 'replace-license' | 'rewrite-license'
): Promise<{
  readonly competitorExitCode: number;
  readonly validation: PromiseSettledResult<readonly string[]>;
}> {
  const watchedFile = path.join(outputDirectory, 'LICENSE');
  const watchedStatus = lstatSync(watchedFile);
  const readyFile = path.join(
    path.dirname(outputDirectory),
    `verification-race-ready-${randomUUID()}`
  );
  const replacementFile = path.join(
    path.dirname(outputDirectory),
    `verification-race-replacement-${randomUUID()}`
  );
  writeFileSync(replacementFile, readFileSync(watchedFile));
  const oldAccessTime = new Date('2000-01-01T00:00:00.000Z');
  utimesSync(watchedFile, oldAccessTime, watchedStatus.mtime);
  const accessTimeThreshold = lstatSync(watchedFile).atimeMs;
  const competitorResult = runCapturedProcess(
    [
      'bun',
      '-e',
      `
        import { renameSync, statSync, writeFileSync } from 'node:fs';
        const watched = process.env.TASK_WATCHED_FILE;
        const ready = process.env.TASK_READY_FILE;
        const replacement = process.env.TASK_REPLACEMENT_FILE;
        const extra = process.env.TASK_EXTRA_FILE;
        const threshold = Number(process.env.TASK_ACCESS_TIME_THRESHOLD);
        const mutation = process.env.TASK_MUTATION;
        writeFileSync(ready, 'ready');
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          if (statSync(watched).atimeMs > threshold) {
            if (mutation === 'replace-license') renameSync(replacement, watched);
            else if (mutation === 'rewrite-license') {
              writeFileSync(watched, Buffer.alloc(statSync(watched).size, 0x78));
            } else writeFileSync(extra, 'unreviewed entry');
            process.exit(0);
          }
        }
        process.exit(2);
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...processEnv(),
        TASK_ACCESS_TIME_THRESHOLD: String(accessTimeThreshold),
        TASK_EXTRA_FILE: path.join(outputDirectory, 'unreviewed-race.txt'),
        TASK_MUTATION: mutation,
        TASK_READY_FILE: readyFile,
        TASK_REPLACEMENT_FILE: replacementFile,
        TASK_WATCHED_FILE: watchedFile,
      },
    }
  );
  while (!existsSync(readyFile)) await Bun.sleep(1);
  const [validation, competitor] = await Promise.all([
    Promise.allSettled([
      validateSourceReleaseDirectory(outputDirectory, TEST_VERSION),
    ]).then(([result]) => result),
    competitorResult,
  ]);
  expect(competitor.stderr).toBe('');
  return { competitorExitCode: competitor.exitCode, validation };
}

async function createReleaseRepository(): Promise<string> {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'passport-source-release-'))
  );
  tempRoots.push(root);
  mkdirSync(path.join(root, 'node_modules/direct-dep'), { recursive: true });
  mkdirSync(path.join(root, 'release-output'), { recursive: true });
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'tenkacloud-passport',
        version: TEST_VERSION,
        license: 'MIT',
        dependencies: { 'direct-dep': '1.2.3' },
        devDependencies: { 'dev-dep': '2.0.0' },
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    path.join(root, 'bun.lock'),
    `{
  "lockfileVersion": 1,
  "configVersion": 0,
  "workspaces": {
    "": {
      "name": "tenkacloud-passport",
      "dependencies": { "direct-dep": "1.2.3" },
      "devDependencies": { "dev-dep": "2.0.0" }
    }
  },
  "packages": {
    "dev-dep": ["dev-dep@2.0.0", "", {}, "${TEST_INTEGRITY}"],
    "direct-dep": ["direct-dep@1.2.3", "", {}, "${TEST_INTEGRITY}"],
    "nested/direct-dep": ["direct-dep@1.2.3", "", {}, "${TEST_INTEGRITY}"]
  }
}\n`
  );
  writeFileSync(
    path.join(root, 'scripts/direct-dependency-licenses.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        packages: {
          'direct-dep': { version: '1.2.3', license: 'Apache-2.0' },
          'dev-dep': { version: '2.0.0', license: 'MIT' },
        },
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    path.join(root, 'scripts/source-release-inventory.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        paths: [
          '.gitignore',
          'LICENSE',
          'README.md',
          'bun.lock',
          'package.json',
          'scripts/direct-dependency-licenses.json',
          'scripts/source-release-inventory.json',
        ],
        binaryAssets: {},
      },
      null,
      2
    )}\n`
  );
  writeFileSync(path.join(root, 'LICENSE'), 'Fixture MIT License\n');
  writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
  writeFileSync(
    path.join(root, '.gitignore'),
    'node_modules/\nrelease-output/\n'
  );
  writeFileSync(
    path.join(root, 'node_modules/direct-dep/package.json'),
    `${JSON.stringify({
      name: 'direct-dep',
      version: '1.2.3',
      license: 'Apache-2.0',
    })}\n`
  );
  await runGit(root, ['init']);
  await runGit(root, ['config', 'user.email', 'release-test@example.invalid']);
  await runGit(root, ['config', 'user.name', 'Release Test']);
  await runGit(root, [
    'add',
    '.gitignore',
    'LICENSE',
    'README.md',
    'bun.lock',
    'package.json',
    'scripts/direct-dependency-licenses.json',
    'scripts/source-release-inventory.json',
  ]);
  await runGit(root, ['commit', '-m', 'test: create release fixture']);
  return root;
}

async function archiveEntries(archivePath: string): Promise<readonly string[]> {
  const { exitCode, stdout, stderr } = await runCapturedProcess([
    'tar',
    '-tzf',
    archivePath,
  ]);
  if (exitCode !== 0) throw new Error(`tar listing failed: ${stderr}`);
  return new TextDecoder().decode(stdout).trim().split('\n');
}

describe('Issue 79 回帰: 継承した GIT_DIR / GIT_WORK_TREE から fixture リポジトリを分離する', () => {
  it('isolatedGitEnv は GIT_DIR 系の key だけを取り除き、他の環境変数は保持する', () => {
    const original = process.env['PATH'];

    const isolated = isolatedGitEnv();

    for (const key of [
      'GIT_DIR',
      'GIT_WORK_TREE',
      'GIT_INDEX_FILE',
      'GIT_COMMON_DIR',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_PREFIX',
    ]) {
      expect(isolated[key]).toBeUndefined();
    }
    expect(isolated['PATH']).toBe(original);
  });

  it('呼び出し元プロセスが GIT_DIR / GIT_WORK_TREE を継承していても、runGit は cwd の fixture リポジトリだけへ commit する（実 git 操作、モックなし）', async () => {
    // "呼び出し元リポジトリ" 役の decoy と、"fixture" 役の 2 つの実リポジトリを用意する。
    // pre-commit hook 経由で bun test が起動されたとき、git はこの decoy に相当する
    // 環境変数（GIT_DIR 等）を子プロセスへ自動で設定する（Issue 79 実装中に実際に
    // 踏んだ回帰の再現）。
    const decoyRoot = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'passport-source-release-decoy-'))
    );
    tempRoots.push(decoyRoot);
    const fixtureRoot = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'passport-source-release-fixture-'))
    );
    tempRoots.push(fixtureRoot);

    await runGit(decoyRoot, ['init']);
    await runGit(decoyRoot, [
      'config',
      'user.email',
      'release-test@example.invalid',
    ]);
    await runGit(decoyRoot, ['config', 'user.name', 'Release Test']);
    writeFileSync(path.join(decoyRoot, 'decoy.txt'), 'decoy\n');
    await runGit(decoyRoot, ['add', 'decoy.txt']);
    await runGit(decoyRoot, ['commit', '-m', 'decoy: initial commit']);
    const decoyLogBefore = await runGit(decoyRoot, ['log', '--oneline']);

    const inheritedEnv = {
      ...processEnv(),
      GIT_DIR: path.join(decoyRoot, '.git'),
      GIT_WORK_TREE: decoyRoot,
    };
    const { exitCode, stderr } = await runCapturedProcess(
      [
        'bun',
        '-e',
        `
        const { readFileSync, writeFileSync } = await import('node:fs');
        const path = await import('node:path');
        const script = await import(${JSON.stringify(path.join(import.meta.dir, 'git-env-isolation.ts'))});
        const isolatedGitEnv = script.isolatedGitEnv;
        async function runGit(root, args) {
          const process = Bun.spawn(['git', ...args], {
            cwd: root,
            env: { ...isolatedGitEnv(), GIT_AUTHOR_DATE: '2026-07-18T00:00:00Z', GIT_COMMITTER_DATE: '2026-07-18T00:00:00Z' },
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const [exitCode, stdout, stderr] = await Promise.all([
            process.exited,
            new Response(process.stdout).text(),
            new Response(process.stderr).text(),
          ]);
          if (exitCode !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + stderr);
          return stdout.trim();
        }
        const root = ${JSON.stringify(fixtureRoot)};
        await runGit(root, ['init']);
        await runGit(root, ['config', 'user.email', 'release-test@example.invalid']);
        await runGit(root, ['config', 'user.name', 'Release Test']);
        writeFileSync(path.join(root, 'fixture.txt'), 'fixture\\n');
        await runGit(root, ['add', 'fixture.txt']);
        await runGit(root, ['commit', '-m', 'test: create release fixture']);
        `,
      ],
      { env: inheritedEnv }
    );
    if (exitCode !== 0) {
      throw new Error(`fixture child failed: ${stderr}`);
    }
    expect(exitCode).toBe(0);

    const decoyLogAfter = await runGit(decoyRoot, ['log', '--oneline']);
    expect(decoyLogAfter).toBe(decoyLogBefore);
    const fixtureLog = await runGit(fixtureRoot, ['log', '--oneline']);
    expect(fixtureLog).toContain('test: create release fixture');
    expect(existsSync(path.join(fixtureRoot, 'fixture.txt'))).toBe(true);
  });
});

describe('Issue 29: Source Release の Lockfile 境界', () => {
  it('同名の異なる Version を別 Package として決定順で保持する', () => {
    const packages = parseLockedPackages(`{
      "lockfileVersion": 1,
      "packages": {
        "dep": ["dep@1.0.0", "", {}, "${TEST_INTEGRITY}"],
        "dep@2.0.0": ["dep@2.0.0", "", {}, "${TEST_INTEGRITY}"],
        "@scope/lib": ["@scope/lib@3.0.0", "", {}, "${TEST_INTEGRITY}"]
      }
    }`);

    expect(
      packages.map(
        ({ lockKey, name, version }) => `${lockKey}:${name}@${version}`
      )
    ).toEqual([
      '@scope/lib:@scope/lib@3.0.0',
      'dep:dep@1.0.0',
      'dep@2.0.0:dep@2.0.0',
    ]);
    expect(packages.every(({ sha512 }) => /^[0-9a-f]+$/.test(sha512))).toBe(
      true
    );
  });

  it('不正 Lockfile と Integrity を型付きエラーで拒否する', () => {
    for (const source of [
      'not-jsonc',
      '{ "packages": [] }',
      '{ "packages": { "dep": ["dep@1.0.0", "", {}, "sha512-not base64"] } }',
      `{ "packages": { "bad": ["@@1.0.0", "", {}, "${TEST_INTEGRITY}"] } }`,
      `{ "packages": { "bad": ["dep@1.0.0-01", "", {}, "${TEST_INTEGRITY}"] } }`,
      `{ "packages": { "dep": ["dep@1.0.0", 42, {}, "${TEST_INTEGRITY}"] } }`,
      `{ "packages": { "dep": ["dep@1.0.0", "", [], "${TEST_INTEGRITY}"] } }`,
      `{ "packages": { "dep": ["dep@1.0.0", "", {}, "${TEST_INTEGRITY}", "extra"] } }`,
    ]) {
      expect(() => parseLockedPackages(source)).toThrow(
        new ReleaseCandidateError(
          'INVALID_LOCKFILE',
          'bun.lock contains an invalid package record.'
        )
      );
    }
  });

  it('復号後に同じ package key となる JSONC record を拒否する', () => {
    const source = String.raw`{
      "packages": {
        "dep": ["dep@1.0.0", "", {}, "${TEST_INTEGRITY}"],
        "de\u0070": ["dep@2.0.0", "", {}, "${TEST_INTEGRITY}"]
      }
    }`;

    expect(() => parseLockedPackages(source)).toThrow(
      new ReleaseCandidateError(
        'INVALID_LOCKFILE',
        'bun.lock contains an invalid package record.'
      )
    );
  });

  it('Repository の frozen bun.lock 全 Package を欠落なく読む', async () => {
    const packages = parseLockedPackages(
      await Bun.file(path.join(import.meta.dir, '..', 'bun.lock')).text()
    );

    expect(packages.length).toBeGreaterThan(1_000);
    expect(packages).toContainEqual({
      lockKey: 'react',
      name: 'react',
      version: '19.2.3',
      sha512:
        '2aefe18586d58ce4275c3645bf6f9189b98b146c0575e78a1c570e4e5aedef1a65067c9ae4e1a7fe12110eca8389251c7ce46c0c2ecc3f1c28ae4f23070b0858',
    });
  });
});

describe('Issue 29: Source Release Tree の秘密情報除外', () => {
  it.each([
    'weights/model.gguf',
    'secrets/release.p12',
    'ios/profile.mobileprovision',
    'android/release.keystore',
    '.env.production',
    'node_modules/react/index.js',
    'dist/index.html',
    'coverage/lcov.info',
    'research/raw/participant-01.json',
    'pilot-data/session.csv',
    'weights/model.bin',
    'certs/release.der',
    'docs/participant-session.json',
    'docs/access-token.txt',
    'artifacts/app.apk',
    'backup/profile.sqlite',
    'participants.json',
    'exports/attendees.json',
    'passport-dump.json',
    'credentials.json',
    'id_ed25519',
    'assets/model',
    'assets/model.json',
    'docs/evidence/nearby-transport-static-screening-copy.json',
    'docs/research/interview-guide-copy.md',
    'docs/people.json',
    'docs/field-study-participant-notes.md',
    'docs/bad\nname.md',
    'unknown-root/source.ts',
  ])('禁止 Path「%s」を追跡 Release Tree に含めない', (trackedPath) => {
    expect(() => assertSafeTrackedPaths([trackedPath])).toThrow(
      new ReleaseCandidateError(
        'FORBIDDEN_RELEASE_PATH',
        `Release tree contains a forbidden path: ${trackedPath}`
      )
    );
  });

  it('Source、文書、exact Doc Data、画像、License は許可する', () => {
    expect(() =>
      assertSafeTrackedPaths([
        'src/domain/passport.ts',
        'docs/privacy/data-inventory.md',
        'docs/evidence/nearby-transport-static-screening.json',
        'docs/research/event-aggregate.schema.json',
        'docs/research/interview-guide.md',
        '.claude/state/.gitkeep',
        'docs/design/.keep',
        'assets/icon.png',
        'LICENSE',
      ])
    ).not.toThrow();
    expect(() =>
      assertSafeTrackedPaths(['src/domain/extensionless-source'])
    ).toThrow();
  });

  it('既知の秘密値を内容へ含む追跡 File を値を表示せず拒否する', () => {
    for (const content of [
      `-----BEGIN ${'PRIVATE KEY'}-----`,
      `AKIA${'A'.repeat(16)}`,
      `github_pat_${'A'.repeat(82)}`,
    ]) {
      expect(() => assertNoKnownSecretContent([content])).toThrow(
        new ReleaseCandidateError(
          'FORBIDDEN_RELEASE_CONTENT',
          'Release tree contains known secret material.'
        )
      );
    }
    expect(() =>
      assertNoKnownSecretContent([
        'Documentation mentions Token and PRIVATE KEY without a value.',
      ])
    ).not.toThrow();
  });
});

describe('Issue 29: 再現可能 Source Release Candidate', () => {
  it('CLI は引数不足を拒否し、成功時に固定 Commit と File 数を報告する', async () => {
    await expect(runCli([])).rejects.toEqual(
      new ReleaseCandidateError(
        'INVALID_VERSION',
        'Usage: bun scripts/source-release-cli.ts <version> <git-ref> <output-directory>'
      )
    );
    const root = await createReleaseRepository();
    const output = path.join(root, 'release-output/cli');
    const messages: string[] = [];

    await runCli([TEST_VERSION, 'HEAD', output], root, (message) => {
      messages.push(message);
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(
      /^Source release candidate 0\.1\.0-alpha\.1 \([0-9a-f]{40}\) created with 6 files\.$/
    );
    const log = spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runCli(
        [
          TEST_VERSION,
          'HEAD',
          path.join(root, 'release-output/cli-default-log'),
        ],
        root
      );
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('生成 / 検証 CLI 境界は成功と Usage Error を固定形式で返す', async () => {
    const root = await createReleaseRepository();
    const output = path.join(root, 'release-output/importable-cli');
    const messages: string[] = [];
    const errors: string[] = [];

    expect(
      await executeSourceReleaseCli(
        [],
        root,
        (message) => messages.push(message),
        (message) => errors.push(message)
      )
    ).toBe(1);
    expect(errors).toEqual([
      'INVALID_VERSION: Usage: bun scripts/source-release-cli.ts <version> <git-ref> <output-directory>',
    ]);
    expect(formatSourceReleaseCliError(new Error('private detail'))).toBe(
      'UNEXPECTED_RELEASE_ERROR'
    );

    expect(
      await executeSourceReleaseCli(
        [TEST_VERSION, 'HEAD', output],
        root,
        (message) => messages.push(message),
        (message) => errors.push(message)
      )
    ).toBe(0);
    await verifySourceReleaseCli([TEST_VERSION, output], (message) =>
      messages.push(message)
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]).toBe('Validated 6 source release files.');
    await expect(verifySourceReleaseCli([])).rejects.toEqual(
      new ReleaseCandidateError(
        'INVALID_VERSION',
        'Usage: source release verify <version> <candidate-directory>'
      )
    );
  });

  it('同じ Commit から2回作った全成果物が byte 単位で一致する', async () => {
    const root = await createReleaseRepository();
    const firstOutput = path.join(root, 'release-output/first');
    const secondOutput = path.join(root, 'release-output/second');

    writeFileSync(path.join(root, 'LICENSE'), 'Dirty worktree license\n');
    writeFileSync(
      path.join(root, 'node_modules/direct-dep/package.json'),
      `${JSON.stringify({
        name: 'direct-dep',
        version: '1.2.3',
        license: 'Dirty-Worktree-License',
      })}\n`
    );

    const first = await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: firstOutput,
    });
    const second = await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: secondOutput,
    });

    expect(first.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(second).toEqual({ ...first, outputDirectory: secondOutput });
    expect(readdirSync(firstOutput).sort()).toEqual([
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'checksums.txt',
      'release-manifest.json',
      `tenkacloud-passport-${TEST_VERSION}.spdx.json`,
      `tenkacloud-passport-${TEST_VERSION}.tar.gz`,
    ]);
    for (const fileName of readdirSync(firstOutput)) {
      expect(readFileSync(path.join(firstOutput, fileName))).toEqual(
        readFileSync(path.join(secondOutput, fileName))
      );
    }

    const archive = path.join(
      firstOutput,
      `tenkacloud-passport-${TEST_VERSION}.tar.gz`
    );
    const entries = await archiveEntries(archive);
    expect(entries).toContain(
      `tenkacloud-passport-${TEST_VERSION}/package.json`
    );
    expect(entries.some((entry) => entry.includes('node_modules'))).toBe(false);

    const sbom = JSON.parse(
      readFileSync(
        path.join(firstOutput, `tenkacloud-passport-${TEST_VERSION}.spdx.json`),
        'utf8'
      )
    );
    expect(sbom.spdxVersion).toBe('SPDX-2.3');
    expect(
      sbom.packages.map(({ name }: { readonly name: string }) => name)
    ).toEqual(['tenkacloud-passport', 'dev-dep', 'direct-dep', 'direct-dep']);
    const spdxIds = sbom.packages.map(
      ({ SPDXID }: { readonly SPDXID: string }) => SPDXID
    );
    expect(new Set(spdxIds).size).toBe(spdxIds.length);
    expect(() => validateSpdxDocument(sbom)).not.toThrow();
    const invalidSbom = structuredClone(sbom);
    invalidSbom.packages[2].SPDXID = invalidSbom.packages[1].SPDXID;
    expect(() => validateSpdxDocument(invalidSbom)).toThrow(
      new ReleaseCandidateError(
        'INVALID_SBOM',
        'Generated SPDX document is internally inconsistent.'
      )
    );
    const invalidChecksumSbom = structuredClone(sbom);
    invalidChecksumSbom.packages[0].checksums[0].checksumValue = 'not-a-hash';
    expect(() => validateSpdxDocument(invalidChecksumSbom)).toThrow(
      new ReleaseCandidateError(
        'INVALID_SBOM',
        'Generated SPDX document is internally inconsistent.'
      )
    );
    expect(() =>
      validateSpdxDocument({
        spdxVersion: 'SPDX-2.3',
        SPDXID: 'SPDXRef-DOCUMENT',
        packages: [
          {
            SPDXID: 'SPDXRef-Package-Incomplete',
            checksums: [{ algorithm: 'SHA256', checksumValue: 'a'.repeat(64) }],
          },
        ],
        relationships: [
          {
            spdxElementId: 'SPDXRef-DOCUMENT',
            relationshipType: 'DEPENDS_ON',
            relatedSpdxElement: 'SPDXRef-DOCUMENT',
          },
        ],
      })
    ).toThrow(
      new ReleaseCandidateError(
        'INVALID_SBOM',
        'Generated SPDX document is internally inconsistent.'
      )
    );
    for (const invalidDocument of [
      {
        ...sbom,
        creationInfo: {
          ...sbom.creationInfo,
          created: '2026-99-99T99:99:99.999Z',
        },
      },
      {
        ...sbom,
        creationInfo: {
          ...sbom.creationInfo,
          creators: ['Person: unreviewed'],
        },
      },
      {
        ...sbom,
        packages: sbom.packages.map(
          (item: Record<string, unknown>, index: number) =>
            index === 0 ? { ...item, licenseDeclared: 'Not A License' } : item
        ),
      },
      {
        ...sbom,
        packages: sbom.packages.map(
          (item: Record<string, unknown>, index: number) =>
            index === 0 ? { ...item, downloadLocation: 'not a URI' } : item
        ),
      },
      {
        ...sbom,
        packages: sbom.packages.map(
          (item: Record<string, unknown>, index: number) =>
            index === 1
              ? {
                  ...item,
                  externalRefs: [
                    {
                      referenceCategory: 'PACKAGE-MANAGER',
                      referenceType: 'purl',
                      referenceLocator: 'pkg:npm/',
                    },
                  ],
                }
              : item
        ),
      },
      {
        ...sbom,
        packages: sbom.packages.map(
          (item: Record<string, unknown>, index: number) =>
            index === 1
              ? {
                  ...item,
                  versionInfo: '1.0.0-01',
                  externalRefs: [
                    {
                      referenceCategory: 'PACKAGE-MANAGER',
                      referenceType: 'purl',
                      referenceLocator: 'pkg:npm/dev-dep@1.0.0-01',
                    },
                  ],
                }
              : item
        ),
      },
      {
        ...sbom,
        packages: sbom.packages.map(
          (item: Record<string, unknown>, index: number) =>
            index === 1 ? { ...item, SPDXID: 'SPDXRef-?invalid' } : item
        ),
      },
    ]) {
      expect(() => validateSpdxDocument(invalidDocument)).toThrow(
        new ReleaseCandidateError(
          'INVALID_SBOM',
          'Generated SPDX document is internally inconsistent.'
        )
      );
    }
    expect(
      readFileSync(path.join(firstOutput, 'THIRD_PARTY_NOTICES.md'), 'utf8')
    ).toContain('| direct-dep | 1.2.3 | runtime | Apache-2.0 |');
    expect(
      readFileSync(path.join(firstOutput, 'THIRD_PARTY_NOTICES.md'), 'utf8')
    ).toContain('| dev-dep | 2.0.0 | development | MIT |');
    expect(readFileSync(path.join(firstOutput, 'LICENSE'), 'utf8')).toBe(
      'Fixture MIT License\n'
    );
    const manifest = JSON.parse(
      readFileSync(path.join(firstOutput, 'release-manifest.json'), 'utf8')
    );
    expect(manifest.releaseStatus).toBe('draft-candidate');
    expect(() => validateReleaseManifest(manifest)).not.toThrow();
    for (const invalidManifest of [
      { ...manifest, unknownField: true },
      { ...manifest, commit: 'not-a-commit' },
      { ...manifest, commitTimestamp: '2026-13-18T00:00:00.000Z' },
      {
        ...manifest,
        files: [{ ...manifest.files[0], sha256: 'not-a-hash' }],
      },
    ]) {
      expect(() => validateReleaseManifest(invalidManifest)).toThrow(
        new ReleaseCandidateError(
          'INVALID_MANIFEST',
          'Generated release manifest is internally inconsistent.'
        )
      );
    }
    const checksumLines = readFileSync(
      path.join(firstOutput, 'checksums.txt'),
      'utf8'
    )
      .trim()
      .split('\n');
    expect(checksumLines).toHaveLength(5);
    for (const line of checksumLines) {
      const match = /^([0-9a-f]{64}) {2}([^\n]+)$/.exec(line);
      expect(match).not.toBeNull();
      const expectedHash = match?.[1] ?? '';
      const fileName = match?.[2] ?? '';
      const actualHash = createHash('sha256')
        .update(readFileSync(path.join(firstOutput, fileName)))
        .digest('hex');
      expect(actualHash).toBe(expectedHash);
      expect(fileName).not.toBe('checksums.txt');
    }
    await expect(
      validateSourceReleaseDirectory(firstOutput, TEST_VERSION)
    ).resolves.toEqual(readdirSync(firstOutput).sort());
    const checksumPath = path.join(firstOutput, 'checksums.txt');
    const canonicalChecksums = readFileSync(checksumPath, 'utf8');
    for (const invalidChecksums of [
      `${canonicalChecksums}${canonicalChecksums.split('\n')[0]}\n`,
      canonicalChecksums.replace(
        / {2}LICENSE\n/,
        `  ${path.join(firstOutput, 'LICENSE')}\n`
      ),
    ]) {
      writeFileSync(checksumPath, invalidChecksums);
      await expect(
        validateSourceReleaseDirectory(firstOutput, TEST_VERSION)
      ).rejects.toMatchObject({ code: 'INVALID_CHECKSUM' });
    }
    writeFileSync(checksumPath, canonicalChecksums);
    writeFileSync(path.join(firstOutput, 'unreviewed.txt'), 'extra\n');
    await expect(
      validateSourceReleaseDirectory(firstOutput, TEST_VERSION)
    ).rejects.toMatchObject({ code: 'INVALID_CHECKSUM' });
  });

  it('固定 Commit の直接依存 Resolution と Review 済み License を Worktree より優先する', async () => {
    const root = await createReleaseRepository();
    const lockPath = path.join(root, 'bun.lock');
    writeFileSync(
      lockPath,
      readFileSync(lockPath, 'utf8').replace(
        '"nested/direct-dep": ["direct-dep@1.2.3"',
        '"nested/direct-dep": ["direct-dep@9.9.9"'
      )
    );
    await runGit(root, ['add', 'bun.lock']);
    await runGit(root, ['commit', '-m', 'test: add transitive version']);
    writeFileSync(
      path.join(root, 'node_modules/direct-dep/package.json'),
      `${JSON.stringify({
        name: 'direct-dep',
        version: '9.9.9',
        license: 'Dirty-Worktree-License',
      })}\n`
    );

    const output = path.join(root, 'release-output/provenance');
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: output,
    });

    expect(
      readFileSync(path.join(output, 'THIRD_PARTY_NOTICES.md'), 'utf8')
    ).toContain('| direct-dep | 1.2.3 | runtime | Apache-2.0 |');
  });

  it('verifier は hash 済み basename の同一内容 inode 置換を成功扱いしない', async () => {
    const root = await createReleaseRepository();
    const output = path.join(root, 'release-output/replaced-after-hash');
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: output,
    });

    const { competitorExitCode, validation } =
      await validateDuringCandidateMutation(output, 'replace-license');

    expect(competitorExitCode).toBe(0);
    expect(validation.status).toBe('rejected');
    if (validation.status === 'rejected') {
      expect(validation.reason).toMatchObject({ code: 'INVALID_CHECKSUM' });
    }
  });

  it('verifier は初回 exact 列挙後の追加 entry を成功扱いしない', async () => {
    const root = await createReleaseRepository();
    const output = path.join(root, 'release-output/added-after-listing');
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: output,
    });

    const { competitorExitCode, validation } =
      await validateDuringCandidateMutation(output, 'add-entry');

    expect(competitorExitCode).toBe(0);
    expect(validation.status).toBe('rejected');
    if (validation.status === 'rejected') {
      expect(validation.reason).toMatchObject({ code: 'INVALID_CHECKSUM' });
    }
  });

  it('verifier は hash 済み同一 inode への in-place 書換えを成功扱いしない', async () => {
    const root = await createReleaseRepository();
    const output = path.join(root, 'release-output/rewritten-after-hash');
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: output,
    });

    const { competitorExitCode, validation } =
      await validateDuringCandidateMutation(output, 'rewrite-license');

    expect(competitorExitCode).toBe(0);
    expect(validation.status).toBe('rejected');
    if (validation.status === 'rejected') {
      expect(validation.reason).toMatchObject({ code: 'INVALID_CHECKSUM' });
    }
  });

  it('Version 不一致、危険な ref、既存 Output を上書きせず拒否する', async () => {
    const root = await createReleaseRepository();
    const nonEmptyOutput = path.join(root, 'release-output/non-empty');
    const emptyOutput = path.join(root, 'release-output/empty');
    mkdirSync(nonEmptyOutput, { recursive: true });
    mkdirSync(emptyOutput, { recursive: true });
    writeFileSync(path.join(nonEmptyOutput, 'keep.txt'), 'preserve me');

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: '0.1.0-01',
        ref: 'HEAD',
        outputDirectory: path.join(root, 'release-output/invalid-semver'),
      })
    ).rejects.toMatchObject({ code: 'INVALID_VERSION' });
    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: '1.0.0',
        ref: 'HEAD',
        outputDirectory: path.join(root, 'release-output/version'),
      })
    ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD:../../outside',
        outputDirectory: path.join(root, 'release-output/ref'),
      })
    ).rejects.toMatchObject({ code: 'INVALID_GIT_REF' });
    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: nonEmptyOutput,
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: emptyOutput,
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
    expect(readFileSync(path.join(nonEmptyOutput, 'keep.txt'), 'utf8')).toBe(
      'preserve me'
    );
  });

  it('Output symlink を追跡せず拒否する', async () => {
    const root = await createReleaseRepository();
    const target = path.join(root, 'release-output/target');
    const linkedOutput = path.join(root, 'release-output/linked');
    mkdirSync(target, { recursive: true });
    symlinkSync(target, linkedOutput);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: linkedOutput,
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
  });

  it('OS-native no-replace rename は同じ Output の1件だけを原子的に確定する', async () => {
    const root = await createReleaseRepository();
    const sourceA = path.join(root, 'release-output/source-a');
    const sourceB = path.join(root, 'release-output/source-b');
    const output = path.join(root, 'release-output/atomic-output');
    mkdirSync(sourceA);
    mkdirSync(sourceB);
    writeFileSync(path.join(sourceA, 'a.txt'), 'a');
    writeFileSync(path.join(sourceB, 'b.txt'), 'b');
    const sourceAStatus = lstatSync(sourceA);
    const sourceBStatus = lstatSync(sourceB);
    const sourceInodes = new Set([sourceAStatus.ino, sourceBStatus.ino]);
    const parentHandle = await open(
      path.dirname(output),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const results = await Promise.allSettled([
      atomicRenameDirectoryNoReplace(
        parentHandle.fd,
        path.basename(sourceA),
        path.basename(output),
        { device: sourceAStatus.dev, inode: sourceAStatus.ino }
      ),
      atomicRenameDirectoryNoReplace(
        parentHandle.fd,
        path.basename(sourceB),
        path.basename(output),
        { device: sourceBStatus.dev, inode: sourceBStatus.ino }
      ),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'ATOMIC_RENAME_FAILED',
    });
    expect(sourceInodes.has(lstatSync(output).ino)).toBe(true);
    expect(
      [sourceA, sourceB].filter((candidate) => {
        try {
          return lstatSync(candidate).isDirectory();
        } catch {
          return false;
        }
      })
    ).toHaveLength(1);

    const existing = path.join(root, 'release-output/existing-output');
    const collision = path.join(root, 'release-output/collision-source');
    mkdirSync(existing);
    mkdirSync(collision);
    writeFileSync(path.join(existing, 'keep.txt'), 'preserve');
    const existingInode = lstatSync(existing).ino;
    const collisionStatus = lstatSync(collision);
    await expect(
      atomicRenameDirectoryNoReplace(
        parentHandle.fd,
        path.basename(collision),
        path.basename(existing),
        { device: collisionStatus.dev, inode: collisionStatus.ino }
      )
    ).rejects.toEqual(
      new AtomicOutputPublicationError(
        'ATOMIC_RENAME_FAILED',
        'Atomic no-replace directory publication failed.'
      )
    );
    expect(lstatSync(existing).ino).toBe(existingInode);
    expect(readFileSync(path.join(existing, 'keep.txt'), 'utf8')).toBe(
      'preserve'
    );
    expect(lstatSync(collision).isDirectory()).toBe(true);

    await expect(
      atomicRenameDirectoryNoReplace(
        parentHandle.fd,
        'nested/relative',
        path.basename(existing),
        { device: collisionStatus.dev, inode: collisionStatus.ino }
      )
    ).rejects.toMatchObject({ code: 'INVALID_PUBLICATION_PATH' });
    await expect(
      atomicRenameDirectoryNoReplace(
        parentHandle.fd,
        path.basename(collision),
        path.basename(existing),
        { device: collisionStatus.dev, inode: collisionStatus.ino },
        'unsupported'
      )
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PLATFORM' });

    const rollbackSource = path.join(
      root,
      'release-output/identity-mismatch-source'
    );
    const rollbackOutput = path.join(
      root,
      'release-output/identity-mismatch-output'
    );
    mkdirSync(rollbackSource);
    writeFileSync(path.join(rollbackSource, 'attacker.txt'), 'preserve');
    const rollbackStatus = lstatSync(rollbackSource);
    await expect(
      atomicRenameDirectoryNoReplace(
        parentHandle.fd,
        path.basename(rollbackSource),
        path.basename(rollbackOutput),
        { device: rollbackStatus.dev, inode: rollbackStatus.ino + 1 }
      )
    ).rejects.toMatchObject({ code: 'ATOMIC_RENAME_FAILED' });
    expect(() => lstatSync(rollbackOutput)).toThrow();
    expect(lstatSync(rollbackSource).ino).toBe(rollbackStatus.ino);
    expect(
      readFileSync(path.join(rollbackSource, 'attacker.txt'), 'utf8')
    ).toBe('preserve');
    const boundedName = 'bounded-reader.txt';
    writeFileSync(path.join(root, 'release-output', boundedName), 'bounded');
    await expect(
      readRegularFileNoFollowAt(parentHandle.fd, boundedName, 7)
    ).resolves.toEqual(Buffer.from('bounded'));
    await expect(
      readRegularFileNoFollowAt(parentHandle.fd, boundedName, 6)
    ).rejects.toMatchObject({ code: 'ENTRY_READ_FAILED' });
    await expect(
      readRegularFileNoFollowAt(parentHandle.fd, 'nested/file', 7)
    ).rejects.toMatchObject({ code: 'INVALID_PUBLICATION_PATH' });
    symlinkSync(boundedName, path.join(root, 'release-output/bounded-link'));
    await expect(
      readRegularFileNoFollowAt(parentHandle.fd, 'bounded-link', 7)
    ).rejects.toMatchObject({ code: 'ENTRY_READ_FAILED' });
    await parentHandle.close();
  });

  it('保持済み Parent descriptor は Path 差し替え後も別 Directory へ公開しない', async () => {
    const root = await createReleaseRepository();
    const parent = path.join(root, 'release-output/publication-parent');
    const movedParent = path.join(root, 'release-output/moved-parent');
    const redirectParent = path.join(root, 'release-output/redirect-parent');
    const sourceName = 'staging-source';
    const destinationName = 'candidate';
    mkdirSync(path.join(parent, sourceName), { recursive: true });
    mkdirSync(redirectParent);
    const sourceStatus = lstatSync(path.join(parent, sourceName));
    const parentHandle = await open(
      parent,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    renameSync(parent, movedParent);
    symlinkSync(redirectParent, parent);

    await atomicRenameDirectoryNoReplace(
      parentHandle.fd,
      sourceName,
      destinationName,
      { device: sourceStatus.dev, inode: sourceStatus.ino }
    );

    expect(lstatSync(path.join(movedParent, destinationName)).ino).toBe(
      sourceStatus.ino
    );
    expect(() =>
      lstatSync(path.join(redirectParent, destinationName))
    ).toThrow();
    await parentHandle.close();
  });

  it('専用 Writer は cwd identity 不一致時に置換先へ書き込まない', async () => {
    const root = await createReleaseRepository();
    const writerDirectory = path.join(root, 'release-output/writer');
    const outputName = 'sentinel.txt';
    mkdirSync(writerDirectory);
    const status = lstatSync(writerDirectory);
    const input = () => new Blob(['descriptor-bound output\n']).stream();
    assertWrittenOutputSnapshot(true, 0n, 0);
    expect(() => assertWrittenOutputSnapshot(false, 0n, 0)).toThrow(
      'Output file identity changed while writing.'
    );
    expect(() => assertWrittenOutputSnapshot(true, 1n, 0)).toThrow(
      'Output file identity changed while writing.'
    );
    await expect(
      writeExclusiveOutput([], input(), writerDirectory)
    ).rejects.toThrow('Invalid exclusive output writer arguments.');
    await expect(
      writeExclusiveOutput(
        [outputName, 'invalid-device', String(status.ino), '--'],
        input(),
        writerDirectory
      )
    ).rejects.toThrow('Invalid output directory identity.');
    await expect(
      writeExclusiveOutput(
        [outputName, String(status.dev), String(status.ino + 1), '--'],
        input(),
        writerDirectory
      )
    ).rejects.toThrow('Output directory identity changed before writing.');
    expect(() => lstatSync(path.join(writerDirectory, outputName))).toThrow();

    const written = await writeExclusiveOutput(
      [outputName, String(status.dev), String(status.ino), '--'],
      input(),
      writerDirectory
    );
    expect(readFileSync(path.join(writerDirectory, outputName), 'utf8')).toBe(
      'descriptor-bound output\n'
    );
    expect(written.fileName).toBe(outputName);
    expect(written.byteLength).toBe('descriptor-bound output\n'.length);
    expect(written.sha256).toBe(
      createHash('sha256').update('descriptor-bound output\n').digest('hex')
    );
    expect(lstatSync(path.join(writerDirectory, outputName)).mode & 0o777).toBe(
      0o600
    );
    const writerHandle = await open(
      writerDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY
    );
    await assertRegularFileIdentitiesNoFollowAt(writerHandle.fd, [written]);
    expect(() => openExclusiveEntryAt(writerHandle.fd, outputName)).toThrow(
      'Exclusive output file could not be created.'
    );
    expect(() =>
      openExclusiveEntryAt(writerHandle.fd, 'unsupported.txt', 'win32')
    ).toThrow('Exclusive output writer is unsupported on this platform.');
    const replacement = path.join(writerDirectory, 'replacement.txt');
    writeFileSync(replacement, 'descriptor-bound output\n');
    renameSync(replacement, path.join(writerDirectory, outputName));
    await expect(
      assertRegularFileIdentitiesNoFollowAt(writerHandle.fd, [written])
    ).rejects.toThrow('no longer names the verified file');
    await writerHandle.close();

    await writeExclusiveOutput(
      [
        'command.txt',
        String(status.dev),
        String(status.ino),
        '--',
        'bun',
        '-e',
        'process.stdout.write("command output\\n")',
      ],
      input(),
      writerDirectory
    );
    expect(
      readFileSync(path.join(writerDirectory, 'command.txt'), 'utf8')
    ).toBe('command output\n');
    await expect(
      writeExclusiveOutput(
        [
          'failed.txt',
          String(status.dev),
          String(status.ino),
          '--',
          'bun',
          '-e',
          'process.stderr.write("fixed failure"); process.exit(2)',
        ],
        input(),
        writerDirectory
      )
    ).rejects.toThrow('Output source command failed: fixed failure');
  });

  it('失敗 cleanup は staging 全体を隔離し置換・未知・生成済み File を削除しない', async () => {
    const root = await createReleaseRepository();
    const directory = path.join(root, 'release-output/cleanup-boundary');
    mkdirSync(directory);
    const manifestPath = path.join(directory, 'release-manifest.json');
    const ownedPath = path.join(directory, 'owned.txt');
    const unknownPath = path.join(directory, 'unknown.txt');
    writeFileSync(manifestPath, 'owned manifest');
    writeFileSync(ownedPath, 'owned');
    const manifestStatus = lstatSync(manifestPath);
    const ownedStatus = lstatSync(ownedPath);
    unlinkSync(manifestPath);
    writeFileSync(manifestPath, 'replacement manifest');
    const replacementManifestStatus = lstatSync(manifestPath);
    writeFileSync(unknownPath, 'concurrent file');
    const directoryStatus = lstatSync(directory);
    const parentPath = path.dirname(directory);
    const parentStatus = lstatSync(parentPath);
    const parentHandle = await open(
      parentPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const handle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );

    await expect(
      cleanupRecordedOutputDirectory({
        parent: {
          path: parentPath,
          device: parentStatus.dev,
          inode: parentStatus.ino,
        },
        parentHandle,
        directory: {
          path: directory,
          device: directoryStatus.dev,
          inode: directoryStatus.ino,
        },
        handle,
        files: [
          {
            fileName: 'owned.txt',
            device: ownedStatus.dev,
            inode: ownedStatus.ino,
          },
          {
            fileName: 'release-manifest.json',
            device: manifestStatus.dev,
            inode: manifestStatus.ino,
          },
        ],
      })
    ).resolves.toBe(true);
    expect(() => lstatSync(directory)).toThrow();
    const failedNames = readdirSync(parentPath).filter((entry) =>
      entry.startsWith('.tenkacloud-passport-failed-')
    );
    expect(failedNames).toHaveLength(1);
    const failedDirectory = path.join(parentPath, failedNames[0] ?? 'missing');
    expect(lstatSync(failedDirectory).ino).toBe(directoryStatus.ino);
    expect(
      readFileSync(path.join(failedDirectory, 'release-manifest.json'), 'utf8')
    ).toBe('replacement manifest');
    expect(
      lstatSync(path.join(failedDirectory, 'release-manifest.json')).ino
    ).toBe(replacementManifestStatus.ino);
    expect(
      readFileSync(path.join(failedDirectory, 'unknown.txt'), 'utf8')
    ).toBe('concurrent file');
    expect(readFileSync(path.join(failedDirectory, 'owned.txt'), 'utf8')).toBe(
      'owned'
    );
  });

  it('Parent Path 差し替え後の rollback staging も保持済み FD 内で隔離する', async () => {
    const root = await createReleaseRepository();
    const parent = path.join(root, 'release-output/cleanup-parent');
    const movedParent = path.join(root, 'release-output/moved-cleanup-parent');
    const redirectParent = path.join(
      root,
      'release-output/redirect-cleanup-parent'
    );
    const staging = path.join(parent, '.tenkacloud-passport-release-fixed');
    mkdirSync(staging, { recursive: true });
    mkdirSync(redirectParent);
    const manifestPath = path.join(staging, 'release-manifest.json');
    writeFileSync(manifestPath, 'complete but unpublished');
    const parentStatus = lstatSync(parent);
    const stagingStatus = lstatSync(staging);
    const manifestStatus = lstatSync(manifestPath);
    const parentHandle = await open(
      parent,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const stagingHandle = await open(
      staging,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    renameSync(parent, movedParent);
    symlinkSync(redirectParent, parent);

    await expect(
      cleanupRecordedOutputDirectory({
        parent: {
          path: parent,
          device: parentStatus.dev,
          inode: parentStatus.ino,
        },
        parentHandle,
        directory: {
          path: staging,
          device: stagingStatus.dev,
          inode: stagingStatus.ino,
        },
        handle: stagingHandle,
        files: [
          {
            fileName: 'release-manifest.json',
            device: manifestStatus.dev,
            inode: manifestStatus.ino,
          },
        ],
      })
    ).resolves.toBe(true);
    expect(() =>
      lstatSync(path.join(movedParent, path.basename(staging)))
    ).toThrow();
    const failedNames = readdirSync(movedParent).filter((entry) =>
      entry.startsWith('.tenkacloud-passport-failed-')
    );
    expect(failedNames).toHaveLength(1);
    expect(
      readFileSync(
        path.join(
          movedParent,
          failedNames[0] ?? 'missing',
          'release-manifest.json'
        ),
        'utf8'
      )
    ).toBe('complete but unpublished');
    expect(readdirSync(redirectParent)).toEqual([]);
  });

  it('生成途中の SPDX 失敗は requested Output を作らず隔離して同じ Path で再実行できる', async () => {
    const root = await createReleaseRepository();
    const packagePath = path.join(root, 'package.json');
    const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
    metadata.license = 'Not A License';
    writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
    await runGit(root, ['add', 'package.json']);
    await runGit(root, ['commit', '-m', 'test: add invalid project license']);
    const output = path.join(root, 'release-output/retry');

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: output,
      })
    ).rejects.toMatchObject({ code: 'INVALID_SBOM' });
    expect(() => lstatSync(output)).toThrow();
    expect(
      readdirSync(path.join(root, 'release-output')).some((entry) =>
        entry.startsWith('.tenkacloud-passport-release-')
      )
    ).toBe(false);
    expect(
      readdirSync(path.join(root, 'release-output')).filter((entry) =>
        entry.startsWith('.tenkacloud-passport-failed-')
      )
    ).toHaveLength(1);

    metadata.license = 'MIT';
    writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
    await runGit(root, ['add', 'package.json']);
    await runGit(root, ['commit', '-m', 'test: repair project license']);
    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: output,
      })
    ).resolves.toMatchObject({ outputDirectory: output });
  });

  it('Output の直接 Parent symlink を解決先へ追跡せず拒否する', async () => {
    const root = await createReleaseRepository();
    const targetParent = path.join(root, 'release-output/target-parent');
    const linkedParent = path.join(root, 'release-output/linked-parent');
    mkdirSync(targetParent, { recursive: true });
    symlinkSync(targetParent, linkedParent);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: path.join(linkedParent, 'candidate'),
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
  });

  it('Output の祖先 symlink を途中の Directory で追跡せず拒否する', async () => {
    const root = await createReleaseRepository();
    const targetAncestor = path.join(root, 'release-output/target-ancestor');
    const linkedAncestor = path.join(root, 'release-output/linked-ancestor');
    mkdirSync(path.join(targetAncestor, 'real-parent'), { recursive: true });
    symlinkSync(targetAncestor, linkedAncestor);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: path.join(linkedAncestor, 'real-parent', 'candidate'),
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
  });

  it('build 後に Parent を偽 Candidate への symlink に替えても独立 verify は拒否する', async () => {
    const root = await createReleaseRepository();
    const parent = path.join(root, 'release-output/verified-parent');
    const movedParent = path.join(root, 'release-output/moved-verified-parent');
    const redirectParent = path.join(
      root,
      'release-output/redirect-verified-parent'
    );
    const output = path.join(parent, 'candidate');
    mkdirSync(parent);
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: output,
    });
    renameSync(parent, movedParent);
    mkdirSync(redirectParent);
    cpSync(
      path.join(movedParent, 'candidate'),
      path.join(redirectParent, 'candidate'),
      { recursive: true }
    );
    symlinkSync(redirectParent, parent);

    await expect(
      verifySourceReleaseCli([TEST_VERSION, output], () => undefined)
    ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
  });

  it('公開後 verifier は retained handle と別 inode の自己整合 Candidate を拒否する', async () => {
    const root = await createReleaseRepository();
    const original = path.join(root, 'release-output/published-original');
    const replacement = path.join(
      root,
      'release-output/self-consistent-replacement'
    );
    const displaced = path.join(root, 'release-output/displaced-original');
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: original,
    });
    await buildSourceRelease({
      repositoryRoot: root,
      version: TEST_VERSION,
      ref: 'HEAD',
      outputDirectory: replacement,
    });
    const originalStatus = lstatSync(original);
    const replacementStatus = lstatSync(replacement);
    const retainedHandle = await open(
      original,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    renameSync(original, displaced);
    renameSync(replacement, original);

    try {
      await expect(
        validateOpenedSourceReleaseDirectory(
          {
            handle: retainedHandle,
            identity: {
              path: original,
              device: originalStatus.dev,
              inode: originalStatus.ino,
            },
          },
          TEST_VERSION
        )
      ).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT_DIRECTORY' });
    } finally {
      await retainedHandle.close();
    }
    expect(lstatSync(original).ino).toBe(replacementStatus.ino);
    expect(lstatSync(displaced).ino).toBe(originalStatus.ino);
  });

  it('追跡 Tree の symlink を Source Archive に含めず拒否する', async () => {
    const root = await createReleaseRepository();
    mkdirSync(path.join(root, 'docs'));
    symlinkSync('../README.md', path.join(root, 'docs/readme-link.md'));
    await runGit(root, ['add', 'docs/readme-link.md']);
    await runGit(root, ['commit', '-m', 'test: add tracked symlink']);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: path.join(root, 'release-output/symlink-tree'),
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_RELEASE_PATH' });
  });

  it('Review 済み Inventory にない許可拡張子の File を拒否する', async () => {
    const root = await createReleaseRepository();
    mkdirSync(path.join(root, 'docs'));
    writeFileSync(path.join(root, 'docs/notes.md'), '# Unreviewed notes\n');
    await runGit(root, ['add', 'docs/notes.md']);
    await runGit(root, ['commit', '-m', 'test: add unreviewed text']);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: path.join(root, 'release-output/unreviewed'),
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_RELEASE_PATH' });
  });

  it('Review 済み Binary 内の既知 Secret byte を値を出さず拒否する', async () => {
    const root = await createReleaseRepository();
    const secret = Buffer.concat([
      Buffer.from([0, 255]),
      Buffer.from(`github_pat_${'A'.repeat(82)}`),
    ]);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'assets/icon.png'), secret);
    const inventoryPath = path.join(
      root,
      'scripts/source-release-inventory.json'
    );
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    inventory.paths.push('assets/icon.png');
    inventory.paths.sort();
    inventory.binaryAssets['assets/icon.png'] = createHash('sha256')
      .update(secret)
      .digest('hex');
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    await runGit(root, [
      'add',
      'assets/icon.png',
      'scripts/source-release-inventory.json',
    ]);
    await runGit(root, ['commit', '-m', 'test: add binary secret']);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: path.join(root, 'release-output/binary-secret'),
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_RELEASE_CONTENT' });
  });

  it('Review 済み Text でも 5 MiB を超える Blob を拒否する', async () => {
    const root = await createReleaseRepository();
    mkdirSync(path.join(root, 'docs'));
    writeFileSync(
      path.join(root, 'docs/large.md'),
      'A'.repeat(5 * 1024 * 1024 + 1)
    );
    const inventoryPath = path.join(
      root,
      'scripts/source-release-inventory.json'
    );
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    inventory.paths.push('docs/large.md');
    inventory.paths.sort();
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    await runGit(root, [
      'add',
      'docs/large.md',
      'scripts/source-release-inventory.json',
    ]);
    await runGit(root, ['commit', '-m', 'test: add oversized source']);

    await expect(
      buildSourceRelease({
        repositoryRoot: root,
        version: TEST_VERSION,
        ref: 'HEAD',
        outputDirectory: path.join(root, 'release-output/oversized'),
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_RELEASE_CONTENT' });
  });

  it('descriptor verifier は 16 MiB File を peak RSS 12 MiB 増分以内で streaming hash する', async () => {
    const root = await createReleaseRepository();
    const fixtureDirectory = path.join(root, 'release-output/stream-rss');
    const fixtureName = 'fixed-16-mib.bin';
    const warmupName = 'warmup.bin';
    mkdirSync(fixtureDirectory);
    const fixtureContents = Buffer.alloc(16 * 1024 * 1024, 0xa5);
    writeFileSync(path.join(fixtureDirectory, fixtureName), fixtureContents);
    writeFileSync(path.join(fixtureDirectory, warmupName), 'warmup');
    const expectedHash = createHash('sha256')
      .update(fixtureContents)
      .digest('hex');
    const { exitCode, stdout, stderr } = await runCapturedProcess(
      [
        'bun',
        '-e',
        `
          import { constants } from 'node:fs';
          import { open } from 'node:fs/promises';
          const { hashRegularFileNoFollowAt } = await import('./scripts/atomic-output-publisher.ts');
          const handle = await open(
            process.env.TASK_STREAM_DIRECTORY,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
          );
          await hashRegularFileNoFollowAt(handle.fd, process.env.TASK_WARMUP_NAME, 1024);
          const baseline = process.memoryUsage().rss;
          let peak = baseline;
          const sampler = setInterval(() => {
            peak = Math.max(peak, process.memoryUsage().rss);
          }, 1);
          const result = await hashRegularFileNoFollowAt(
            handle.fd,
            process.env.TASK_STREAM_FILE_NAME,
            20 * 1024 * 1024
          );
          clearInterval(sampler);
          peak = Math.max(peak, process.memoryUsage().rss);
          await handle.close();
          console.log(JSON.stringify({ ...result, peakRssDelta: peak - baseline }));
        `,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...processEnv(),
          TASK_STREAM_DIRECTORY: fixtureDirectory,
          TASK_STREAM_FILE_NAME: fixtureName,
          TASK_WARMUP_NAME: warmupName,
        },
      }
    );
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    const result = JSON.parse(new TextDecoder().decode(stdout)) as {
      readonly byteLength: number;
      readonly peakRssDelta: number;
      readonly sha256: string;
    };
    expect(result.byteLength).toBe(16 * 1024 * 1024);
    expect(result.sha256).toBe(expectedHash);
    expect(result.peakRssDelta).toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  it('Blob size を内容の前に検査し Archive を child process から streaming する', () => {
    const source = readFileSync(
      path.join(import.meta.dir, 'source-release.ts'),
      'utf8'
    );
    const writer = readFileSync(
      path.join(import.meta.dir, 'exclusive-output-writer.ts'),
      'utf8'
    );

    expect(source).toContain("['git', 'cat-file', '-s'");
    expect(source).toContain(
      "path.join(import.meta.dir, 'exclusive-output-writer.ts')"
    );
    expect(writer).toContain('await pipeline(stdout, hashingStream, output)');
    expect(writer).toContain('fstatSync(descriptor, { bigint: true })');
    expect(source).toContain('await assertRecordedOutputFiles(transaction)');
    expect(source).not.toMatch(/archiveBytes|git archive stdout/);
    expect(source).not.toContain('rmdir(');
    expect(source).toContain('await validateOpenedSourceReleaseDirectory(');
  });
});
