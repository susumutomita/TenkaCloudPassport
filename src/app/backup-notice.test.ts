import { describe, expect, it } from 'bun:test';
import {
  BACKUP_NOTICE_IDLE,
  backupNoticeFromImportCommitFailure,
  backupNoticeFromImportCommitSuccess,
  backupNoticeFromShareFailure,
  backupNoticeFromShareOutcome,
  backupNoticeIsError,
} from './backup-notice';

describe('BACKUP_NOTICE_IDLE', () => {
  it('idle を表す', () => {
    expect(BACKUP_NOTICE_IDLE).toEqual({ kind: 'idle' });
  });
});

describe('backupNoticeFromShareOutcome', () => {
  it('shared を成功通知へ変換する', () => {
    expect(backupNoticeFromShareOutcome({ kind: 'shared' })).toEqual({
      kind: 'share-succeeded',
      message: '共有しました。',
    });
  });

  it('dismissed をキャンセル通知へ変換する', () => {
    expect(backupNoticeFromShareOutcome({ kind: 'dismissed' })).toEqual({
      kind: 'share-dismissed',
      message: 'Share Sheet を閉じました。共有は行われていません。',
    });
  });

  it('saved-to-file を保存先を含む通知へ変換する', () => {
    expect(
      backupNoticeFromShareOutcome({
        kind: 'saved-to-file',
        destination: 'backup.json',
      })
    ).toEqual({
      kind: 'share-saved-to-file',
      message: 'ファイルとして保存しました（backup.json）。',
    });
  });
});

describe('backupNoticeFromShareFailure', () => {
  it('Error の message をそのまま使う', () => {
    expect(backupNoticeFromShareFailure(new Error('拒否されました'))).toEqual({
      kind: 'share-failed',
      message: '拒否されました',
    });
  });

  it('Error 以外は既定文言にする', () => {
    expect(backupNoticeFromShareFailure('文字列エラー')).toEqual({
      kind: 'share-failed',
      message: 'Share Sheet を開けませんでした。',
    });
  });
});

describe('backupNoticeFromImportCommitSuccess', () => {
  it('Commit 成功を通知する', () => {
    expect(backupNoticeFromImportCommitSuccess()).toEqual({
      kind: 'import-committed',
      message: 'Import した内容を端末内へ保存しました。',
    });
  });
});

describe('backupNoticeFromImportCommitFailure', () => {
  it('Error の message をそのまま使う', () => {
    expect(backupNoticeFromImportCommitFailure(new Error('disk full'))).toEqual(
      {
        kind: 'import-commit-failed',
        message: 'disk full',
      }
    );
  });

  it('Error 以外は既定文言にする', () => {
    expect(backupNoticeFromImportCommitFailure(null)).toEqual({
      kind: 'import-commit-failed',
      message: 'Import の Commit に失敗したため、既存の Profile を保ちました。',
    });
  });
});

describe('locale が en のとき', () => {
  it('shareOutcome を英語通知へ変換する', () => {
    expect(backupNoticeFromShareOutcome({ kind: 'shared' }, 'en')).toEqual({
      kind: 'share-succeeded',
      message: 'Shared.',
    });
    expect(
      backupNoticeFromShareOutcome(
        { kind: 'saved-to-file', destination: 'backup.json' },
        'en'
      )
    ).toEqual({
      kind: 'share-saved-to-file',
      message: 'Saved as a file (backup.json).',
    });
  });

  it('Error 以外の share 失敗は英語の既定文言にする', () => {
    expect(backupNoticeFromShareFailure('文字列エラー', 'en')).toEqual({
      kind: 'share-failed',
      message: 'Could not open the Share Sheet.',
    });
  });

  it('Import Commit の成功・失敗を英語で通知する', () => {
    expect(backupNoticeFromImportCommitSuccess('en')).toEqual({
      kind: 'import-committed',
      message: 'Saved the imported content on this device.',
    });
    expect(backupNoticeFromImportCommitFailure(null, 'en')).toEqual({
      kind: 'import-commit-failed',
      message: 'The import commit failed, so the existing Profile was kept.',
    });
  });
});

describe('backupNoticeIsError', () => {
  it('share-failed・import-commit-failed をエラーと判定する', () => {
    expect(backupNoticeIsError({ kind: 'share-failed', message: '' })).toBe(
      true
    );
    expect(
      backupNoticeIsError({ kind: 'import-commit-failed', message: '' })
    ).toBe(true);
  });

  it('idle・成功系の kind はエラーと判定しない', () => {
    expect(backupNoticeIsError(BACKUP_NOTICE_IDLE)).toBe(false);
    expect(backupNoticeIsError({ kind: 'share-succeeded', message: '' })).toBe(
      false
    );
    expect(backupNoticeIsError({ kind: 'share-dismissed', message: '' })).toBe(
      false
    );
    expect(
      backupNoticeIsError({ kind: 'share-saved-to-file', message: '' })
    ).toBe(false);
    expect(backupNoticeIsError({ kind: 'import-committed', message: '' })).toBe(
      false
    );
  });
});
