import { afterEach, describe, expect, it } from 'bun:test';
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rmdir,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  assertOpenedFilePathUnchanged,
  openStableFileForRead,
  type StableFileReadPolicy,
} from './android-artifact-file-guard';
import {
  AndroidArtifactIntegrityError,
  assertAndroidReleaseVersionIncrement,
  createAndroidArtifactChecksum,
  createAndroidArtifactSnapshot,
  inspectAndroidArtifact,
  readAndroidReleaseVersionCode,
  verifyAndroidArtifactChecksum,
} from './android-artifact-integrity';

const directories: string[] = [];
const EXPECTED_SHA256 =
  '8646fe442192b5d2b5f32e142d780fc5f2b01084702e8b76c33beb7131805736';
const PORTABLE_APK_POLICY: StableFileReadPolicy = {
  noFollowFlag: undefined,
  symbolicLinkMessage: 'Android release artifact must not be a symbolic link.',
  invalidCode: 'INVALID_APK_PATH',
  invalidMessage: 'Android release artifact must be a regular .apk file.',
  changedCode: 'ARTIFACT_CHANGED',
  changedMessage: 'Android release artifact changed while it was being read.',
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tenka-android-artifact-'));
  directories.push(directory);
  return directory;
}

async function cleanupDirectory(directory: string): Promise<void> {
  for (const entry of await readdir(directory)) {
    await unlink(join(directory, entry));
  }
  await rmdir(directory);
}

async function startContinuousFirstByteMutation(
  path: string
): Promise<() => Promise<void>> {
  const handle = await open(path, 'r+');
  let shouldContinue = true;
  let firstWriteCompleted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    firstWriteCompleted = resolve;
  });
  const mutation = (async () => {
    let byte = 0x38;
    try {
      while (shouldContinue) {
        await handle.write(Uint8Array.of(byte), 0, 1, 0);
        firstWriteCompleted?.();
        firstWriteCompleted = undefined;
        byte = byte === 0x38 ? 0x39 : 0x38;
      }
    } finally {
      await handle.close();
    }
  })();
  await started;
  return async () => {
    shouldContinue = false;
    await mutation;
  };
}

afterEach(async () => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined) await cleanupDirectory(directory);
  }
});

