import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadLlamaNativeArtifactPlan,
  NativeArtifactConfigError,
  verifyLlamaNativeArtifactMarkers,
} from './llama-native-artifacts';

const VALID_SHA256 = 'a'.repeat(64);
const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createPackage(
  artifactOverrides: Readonly<Record<string, unknown>> = {}
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'llama-native-artifacts-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'install'), { recursive: true });
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'llama.rn',
      version: '0.12.4',
      repository: 'https://github.com/mybigday/llama.rn.git',
    })
  );
  writeFileSync(
    path.join(root, 'install/native-artifacts.json'),
    JSON.stringify({
      artifacts: [
        {
          assetName: 'rnllama-ios.tar.gz',
          sha256: VALID_SHA256,
          relativePath: 'ios/rnllama.xcframework',
          markerPath: 'ios/rnllama.xcframework/.sha256',
          ...artifactOverrides,
        },
      ],
    })
  );
  writeFileSync(
    path.join(root, 'install/download-native-artifacts.js'),
    'process.exitCode = 0;\n'
  );
  return root;
}

describe('llama.rn Native Artifact metadata 境界', () => {
  it('package Version と manifest から取得元 URL と SHA-256 を固定する', async () => {
    const root = createPackage();

    const plan = await loadLlamaNativeArtifactPlan(root);

    expect(plan.packageVersion).toBe('0.12.4');
    expect(plan.downloaderPath).toBe(
      path.join(root, 'install/download-native-artifacts.js')
    );
    expect(plan.artifacts).toEqual([
      {
        assetName: 'rnllama-ios.tar.gz',
        sourceUrl:
          'https://github.com/mybigday/llama.rn/releases/download/v0.12.4/rnllama-ios.tar.gz',
        expectedSha256: VALID_SHA256,
        installedPath: path.join(root, 'ios/rnllama.xcframework'),
        markerPath: path.join(root, 'ios/rnllama.xcframework/.sha256'),
      },
    ]);
  });

  it('SHA-256 が 64 桁の hexadecimal でないとき取得前に拒否する', async () => {
    const root = createPackage({ sha256: 'not-a-sha256' });

    expect(loadLlamaNativeArtifactPlan(root)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
    });
  });

  it('Artifact path が package 外を指すとき取得前に拒否する', async () => {
    const root = createPackage({ markerPath: '../escaped.sha256' });

    expect(loadLlamaNativeArtifactPlan(root)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
    });
  });

  it('取得元が公式 llama.rn repository でないとき取得前に拒否する', async () => {
    const root = createPackage();
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'llama.rn',
        version: '0.12.4',
        repository: 'https://github.com/example/llama.rn',
      })
    );

    expect(loadLlamaNativeArtifactPlan(root)).rejects.toMatchObject({
      code: 'INVALID_PACKAGE',
    });
  });

  it('llama.rn が未導入のとき通信前に型付きエラーで拒否する', async () => {
    const root = path.join(tmpdir(), 'llama-rn-not-installed');

    try {
      await loadLlamaNativeArtifactPlan(root);
      throw new Error('NativeArtifactConfigError が必要です。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NativeArtifactConfigError);
      if (error instanceof NativeArtifactConfigError) {
        expect(error.code).toBe('PACKAGE_NOT_INSTALLED');
      }
    }
  });
});

describe('llama.rn Native Artifact 完了 marker 検証', () => {
  it('展開先が存在して marker が期待 SHA-256 と一致するとき成功する', async () => {
    const root = createPackage();
    const plan = await loadLlamaNativeArtifactPlan(root);
    mkdirSync(path.join(root, 'ios/rnllama.xcframework'), {
      recursive: true,
    });
    writeFileSync(
      path.join(root, 'ios/rnllama.xcframework/.sha256'),
      `${VALID_SHA256}\n`
    );

    const verified = await verifyLlamaNativeArtifactMarkers(plan);

    expect(verified).toEqual([
      {
        assetName: 'rnllama-ios.tar.gz',
        sha256: VALID_SHA256,
      },
    ]);
  });

  it('marker が期待 SHA-256 と異なるとき非 0 にできる型付きエラーを返す', async () => {
    const root = createPackage();
    const plan = await loadLlamaNativeArtifactPlan(root);
    mkdirSync(path.join(root, 'ios/rnllama.xcframework'), {
      recursive: true,
    });
    writeFileSync(
      path.join(root, 'ios/rnllama.xcframework/.sha256'),
      `${'b'.repeat(64)}\n`
    );

    expect(verifyLlamaNativeArtifactMarkers(plan)).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
    });
  });

  it('展開先が存在しないとき marker だけで成功扱いにしない', async () => {
    const root = createPackage();
    const plan = await loadLlamaNativeArtifactPlan(root);
    mkdirSync(path.dirname(plan.artifacts[0]?.markerPath ?? ''), {
      recursive: true,
    });
    writeFileSync(plan.artifacts[0]?.markerPath ?? '', `${VALID_SHA256}\n`);
    rmSync(plan.artifacts[0]?.installedPath ?? '', {
      recursive: true,
      force: true,
    });

    expect(verifyLlamaNativeArtifactMarkers(plan)).rejects.toMatchObject({
      code: 'ARTIFACT_NOT_INSTALLED',
    });
  });
});
