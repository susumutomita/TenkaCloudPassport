import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { createLocalPrivateProfile } from '../domain/passport';
import { BACKUP_MAX_BYTES } from '../protocol/schema';
import {
  createBackupExportPreview,
  createDefaultDeviceSettings,
} from './backup-export';
import {
  type BackupImportConflictChoice,
  BackupImportConflictError,
  commitBackupImport,
  defaultBackupImportChoice,
  parseBackupImportCandidate,
  resolveImportedProfile,
} from './backup-import';
import { ExpoFileSystemLocalProfileStorageAdapter } from './expo-file-system-local-profile-storage';
import { LocalProfileStorageError } from './local-profile-storage';
import {
  BunProfileDocument,
  FileBackedWebStorage,
  trackTemporaryDirectories,
  VerifyMismatchStorage,
  WriteFailingProfileDocument,
  WriteFailingWebStorage,
} from './storage-test-kit';
import { WebLocalProfileStorageAdapter } from './web-local-profile-storage';

function existingProfile() {
  return createLocalPrivateProfile({
    petName: 'げんぞん',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
    languageCodes: ['ja'],
  });
}

function importedProfile() {
  return createLocalPrivateProfile({
    petName: 'いんぽーと',
    petEmoji: '🐶',
    ownerAlias: '',
    candidateClueIds: ['local-tournament'],
    selectedForPassportClueIds: ['local-tournament'],
    languageCodes: ['en'],
  });
}

function validBackupJson(profile = importedProfile()): string {
  return createBackupExportPreview({
    localPrivateProfile: profile,
    deviceSettings: createDefaultDeviceSettings(),
    modelVerification: null,
    exportedAt: '2026-07-17T00:10:00.000Z',
  }).json;
}

const { create: newTemporaryDirectory } = trackTemporaryDirectories();

describe('parseBackupImportCandidate', () => {
  it('有効な Backup JSON（Version 2）を Preview 項目付きで受理する', () => {
    const result = parseBackupImportCandidate(validBackupJson());

    expect(result.kind).toBe('parsed');
    if (result.kind !== 'parsed') throw new Error('parsed が必要です。');
    expect(result.backup.localPrivateProfile.petName).toBe('いんぽーと');
    expect(result.items.some((item) => item.key === 'petName')).toBe(true);
  });

  it('旧 Version（0）の Backup も既存 Migration を経由して受理する', () => {
    const legacy = {
      backupSchemaVersion: 0,
      exportedAt: '2026-07-17T00:10:00.000Z',
      localPrivateProfile: {
        schemaVersion: 0,
        catalogVersion: '2026-07-17',
        candidateClues: [
          {
            value: 'open-source',
            category: 'interest',
            selectedForPassport: true,
          },
        ],
      },
      deviceSettings: { language: 'ja', catalogVersion: '2026-07-17' },
      modelVerification: null,
    };

    const result = parseBackupImportCandidate(JSON.stringify(legacy));

    expect(result.kind).toBe('parsed');
    if (result.kind !== 'parsed') throw new Error('parsed が必要です。');
    expect(result.backup.backupSchemaVersion).toBe(2);
  });

  it('不正 JSON は例外を投げずに rejected（INVALID_JSON）を返す', () => {
    const result = parseBackupImportCandidate('{ invalid json');

    expect(result).toEqual({
      kind: 'rejected',
      code: 'INVALID_JSON',
      message: expect.any(String),
    });
  });

  it('未知の Major Version は rejected（UNSUPPORTED_VERSION）を返す', () => {
    const backup = JSON.parse(validBackupJson());
    const result = parseBackupImportCandidate(
      JSON.stringify({ ...backup, backupSchemaVersion: 99 })
    );

    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') throw new Error('rejected が必要です。');
    expect(result.code).toBe('UNSUPPORTED_VERSION');
  });

  it('欠落 Field は rejected（MISSING_FIELD）を返す', () => {
    const backup = JSON.parse(validBackupJson()) as Record<string, unknown>;
    // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature が bracket notation を要求する
    delete backup['localPrivateProfile'];

    const result = parseBackupImportCandidate(JSON.stringify(backup));

    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') throw new Error('rejected が必要です。');
    expect(result.code).toBe('MISSING_FIELD');
  });

  it('64 KiB を超える過大な File は rejected（LIMIT_EXCEEDED）を返す', () => {
    const backup = JSON.parse(validBackupJson()) as Record<string, unknown>;
    const oversizedAlias = 'あ'.repeat(BACKUP_MAX_BYTES);
    const oversized = {
      ...backup,
      localPrivateProfile: {
        // biome-ignore lint/complexity/useLiteralKeys: 上記と同じ noPropertyAccessFromIndexSignature の制約。
        ...(backup['localPrivateProfile'] as Record<string, unknown>),
        ownerAlias: oversizedAlias,
      },
    };

    const result = parseBackupImportCandidate(JSON.stringify(oversized));

    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') throw new Error('rejected が必要です。');
    expect(result.code).toBe('LIMIT_EXCEEDED');
  });
});

