import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createLocalPrivateProfile } from '../domain/passport';
import { ExpoFileSystemLocalProfileStorageAdapter } from './expo-file-system-local-profile-storage';
import {
  ALLOWED_LOCAL_PROFILE_KEYS,
  LOUNGE_FORBIDDEN_VOCABULARY,
  runFullLoungeLifecycleWithBridge,
  runFullLoungeLifecycleWithClarifyingQuestion,
} from './lounge-lifecycle-test-kit';
import {
  BunProfileDocument,
  FileBackedWebStorage,
  trackTemporaryDirectories,
} from './storage-test-kit';
import {
  LOCAL_PROFILE_STORAGE_KEY,
  WebLocalProfileStorageAdapter,
} from './web-local-profile-storage';

function ownerProfile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: 'つちのこ',
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
    languageCodes: ['ja'],
  });
}

const { create: newTemporaryDirectory } = trackTemporaryDirectories();

describe('Lounge 由来データの Storage 不揮発化を保証する Privacy Regression Test', () => {
  it('Web 相当の Storage は、Bridge 確定から完全破棄までの全行程を経ても Local Profile 以外のキーを持たない', async () => {
    const root = newTemporaryDirectory();
    const webStorage = new FileBackedWebStorage(root);
    const storagePort = new WebLocalProfileStorageAdapter(webStorage);

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithBridge();

    expect(webStorage.listKeys()).toEqual([LOCAL_PROFILE_STORAGE_KEY]);

    const raw = webStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    for (const forbidden of LOUNGE_FORBIDDEN_VOCABULARY) {
      expect(raw ?? '').not.toContain(forbidden);
    }
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect(ALLOWED_LOCAL_PROFILE_KEYS).toContain(key);
    }
  });

  it('Native（実ファイル I/O）相当の Storage も、同じ行程を経て保存先ディレクトリに Local Profile 用の 1 ファイルしか作らない', async () => {
    const root = newTemporaryDirectory();
    const filePath = path.join(root, 'local-profile.json');
    const storagePort = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithBridge();

    expect(readdirSync(root)).toEqual(['local-profile.json']);

    const restored = await storagePort.load();
    expect(restored).not.toBeNull();
    for (const key of Object.keys(restored ?? {})) {
      expect(ALLOWED_LOCAL_PROFILE_KEYS).toContain(key);
    }
  });

  it('Owner Question の clarifying を経由した Bridge 確定でも、Web 相当の Storage は Local Profile 以外のキーを持たない', async () => {
    const root = newTemporaryDirectory();
    const webStorage = new FileBackedWebStorage(root);
    const storagePort = new WebLocalProfileStorageAdapter(webStorage);

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithClarifyingQuestion();

    expect(webStorage.listKeys()).toEqual([LOCAL_PROFILE_STORAGE_KEY]);

    const raw = webStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    for (const forbidden of LOUNGE_FORBIDDEN_VOCABULARY) {
      expect(raw ?? '').not.toContain(forbidden);
    }
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect(ALLOWED_LOCAL_PROFILE_KEYS).toContain(key);
    }
  });

  it('Owner Question の clarifying を経由した Bridge 確定でも、Native 相当の Storage は Local Profile 用の 1 ファイルしか持たない', async () => {
    const root = newTemporaryDirectory();
    const filePath = path.join(root, 'local-profile.json');
    const storagePort = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithClarifyingQuestion();

    expect(readdirSync(root)).toEqual(['local-profile.json']);

    const restored = await storagePort.load();
    expect(restored).not.toBeNull();
    for (const key of Object.keys(restored ?? {})) {
      expect(ALLOWED_LOCAL_PROFILE_KEYS).toContain(key);
    }
  });

  it('Backup 型は Local Profile 由来の情報だけを持ち、Lounge / Pet Interaction 由来の語彙を含まない', async () => {
    const text = await Bun.file(
      new URL('../domain/backup.ts', import.meta.url)
    ).text();

    for (const forbidden of [
      ...LOUNGE_FORBIDDEN_VOCABULARY,
      'PetInteraction',
      'OwnerQuestion',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('Owner Question の回答画面・段階は Storage Port を一切 import しない（メモも含めて端末へ保存しない）', async () => {
    for (const fileName of [
      '../screens/OwnerQuestionScreen.tsx',
      './owner-question-answer-flow.ts',
      './owner-question-disclosure.ts',
      './pet-interaction-flow.ts',
    ]) {
      const text = await Bun.file(new URL(fileName, import.meta.url)).text();
      expect(text).not.toContain('local-profile-storage');
      expect(text).not.toContain('LocalProfileStoragePort');
    }
  });
});
