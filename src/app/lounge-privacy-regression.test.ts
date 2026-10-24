import { describe, expect, it, spyOn } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { RULES_INTERACTION_PROVIDER } from '../domain/interaction-discovery-provider';
import { createLocalPrivateProfile } from '../domain/passport';
import { RULES_PROVIDER } from '../domain/rules-provider';
import { ExpoFileSystemLocalProfileStorageAdapter } from './expo-file-system-local-profile-storage';
import {
  ALLOWED_LOCAL_PROFILE_KEYS,
  LOUNGE_FORBIDDEN_VOCABULARY,
  runFullLoungeLifecycleWithBridge,
  runFullLoungeLifecycleWithClarifyingQuestion,
} from './lounge-lifecycle-test-kit';
import * as interactionFlow from './pet-interaction-flow';
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

describe('Privacy regression harness rejects incomplete lifecycle evidence', () => {
  it('does not report a bridge lifecycle when the decision boundary returns no signal', () => {
    const decision = spyOn(RULES_PROVIDER, 'decide').mockReturnValue({
      kind: 'no-signal',
    });
    try {
      expect(() => runFullLoungeLifecycleWithBridge()).toThrow(
        new Error('Bridge が確定した retired が必要です。')
      );
      expect(decision).toHaveBeenCalledTimes(1);
    } finally {
      decision.mockRestore();
    }
    expect(runFullLoungeLifecycleWithBridge().destroyed).toEqual({
      status: 'destroyed',
      reason: 'completed',
    });
  });

  it('does not report an owner-question lifecycle when discovery offers no candidate', () => {
    const discovery = spyOn(
      RULES_INTERACTION_PROVIDER,
      'discover'
    ).mockReturnValue({ kind: 'no-signal' });
    try {
      expect(() => runFullLoungeLifecycleWithClarifyingQuestion()).toThrow(
        new Error('clarifying の候補が必要です。')
      );
      expect(discovery).toHaveBeenCalledTimes(1);
    } finally {
      discovery.mockRestore();
    }
    expect(runFullLoungeLifecycleWithClarifyingQuestion().destroyed).toEqual({
      status: 'destroyed',
      reason: 'completed',
    });
  });

  it('does not report confirmed bridge evidence when the answer boundary follows the declining path', () => {
    const originalAnswer = interactionFlow.submitOwnerQuestionAnswer;
    const answer = spyOn(
      interactionFlow,
      'submitOwnerQuestionAnswer'
    ).mockImplementation((interaction, active, _value, clock, language) =>
      originalAnswer(interaction, active, 'no', clock, language)
    );
    try {
      expect(() => runFullLoungeLifecycleWithClarifyingQuestion()).toThrow(
        new Error('Bridge が確定した retired が必要です。')
      );
      expect(answer).toHaveBeenCalledTimes(1);
    } finally {
      answer.mockRestore();
    }
    expect(runFullLoungeLifecycleWithClarifyingQuestion().destroyed).toEqual({
      status: 'destroyed',
      reason: 'completed',
    });
  });
});

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