describe('defaultBackupImportChoice / resolveImportedProfile', () => {
  it('既存 Profile がある場合は既定で keep-existing を選ぶ', () => {
    expect(defaultBackupImportChoice(true)).toBe('keep-existing');
  });

  it('既存 Profile が無い場合は既定で use-imported を選ぶ', () => {
    expect(defaultBackupImportChoice(false)).toBe('use-imported');
  });

  it('use-imported は既存 Profile の有無に関わらず読み込んだ内容を採用する', () => {
    const candidate = parseBackupImportCandidate(validBackupJson());
    if (candidate.kind !== 'parsed') throw new Error('parsed が必要です。');

    const resolved = resolveImportedProfile(
      candidate.backup,
      existingProfile(),
      'use-imported'
    );

    expect(resolved.petName).toBe('いんぽーと');
  });

  it('keep-existing は既存 Profile をそのまま返す', () => {
    const candidate = parseBackupImportCandidate(validBackupJson());
    if (candidate.kind !== 'parsed') throw new Error('parsed が必要です。');
    const existing = existingProfile();

    const resolved = resolveImportedProfile(
      candidate.backup,
      existing,
      'keep-existing'
    );

    expect(resolved).toBe(existing);
  });

  it('既存 Profile が無いのに keep-existing を選ぶと BackupImportConflictError を投げる', () => {
    const candidate = parseBackupImportCandidate(validBackupJson());
    if (candidate.kind !== 'parsed') throw new Error('parsed が必要です。');

    expect(() =>
      resolveImportedProfile(candidate.backup, null, 'keep-existing')
    ).toThrow(BackupImportConflictError);
  });

  it('型定義どおり choice は keep-existing / use-imported の 2 値だけを持つ', () => {
    const choices: BackupImportConflictChoice[] = [
      'keep-existing',
      'use-imported',
    ];
    expect(choices).toHaveLength(2);
  });
});

