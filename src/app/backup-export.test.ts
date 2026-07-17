import { describe, expect, it } from 'bun:test';
import { CATALOG_VERSION } from '../domain/clue-catalog';
import { createLocalPrivateProfile } from '../domain/passport';
import { isSchemaValidationError } from '../protocol/schema';
import {
  backupExportFileName,
  backupPreviewItems,
  createBackupExportPreview,
  createDefaultDeviceSettings,
} from './backup-export';

function profile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🦊',
    ownerAlias: 'オーナー A',
    candidateClueIds: ['open-source', 'local-tournament'],
    selectedForPassportClueIds: ['open-source'],
    excludedTopicIds: ['accessibility'],
    languageCodes: ['ja', 'en'],
  });
}

describe('createDefaultDeviceSettings', () => {
  it('M1 の既定値（ja・Reduce Motion OFF・モデル未選択・現行カタログ版）を返す', () => {
    expect(createDefaultDeviceSettings()).toEqual({
      language: 'ja',
      reduceMotion: false,
      selectedModelDigest: null,
      catalogVersion: CATALOG_VERSION,
    });
  });

  it('Issue 15: 現在の UI 表示言語と Reduce Motion 設定を Backup へそのまま反映する', () => {
    expect(createDefaultDeviceSettings('en', true)).toEqual({
      language: 'en',
      reduceMotion: true,
      selectedModelDigest: null,
      catalogVersion: CATALOG_VERSION,
    });
  });
});

describe('createBackupExportPreview', () => {
  it('LocalPrivateProfile・DeviceSettings・ModelVerification から Backup Schema Version 2 を組み立てる', () => {
    const preview = createBackupExportPreview({
      localPrivateProfile: profile(),
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: null,
      exportedAt: '2026-07-17T00:10:00.000Z',
    });

    expect(preview.backup.backupSchemaVersion).toBe(2);
    expect(preview.backup.exportedAt).toBe('2026-07-17T00:10:00.000Z');
    expect(preview.backup.localPrivateProfile.petName).toBe('こむぎ');
    expect(JSON.parse(preview.json)).toEqual(preview.backup);
    expect(preview.byteLength).toBe(
      new TextEncoder().encode(preview.json).byteLength
    );
  });

  it('モデル検証記録を含めた Backup も組み立てる', () => {
    const preview = createBackupExportPreview({
      localPrivateProfile: profile(),
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: {
        digest: 'a'.repeat(64),
        sizeBytes: 1_024,
        result: 'verified',
        appVersion: '1.0.0',
      },
      exportedAt: '2026-07-17T00:10:00.000Z',
    });

    expect(preview.backup.modelVerification?.result).toBe('verified');
    expect(preview.json).toContain('"result":"verified"');
  });

  it('allowlist から逸脱した exportedAt（不正な ISO 8601）は拒否し、既存データを変更しない', () => {
    expect(() =>
      createBackupExportPreview({
        localPrivateProfile: profile(),
        deviceSettings: createDefaultDeviceSettings(),
        modelVerification: null,
        exportedAt: 'not-a-date',
      })
    ).toThrow();
  });

  it('拒否した場合は SchemaValidationError として判別できる', () => {
    try {
      createBackupExportPreview({
        localPrivateProfile: profile(),
        deviceSettings: createDefaultDeviceSettings(),
        modelVerification: null,
        exportedAt: 'not-a-date',
      });
      throw new Error('到達しないはずである。');
    } catch (error: unknown) {
      expect(isSchemaValidationError(error)).toBe(true);
    }
  });
});

describe('backupExportFileName', () => {
  it('コロンとピリオドをハイフンへ正規化したファイル名を組み立てる', () => {
    expect(backupExportFileName('2026-07-17T00:10:00.000Z')).toBe(
      'tenkacloud-passport-backup-2026-07-17T00-10-00-000Z.json'
    );
  });
});

describe('backupPreviewItems', () => {
  it('含まれる全項目（Pet Name・Emoji・Alias・候補手掛かり・除外トピック・Languages・端末設定）を 1 件も省略せずに列挙する', () => {
    const preview = createBackupExportPreview({
      localPrivateProfile: profile(),
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: null,
      exportedAt: '2026-07-17T00:10:00.000Z',
    });

    const keys = preview.items.map((item) => item.key);
    expect(keys).toEqual([
      'backupSchemaVersion',
      'exportedAt',
      'petName',
      'petEmoji',
      'ownerAlias',
      'candidateClue:open-source',
      'candidateClue:local-tournament',
      'excludedTopic:accessibility',
      'language:ja',
      'language:en',
      'deviceSettings.language',
      'deviceSettings.reduceMotion',
      'deviceSettings.selectedModelDigest',
      'deviceSettings.catalogVersion',
    ]);
  });

  it('公開対象の候補手掛かりには「公開対象」を明示する', () => {
    const preview = createBackupExportPreview({
      localPrivateProfile: profile(),
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: null,
      exportedAt: '2026-07-17T00:10:00.000Z',
    });

    const openSource = preview.items.find(
      (item) => item.key === 'candidateClue:open-source'
    );
    const localTournament = preview.items.find(
      (item) => item.key === 'candidateClue:local-tournament'
    );
    expect(openSource?.value).toContain('公開対象');
    expect(localTournament?.value).not.toContain('公開対象');
  });

  it('Owner Alias が空の場合は項目を作らない', () => {
    const noAliasProfile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: ['open-source'],
      selectedForPassportClueIds: ['open-source'],
      languageCodes: [],
    });
    const preview = createBackupExportPreview({
      localPrivateProfile: noAliasProfile,
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: null,
      exportedAt: '2026-07-17T00:10:00.000Z',
    });

    expect(preview.items.some((item) => item.key === 'ownerAlias')).toBe(false);
  });

  it('モデル検証記録が存在する場合だけ 4 項目を追加する', () => {
    const withVerification = backupPreviewItems({
      backupSchemaVersion: 2,
      exportedAt: '2026-07-17T00:10:00.000Z',
      localPrivateProfile: profile(),
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: {
        digest: 'b'.repeat(64),
        sizeBytes: 2_048,
        result: 'rejected',
        appVersion: '1.2.3',
      },
    });

    const keys = withVerification.map((item) => item.key);
    expect(keys).toContain('modelVerification.digest');
    expect(keys).toContain('modelVerification.sizeBytes');
    expect(keys).toContain('modelVerification.result');
    expect(keys).toContain('modelVerification.appVersion');
  });
});