describe('Issue 28: Android Release APK の SHA-256 完全性契約', () => {
  it('app.json の追跡済み versionCode が過去 Release より大きいときだけ通す', async () => {
    const appConfigPath = join(import.meta.dir, '..', 'app.json');
    const versionCode = await readAndroidReleaseVersionCode(appConfigPath);

    expect(versionCode).toBe(1);
    expect(assertAndroidReleaseVersionIncrement(versionCode, 0)).toBe(1);
    expect(() => assertAndroidReleaseVersionIncrement(versionCode, 1)).toThrow(
      new AndroidArtifactIntegrityError(
        'VERSION_CODE_NOT_INCREMENTED',
        'Android versionCode must be greater than the previous release.'
      )
    );
    expect(() => assertAndroidReleaseVersionIncrement(versionCode, -1)).toThrow(
      new AndroidArtifactIntegrityError(
        'INVALID_PREVIOUS_VERSION_CODE',
        'Previous Android versionCode must be a non-negative integer.'
      )
    );
    expect(() => assertAndroidReleaseVersionIncrement(1.5, 0)).toThrow(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_VERSION_CODE',
        'Expo app config must contain a positive integer Android versionCode.'
      )
    );
  });

  it.each([
    [{}, 'INVALID_ANDROID_VERSION_CODE'],
    [{ expo: { android: {} } }, 'INVALID_ANDROID_VERSION_CODE'],
    [{ expo: { android: { versionCode: 0 } } }, 'INVALID_ANDROID_VERSION_CODE'],
    [
      { expo: { android: { versionCode: 1.5 } } },
      'INVALID_ANDROID_VERSION_CODE',
    ],
  ] as const)('不正な Android versionCode 設定 %j を拒否する', async (config, code) => {
    const directory = await temporaryDirectory();
    const configPath = join(directory, 'app.json');
    await writeFile(configPath, JSON.stringify(config));

    try {
      await readAndroidReleaseVersionCode(configPath);
      throw new Error('versionCode 検証は拒否される必要があります。');
    } catch (error) {
      expect(error).toBeInstanceOf(AndroidArtifactIntegrityError);
      expect((error as AndroidArtifactIntegrityError).code).toBe(code);
    }
  });

  it('app.json の Symbolic Link を versionCode 設定として拒否する', async () => {
    const directory = await temporaryDirectory();
    const realConfigPath = join(directory, 'real-app.json');
    const linkedConfigPath = join(directory, 'app.json');
    await writeFile(
      realConfigPath,
      JSON.stringify({ expo: { android: { versionCode: 1 } } })
    );
    await symlink(realConfigPath, linkedConfigPath);

    await expect(
      readAndroidReleaseVersionCode(linkedConfigPath)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'SYMLINK_NOT_ALLOWED',
        'Expo app config must not be a symbolic link.'
      )
    );
  });

  it('app.json は上限ちょうどの全 byte を読み、1 byte 超過を拒否する', async () => {
    const directory = await temporaryDirectory();
    const exactConfigPath = join(directory, 'exact-app.json');
    const oversizedConfigPath = join(directory, 'oversized-app.json');
    const validConfig = JSON.stringify({
      expo: {
        android: { package: 'cloud.tenka.passport', versionCode: 1 },
      },
    });
    await writeFile(exactConfigPath, validConfig.padEnd(128 * 1024, ' '));
    await writeFile(
      oversizedConfigPath,
      validConfig.padEnd(128 * 1024 + 1, ' ')
    );

    await expect(readAndroidReleaseVersionCode(exactConfigPath)).resolves.toBe(
      1
    );
    await expect(
      readAndroidReleaseVersionCode(oversizedConfigPath)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_VERSION_CODE',
        'Expo app config must contain a positive integer Android versionCode.'
      )
    );
  });

  it('実 APK byte を incremental に読み、basename だけを持つ checksum file を Atomic に作る', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'tenkacloud-passport-1.0.0.apk');
    await writeFile(apkPath, 'signed apk bytes');

    const result = await createAndroidArtifactChecksum(apkPath);

    expect(result).toEqual({
      apkFileName: basename(apkPath),
      byteLength: 16,
      sha256: EXPECTED_SHA256,
      checksumPath: `${apkPath}.sha256`,
    });
    expect(await readFile(result.checksumPath, 'utf8')).toBe(
      `${EXPECTED_SHA256}  tenkacloud-passport-1.0.0.apk\n`
    );
    expect((await readdir(directory)).sort()).toEqual([
      'tenkacloud-passport-1.0.0.apk',
      'tenkacloud-passport-1.0.0.apk.sha256',
    ]);
  });

  it('同じ APK と checksum file は検証できる', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');
    const created = await createAndroidArtifactChecksum(apkPath);

    await expect(
      verifyAndroidArtifactChecksum(apkPath, created.checksumPath)
    ).resolves.toEqual(created);
  });

  it('APK を private immutable snapshot に固定し、元 File の後続変更と分離する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');

    const snapshot = await createAndroidArtifactSnapshot(apkPath);
    try {
      expect(snapshot.path.startsWith(`${directory}/`)).toBe(false);
      expect(snapshot).toMatchObject({
        apkFileName: 'passport.apk',
        byteLength: 16,
        sha256: EXPECTED_SHA256,
      });
      await writeFile(apkPath, 'changed apk bytes');
      await expect(inspectAndroidArtifact(snapshot.path)).resolves.toEqual({
        apkFileName: 'passport.apk',
        byteLength: 16,
        sha256: EXPECTED_SHA256,
      });
      await expect(writeFile(snapshot.path, 'replacement')).rejects.toThrow();
    } finally {
      await snapshot.dispose();
      await snapshot.dispose();
    }
    await expect(access(snapshot.path)).rejects.toThrow();
  });

  it('512 MiB を超える sparse APK は snapshot 作成前に拒否する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'oversized.apk');
    await writeFile(apkPath, '');
    await truncate(apkPath, 512 * 1024 * 1024 + 1);

    await expect(createAndroidArtifactSnapshot(apkPath)).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_APK_PATH',
        'Android release artifact exceeds the 512 MiB verification limit.'
      )
    );
  });

  it('checksum 公開後に APK が差し替わると record を残さず拒否する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');

    await expect(
      createAndroidArtifactChecksum(apkPath, {
        afterChecksumPublished: async () => {
          await writeFile(apkPath, 'changed apk bytes');
        },
      })
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'ARTIFACT_CHANGED',
        'Android release artifact changed while it was being read.'
      )
    );
    expect(await readdir(directory)).toEqual(['passport.apk']);
  });

  it('checksum 公開後に record が差し替わると成功せず record を残さない', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');

    await expect(
      createAndroidArtifactChecksum(apkPath, {
        afterChecksumPublished: async () => {
          await writeFile(
            `${apkPath}.sha256`,
            `${'0'.repeat(64)}  passport.apk\n`
          );
        },
      })
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'CHECKSUM_RECORD_CHANGED',
        'Android checksum record changed while it was being read.'
      )
    );
    expect(await readdir(directory)).toEqual(['passport.apk']);
  });

  it('初回 checksum 読取後に record が差し替わると旧 record で成功しない', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');
    const created = await createAndroidArtifactChecksum(apkPath);

    await expect(
      verifyAndroidArtifactChecksum(apkPath, created.checksumPath, {
        afterInitialChecksumRead: async () => {
          await writeFile(
            created.checksumPath,
            `${'0'.repeat(64)}  passport.apk\n`
          );
        },
      })
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'CHECKSUM_RECORD_CHANGED',
        'Android checksum record changed while it was being read.'
      )
    );
  });

  it('checksum 作成後に APK byte が変わると型付き不一致で拒否する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');
    const created = await createAndroidArtifactChecksum(apkPath);
    await writeFile(apkPath, 'changed apk bytes');

    await expect(
      verifyAndroidArtifactChecksum(apkPath, created.checksumPath)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'CHECKSUM_MISMATCH',
        'Android artifact SHA-256 does not match the checksum record.'
      )
    );
  });

  it.each([
    ['short digest  passport.apk\n', 'INVALID_CHECKSUM_RECORD'],
    [`${EXPECTED_SHA256}  ../passport.apk\n`, 'INVALID_CHECKSUM_RECORD'],
    [`${EXPECTED_SHA256}  passport.apk\nextra\n`, 'INVALID_CHECKSUM_RECORD'],
    [`${EXPECTED_SHA256}  another.apk\n`, 'ARTIFACT_NAME_MISMATCH'],
  ] as const)('不正または別 Artifact の checksum record「%s」を拒否する', async (record, code) => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    const checksumPath = `${apkPath}.sha256`;
    await writeFile(apkPath, 'signed apk bytes');
    await writeFile(checksumPath, record);

    try {
      await verifyAndroidArtifactChecksum(apkPath, checksumPath);
      throw new Error('検証は拒否される必要があります。');
    } catch (error) {
      expect(error).toBeInstanceOf(AndroidArtifactIntegrityError);
      expect((error as AndroidArtifactIntegrityError).code).toBe(code);
    }
  });

  it('空 APK、拡張子違い、Symbolic Link は Release Artifact として拒否する', async () => {
    const directory = await temporaryDirectory();
    const emptyApk = join(directory, 'empty.apk');
    const bundlePath = join(directory, 'passport.aab');
    const realApk = join(directory, 'real.apk');
    const linkedApk = join(directory, 'linked.apk');
    await writeFile(emptyApk, '');
    await writeFile(bundlePath, 'signed apk bytes');
    await writeFile(realApk, 'signed apk bytes');
    await symlink(realApk, linkedApk);

    for (const [path, code] of [
      [emptyApk, 'EMPTY_ARTIFACT'],
      [bundlePath, 'INVALID_APK_PATH'],
      [linkedApk, 'SYMLINK_NOT_ALLOWED'],
    ] as const) {
      try {
        await createAndroidArtifactChecksum(path);
        throw new Error('checksum 作成は拒否される必要があります。');
      } catch (error) {
        expect(error).toBeInstanceOf(AndroidArtifactIntegrityError);
        expect((error as AndroidArtifactIntegrityError).code).toBe(code);
      }
    }
  });

  it('欠損した APK・checksum record・app.json を公開 API の型付きエラーで拒否する', async () => {
    const directory = await temporaryDirectory();
    const missingApkPath = join(directory, 'missing.apk');
    const existingApkPath = join(directory, 'passport.apk');
    const missingChecksumPath = join(directory, 'missing.sha256');
    const missingConfigPath = join(directory, 'app.json');
    await writeFile(existingApkPath, 'signed apk bytes');

    await expect(createAndroidArtifactChecksum(missingApkPath)).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_APK_PATH',
        'Android release artifact must be a regular .apk file.'
      )
    );
    await expect(
      verifyAndroidArtifactChecksum(existingApkPath, missingChecksumPath)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_CHECKSUM_RECORD',
        'Android artifact checksum record is invalid.'
      )
    );
    await expect(
      readAndroidReleaseVersionCode(missingConfigPath)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'INVALID_ANDROID_VERSION_CODE',
        'Expo app config must contain a positive integer Android versionCode.'
      )
    );
  });

  it('O_NOFOLLOW がない Platform でも実 File だけを開き Symbolic Link を拒否する', async () => {
    const directory = await temporaryDirectory();
    const realApk = join(directory, 'real.apk');
    const linkedApk = join(directory, 'linked.apk');
    await writeFile(realApk, 'signed apk bytes');
    await symlink(realApk, linkedApk);

    const { handle } = await openStableFileForRead(
      realApk,
      PORTABLE_APK_POLICY
    );
    try {
      expect(await handle.readFile('utf8')).toBe('signed apk bytes');
    } finally {
      await handle.close();
    }

    await expect(
      openStableFileForRead(linkedApk, PORTABLE_APK_POLICY)
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'SYMLINK_NOT_ALLOWED',
        'Android release artifact must not be a symbolic link.'
      )
    );
  });

  it('初回 lstat 後から open 前に消えた File を変更として拒否する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, 'signed apk bytes');

    await expect(
      openStableFileForRead(apkPath, {
        ...PORTABLE_APK_POLICY,
        afterInitialLstat: async () => unlink(apkPath),
      })
    ).rejects.toEqual(
      new AndroidArtifactIntegrityError(
        'ARTIFACT_CHANGED',
        'Android release artifact changed while it was being read.'
      )
    );
  });

  it('読取用 Handle を開いた後の rename・symlink・削除を同じ Path と誤認しない', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    const movedApkPath = join(directory, 'moved.apk');
    await writeFile(apkPath, 'signed apk bytes');
    const opened = await openStableFileForRead(apkPath, PORTABLE_APK_POLICY);

    try {
      await rename(apkPath, movedApkPath);
      await writeFile(apkPath, 'replacement bytes');
      await expect(
        assertOpenedFilePathUnchanged(
          apkPath,
          opened.identity,
          PORTABLE_APK_POLICY
        )
      ).rejects.toEqual(
        new AndroidArtifactIntegrityError(
          'ARTIFACT_CHANGED',
          'Android release artifact changed while it was being read.'
        )
      );

      await unlink(apkPath);
      await symlink(movedApkPath, apkPath);
      await expect(
        assertOpenedFilePathUnchanged(
          apkPath,
          opened.identity,
          PORTABLE_APK_POLICY
        )
      ).rejects.toEqual(
        new AndroidArtifactIntegrityError(
          'ARTIFACT_CHANGED',
          'Android release artifact changed while it was being read.'
        )
      );

      await unlink(apkPath);
      await expect(
        assertOpenedFilePathUnchanged(
          apkPath,
          opened.identity,
          PORTABLE_APK_POLICY
        )
      ).rejects.toEqual(
        new AndroidArtifactIntegrityError(
          'ARTIFACT_CHANGED',
          'Android release artifact changed while it was being read.'
        )
      );

      await mkdir(apkPath);
      try {
        await expect(
          assertOpenedFilePathUnchanged(
            apkPath,
            opened.identity,
            PORTABLE_APK_POLICY
          )
        ).rejects.toEqual(
          new AndroidArtifactIntegrityError(
            'ARTIFACT_CHANGED',
            'Android release artifact changed while it was being read.'
          )
        );
      } finally {
        await rmdir(apkPath);
      }
    } finally {
      await opened.handle.close();
    }
  });

  it('checksum record の Symbolic Link と上限超過を読まずに拒否する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    const linkedChecksumPath = join(directory, 'linked.sha256');
    const realChecksumPath = join(directory, 'real.sha256');
    const oversizedChecksumPath = join(directory, 'oversized.sha256');
    await writeFile(apkPath, 'signed apk bytes');
    await writeFile(realChecksumPath, `${EXPECTED_SHA256}  passport.apk\n`);
    await symlink(realChecksumPath, linkedChecksumPath);
    await writeFile(oversizedChecksumPath, 'x'.repeat(513));

    for (const [path, code] of [
      [linkedChecksumPath, 'SYMLINK_NOT_ALLOWED'],
      [oversizedChecksumPath, 'INVALID_CHECKSUM_RECORD'],
    ] as const) {
      try {
        await verifyAndroidArtifactChecksum(apkPath, path);
        throw new Error('checksum record の検証は拒否される必要があります。');
      } catch (error) {
        expect(error).toBeInstanceOf(AndroidArtifactIntegrityError);
        expect((error as AndroidArtifactIntegrityError).code).toBe(code);
      }
    }
  });

  it('APK を同じ長さのまま継続書換中なら checksum を作成しない', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    await writeFile(apkPath, new Uint8Array(8 * 1024 * 1024));
    const stopMutation = await startContinuousFirstByteMutation(apkPath);

    try {
      await expect(createAndroidArtifactChecksum(apkPath)).rejects.toEqual(
        new AndroidArtifactIntegrityError(
          'ARTIFACT_CHANGED',
          'Android release artifact changed while it was being read.'
        )
      );
    } finally {
      await stopMutation();
    }
  });

  it('checksum record を同じ長さのまま継続書換中なら検証しない', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    const checksumPath = `${apkPath}.sha256`;
    await writeFile(apkPath, 'signed apk bytes');
    await writeFile(checksumPath, `${EXPECTED_SHA256}  passport.apk\n`);
    const stopMutation = await startContinuousFirstByteMutation(checksumPath);

    try {
      await expect(
        verifyAndroidArtifactChecksum(apkPath, checksumPath)
      ).rejects.toEqual(
        new AndroidArtifactIntegrityError(
          'CHECKSUM_RECORD_CHANGED',
          'Android checksum record changed while it was being read.'
        )
      );
    } finally {
      await stopMutation();
    }
  });

  it('CLI の write と verify は実ファイルを共有し、改ざん時は非 0 で終了する', async () => {
    const directory = await temporaryDirectory();
    const apkPath = join(directory, 'passport.apk');
    const scriptPath = join(import.meta.dir, 'android-artifact-integrity.ts');
    await writeFile(apkPath, 'signed apk bytes');

    const writeProcess = Bun.spawn(['bun', scriptPath, 'write', apkPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await writeProcess.exited).toBe(0);
    expect(await new Response(writeProcess.stdout).text()).toContain(
      EXPECTED_SHA256
    );

    const checksumPath = `${apkPath}.sha256`;
    const verifyProcess = Bun.spawn(
      ['bun', scriptPath, 'verify', apkPath, checksumPath],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    expect(await verifyProcess.exited).toBe(0);

    await writeFile(apkPath, 'changed apk bytes');
    const rejectedProcess = Bun.spawn(
      ['bun', scriptPath, 'verify', apkPath, checksumPath],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    expect(await rejectedProcess.exited).toBe(1);
    expect(await new Response(rejectedProcess.stderr).text()).toContain(
      'CHECKSUM_MISMATCH'
    );
  });

  it('CLI の version は app.json と過去 Release を比較し、同値を非 0 で拒否する', async () => {
    const scriptPath = join(import.meta.dir, 'android-artifact-integrity.ts');
    const appConfigPath = join(import.meta.dir, '..', 'app.json');
    const acceptedProcess = Bun.spawn(
      ['bun', scriptPath, 'version', appConfigPath, '0'],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    expect(await acceptedProcess.exited).toBe(0);
    expect(await new Response(acceptedProcess.stdout).text()).toContain(
      'versionCode 1 > 0'
    );

    const rejectedProcess = Bun.spawn(
      ['bun', scriptPath, 'version', appConfigPath, '1'],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    expect(await rejectedProcess.exited).toBe(1);
    expect(await new Response(rejectedProcess.stderr).text()).toContain(
      'VERSION_CODE_NOT_INCREMENTED'
    );
  });

  it.each([
    '',
    ' ',
    '00',
    '+0',
    '0x0',
    '0e0',
    '1.0',
  ])('CLI の過去 versionCode は正規の 10 進整数でない「%s」を拒否する', async (previousVersionCode) => {
    const scriptPath = join(import.meta.dir, 'android-artifact-integrity.ts');
    const appConfigPath = join(import.meta.dir, '..', 'app.json');
    const process = Bun.spawn(
      ['bun', scriptPath, 'version', appConfigPath, previousVersionCode],
      { stdout: 'pipe', stderr: 'pipe' }
    );

    expect(await process.exited).toBe(1);
    expect(await new Response(process.stderr).text()).toContain(
      'INVALID_PREVIOUS_VERSION_CODE'
    );
  });
});