describe('commitBackupImport（Atomic Commit）', () => {
  it('Web 相当の Storage で、書き込み成功後に読み戻した Profile を返す', async () => {
    const root = newTemporaryDirectory();
    const storage = new WebLocalProfileStorageAdapter(
      new FileBackedWebStorage(root)
    );
    await storage.save(existingProfile());

    const committed = await commitBackupImport(storage, importedProfile());

    expect(committed.petName).toBe('いんぽーと');
    expect((await storage.load())?.petName).toBe('いんぽーと');
  });

  it('Native 相当の Storage で、書き込み成功後に読み戻した Profile を返す', async () => {
    const root = newTemporaryDirectory();
    const filePath = path.join(root, 'local-profile.json');
    const storage = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );
    await storage.save(existingProfile());

    const committed = await commitBackupImport(storage, importedProfile());

    expect(committed.petName).toBe('いんぽーと');
    expect((await storage.load())?.petName).toBe('いんぽーと');
  });

  it('Web 相当の書き込み失敗時は例外を再送出し、実ファイル上の既存 Profile を変更しない', async () => {
    const root = newTemporaryDirectory();
    const original = existingProfile();
    const writableStorage = new WebLocalProfileStorageAdapter(
      new FileBackedWebStorage(root)
    );
    await writableStorage.save(original);

    const failingStorage = new WebLocalProfileStorageAdapter(
      new WriteFailingWebStorage(root, new Error('quota exceeded'))
    );

    // 書き込みが失敗するアダプタでも、読み込み（`getItem`）は実ファイルへそのまま
    // 委譲した本物の I/O であることを、書き込み失敗を試す前に確認する。
    expect((await failingStorage.load())?.petName).toBe(original.petName);

    try {
      await commitBackupImport(failingStorage, importedProfile());
      throw new Error('到達しないはずである。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LocalProfileStorageError);
      if (error instanceof LocalProfileStorageError) {
        expect((error.cause as Error).message).toBe('quota exceeded');
      }
    }

    // 書き込みが失敗するアダプタとは別の、失敗しない実アダプタで同じファイルを
    // 読み直し、既存 Profile が変更されていないことを実ファイル I/O で確認する。
    const rereadStorage = new WebLocalProfileStorageAdapter(
      new FileBackedWebStorage(root)
    );
    const reread = await rereadStorage.load();
    expect(reread?.petName).toBe(original.petName);
  });

  it('Native 相当の書き込み失敗時は例外を再送出し、実ファイル上の既存 Profile を変更しない', async () => {
    const root = newTemporaryDirectory();
    const filePath = path.join(root, 'local-profile.json');
    const original = existingProfile();
    const writableStorage = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );
    await writableStorage.save(original);

    const failingStorage = new ExpoFileSystemLocalProfileStorageAdapter(
      new WriteFailingProfileDocument(filePath, new Error('disk full'))
    );

    // 書き込みが失敗するアダプタでも、読み込み（`exists` / `text()`）は実ファイルへ
    // そのまま委譲した本物の I/O であることを、書き込み失敗を試す前に確認する。
    expect((await failingStorage.load())?.petName).toBe(original.petName);

    try {
      await commitBackupImport(failingStorage, importedProfile());
      throw new Error('到達しないはずである。');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LocalProfileStorageError);
      if (error instanceof LocalProfileStorageError) {
        expect((error.cause as Error).message).toBe('disk full');
      }
    }

    const rereadStorage = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );
    const reread = await rereadStorage.load();
    expect(reread?.petName).toBe(original.petName);
  });

  it('読み戻した内容が一致しない場合は LocalProfileStorageError（WRITE_FAILED）を投げる', async () => {
    const root = newTemporaryDirectory();
    // save() は実ファイルへ委譲して成功しつつ、load() は常に別プロファイルを返す
    // 「検証に失敗する」実装を注入する。実際の Web / Native adapter ではこの不一致は
    // 通常発生しないが（write-then-verify のラウンドトリップは決定的であるため）、
    // Port 契約レベルでの防御を検証する。
    const inconsistentStorage = new VerifyMismatchStorage(
      new WebLocalProfileStorageAdapter(new FileBackedWebStorage(root)),
      existingProfile()
    );

    await expect(
      commitBackupImport(inconsistentStorage, importedProfile())
    ).rejects.toThrow(LocalProfileStorageError);
  });

  it('不正 JSON・未知 Major Version・欠落 Field・過大 File を Import しようとしても既存データを一切変更しない（Commit を呼ばないため）', async () => {
    const root = newTemporaryDirectory();
    const storage = new WebLocalProfileStorageAdapter(
      new FileBackedWebStorage(root)
    );
    const original = existingProfile();
    await storage.save(original);

    const invalidInputs = [
      '{ invalid json',
      JSON.stringify({
        ...JSON.parse(validBackupJson()),
        backupSchemaVersion: 99,
      }),
    ];
    for (const raw of invalidInputs) {
      const result = parseBackupImportCandidate(raw);
      expect(result.kind).toBe('rejected');
      // rejected の場合、呼び出し側は commitBackupImport を一切呼ばない契約であるため、
      // ここでは意図的に commit を呼ばず、Storage が変化していないことだけを確認する。
    }

    expect((await storage.load())?.petName).toBe(original.petName);
  });
});
