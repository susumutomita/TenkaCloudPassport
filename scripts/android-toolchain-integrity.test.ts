import { afterEach, describe, expect, it } from 'bun:test';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rmdir,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AndroidArtifactIntegrityError } from './android-artifact-integrity-error';
import {
  assertApprovedToolchainDirectory,
  assertCanonicalToolchainFile,
  createApprovedToolchainSnapshot,
  fingerprintToolchainDirectory,
} from './android-toolchain-integrity';
import { runCapturedProcess } from './process-capture';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'tenka-toolchain-'))
  );
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

afterEach(async () => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined) {
      await cleanupTree(directory);
      await rmdir(directory);
    }
  }
});

describe('Issue 28: Android verifier toolchain fingerprint', () => {
  it('relative path と全 dependency byte を決定的な tree digest に結合する', async () => {
    const root = await temporaryDirectory();
    const lib = join(root, 'lib');
    await mkdir(lib);
    await writeFile(join(root, 'java'), 'approved java runtime');
    await writeFile(join(lib, 'apksigner.jar'), 'approved signer');

    const first = await fingerprintToolchainDirectory(root);
    const second = await fingerprintToolchainDirectory(root);

    expect(first).toEqual(second);
    expect(first.fileCount).toBe(2);
    await expect(
      assertApprovedToolchainDirectory(root, first.sha256)
    ).resolves.toEqual(first);
  });

  it('launcher が同じでも JAR または Java runtime の差替を拒否する', async () => {
    const root = await temporaryDirectory();
    const launcher = join(root, 'launcher');
    const jar = join(root, 'verifier.jar');
    await writeFile(launcher, 'stable launcher');
    await writeFile(jar, 'approved verifier');
    const approved = await fingerprintToolchainDirectory(root);

    await writeFile(jar, 'replaced verifier');

    await expect(
      assertApprovedToolchainDirectory(root, approved.sha256)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Android verifier toolchain does not match the approved fingerprint.'
      )
    );
  });

  it('承認済み tree を private read-only snapshot に固定して元 tree の後続差替と分離する', async () => {
    const root = await temporaryDirectory();
    const bin = join(root, 'bin');
    const lib = join(root, 'lib');
    await mkdir(bin);
    await mkdir(lib);
    const java = join(bin, 'java');
    const jar = join(lib, 'verifier.jar');
    await writeFile(java, 'approved java runtime');
    await chmod(java, 0o700);
    await writeFile(jar, 'approved verifier');
    const approved = await fingerprintToolchainDirectory(root);

    const snapshot = await createApprovedToolchainSnapshot(
      root,
      approved.sha256
    );
    try {
      await writeFile(jar, 'replaced verifier');
      const snapshotJar = join(snapshot.root, 'lib', 'verifier.jar');
      expect(await readFile(snapshotJar, 'utf8')).toBe('approved verifier');
      expect((await lstat(snapshot.root)).mode & 0o222).toBe(0);
      expect((await lstat(snapshotJar)).mode & 0o222).toBe(0);
      await expect(
        assertApprovedToolchainDirectory(snapshot.root, approved.sha256)
      ).resolves.toEqual(snapshot.fingerprint);
      await expect(
        assertCanonicalToolchainFile(
          snapshot.root,
          join(snapshot.root, 'bin', 'java'),
          true
        )
      ).resolves.toBeUndefined();
    } finally {
      await snapshot.dispose();
    }
  });

  it('単一 File の 4 GiB 超過を内容の読取前に拒否する', async () => {
    const root = await temporaryDirectory();
    const oversized = join(root, 'oversize.bin');
    await writeFile(oversized, '');
    await truncate(oversized, 4 * 1024 * 1024 * 1024 + 1);

    await expect(fingerprintToolchainDirectory(root)).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Android verifier toolchain exceeds the 4 GiB byte limit.'
      )
    );
  });

  it('File と Directory の合計 entry 数を 16,384 件に制限する', async () => {
    const root = await temporaryDirectory();
    const names = Array.from({ length: 16_385 }, (_, index) =>
      join(root, `entry-${index.toString().padStart(5, '0')}`)
    );
    for (let offset = 0; offset < names.length; offset += 256) {
      await Promise.all(
        names.slice(offset, offset + 256).map((path) => mkdir(path))
      );
    }

    await expect(fingerprintToolchainDirectory(root)).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Android verifier toolchain exceeds the entry-count limit.'
      )
    );
  });

  it('root 外 File と symlink dependency を拒否する', async () => {
    const root = await temporaryDirectory();
    const outsideRoot = await temporaryDirectory();
    const java = join(root, 'java');
    const outside = join(outsideRoot, 'outside.jar');
    const linked = join(root, 'linked.jar');
    await writeFile(java, 'java');
    await chmod(java, 0o700);
    await writeFile(outside, 'outside');
    await symlink(outside, linked);

    await expect(
      assertCanonicalToolchainFile(root, java, true)
    ).resolves.toBeUndefined();
    await expect(
      assertCanonicalToolchainFile(root, outside, false)
    ).rejects.toThrow();
    await expect(fingerprintToolchainDirectory(root)).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_TOOL_PATH',
        'Android verifier toolchain must not contain symbolic links.'
      )
    );
  });

  it('CLI は実 Directory tree の fingerprint を同じ形式で返す', async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, 'runtime.jar'), 'runtime');
    const expected = await fingerprintToolchainDirectory(root);
    const scriptPath = join(import.meta.dir, 'android-toolchain-integrity.ts');
    const result = await runCapturedProcess([
      'bun',
      scriptPath,
      'fingerprint',
      root,
    ]);

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe(
      `${expected.sha256}  ${root}\n`
    );
  });
});
