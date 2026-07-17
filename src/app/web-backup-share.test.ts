import { describe, expect, it } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trackTemporaryDirectories } from './storage-test-kit';
import {
  WebBackupSharePort,
  type WebShareEnvironment,
} from './web-backup-share';

const { create: newTemporaryDirectory } = trackTemporaryDirectories();

/** `navigator.share` が使える実環境を模した、実際に呼び出しを解決する実装。 */
function nativeShareSupportedEnvironment(
  result: 'shared' | 'dismissed'
): WebShareEnvironment {
  return {
    supportsNativeShare: true,
    shareText: () => Promise.resolve(result),
    downloadFile: () => {
      throw new Error('この経路では downloadFile を呼んではならない。');
    },
  };
}

/** `navigator.share` が使えない環境の fallback を、実ファイルへの書き込みで検証する。 */
function fileDownloadEnvironment(root: string): WebShareEnvironment {
  return {
    supportsNativeShare: false,
    shareText: () => {
      throw new Error('この経路では shareText を呼んではならない。');
    },
    downloadFile: (fileName, content) => {
      writeFileSync(path.join(root, fileName), content, 'utf8');
    },
  };
}

describe('WebBackupSharePort', () => {
  it('navigator.share が使える場合はそれを呼び、共有成立を shared として返す', async () => {
    const port = new WebBackupSharePort(
      nativeShareSupportedEnvironment('shared')
    );

    const outcome = await port.share({
      fileName: 'backup.json',
      json: '{"backupSchemaVersion":2}',
    });

    expect(outcome).toEqual({ kind: 'shared' });
  });

  it('navigator.share の Share Sheet を閉じた場合は dismissed を返す', async () => {
    const port = new WebBackupSharePort(
      nativeShareSupportedEnvironment('dismissed')
    );

    const outcome = await port.share({
      fileName: 'backup.json',
      json: '{"backupSchemaVersion":2}',
    });

    expect(outcome).toEqual({ kind: 'dismissed' });
  });

  it('navigator.share が使えない環境ではファイルダウンロードへ fallback し、内容がそのまま実ファイルへ書き込まれる', async () => {
    const root = newTemporaryDirectory();
    const port = new WebBackupSharePort(fileDownloadEnvironment(root));
    const json =
      '{"backupSchemaVersion":2,"exportedAt":"2026-07-17T00:00:00.000Z"}';

    const outcome = await port.share({ fileName: 'backup.json', json });

    expect(outcome).toEqual({
      kind: 'saved-to-file',
      destination: 'backup.json',
    });
    expect(readFileSync(path.join(root, 'backup.json'), 'utf8')).toBe(json);
  });
});
