import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  acceptNativeShare,
  fileBackedNativeSharePort,
  fileDownloadSharePort,
  releaseNativeShare,
} from './backup-share-test-kit';
import { trackTemporaryDirectories } from './storage-test-kit';

const { create: newTemporaryDirectory } = trackTemporaryDirectories();

describe('WebBackupSharePort', () => {
  it('navigator.share が使える場合はそれを呼び、共有成立を shared として返す', async () => {
    const root = newTemporaryDirectory();
    acceptNativeShare(root);
    const port = fileBackedNativeSharePort(root);

    const outcome = await port.share({
      fileName: 'backup.json',
      json: '{"backupSchemaVersion":2}',
    });

    expect(outcome).toEqual({ kind: 'shared' });
  });

  it('navigator.share の Share Sheet を閉じた場合は dismissed を返す', async () => {
    const root = newTemporaryDirectory();
    releaseNativeShare(root);
    const port = fileBackedNativeSharePort(root, { waitForRelease: true });

    const outcome = await port.share({
      fileName: 'backup.json',
      json: '{"backupSchemaVersion":2}',
    });

    expect(outcome).toEqual({ kind: 'dismissed' });
  });

  it('native share の解放 marker が来ない場合は待機処理を期限内に閉じて失敗する', async () => {
    const port = fileBackedNativeSharePort(newTemporaryDirectory(), {
      releaseTimeoutMs: 5,
      waitForRelease: true,
    });

    await expect(
      port.share({ fileName: 'backup.json', json: '{"backupSchemaVersion":2}' })
    ).rejects.toThrow('native share の解放を確認できませんでした。');
  });

  it('navigator.share が使えない環境ではファイルダウンロードへ fallback し、内容がそのまま実ファイルへ書き込まれる', async () => {
    const root = newTemporaryDirectory();
    const port = fileDownloadSharePort(root);
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
