import { describe, expect, it } from 'bun:test';
import { createLocalPrivateProfile } from '../domain/passport';
import {
  createBackupExportPreview,
  createDefaultDeviceSettings,
} from './backup-export';
import {
  LOUNGE_FORBIDDEN_VOCABULARY,
  runFullLoungeLifecycleWithBridge,
  runFullLoungeLifecycleWithClarifyingQuestion,
  startActiveLounge,
} from './lounge-lifecycle-test-kit';

/**
 * Issue 14 の受け入れ条件「Export に除外対象が 1 Byte も含まれない Snapshot Test」と
 * 「Lounge 終了直前・直後に Export しても Lounge Data が入らない Test」を、Issue 9 の
 * Privacy Regression Test（`lounge-privacy-regression.test.ts`）と同じ共有ヘルパー
 * （`lounge-lifecycle-test-kit.ts`）で固定する。Export される Backup 型は
 * `BackupExportInput`（`localPrivateProfile` / `deviceSettings` / `modelVerification` /
 * `exportedAt`）以外の入力を受け取れないため、Lounge 状態を渡す経路自体が型に存在しない。
 * このテストは、それでも実際の Active Lounge の進行・確定・破棄と同じタイミングで Export を
 * 呼び、生成される JSON バイト列に禁止語彙が 1 つも含まれないことを実行時レベルでも固定する
 * 回帰テストである。
 */
function ownerProfile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: 'つちのこ',
    candidateClueIds: ['open-source', 'local-tournament'],
    selectedForPassportClueIds: ['open-source', 'local-tournament'],
    languageCodes: ['ja'],
  });
}

function exportJsonFor(profile: ReturnType<typeof ownerProfile>): string {
  return createBackupExportPreview({
    localPrivateProfile: profile,
    deviceSettings: createDefaultDeviceSettings(),
    modelVerification: null,
    exportedAt: '2026-07-17T00:10:00.000Z',
  }).json;
}

function expectNoForbiddenVocabulary(json: string): void {
  for (const forbidden of LOUNGE_FORBIDDEN_VOCABULARY) {
    expect(json).not.toContain(forbidden);
  }
}

describe('Export の Snapshot 除外契約（Issue 14）', () => {
  it('Active Lounge が進行中（discovering 前）に Export しても、Lounge 由来の語彙は 1 つも含まれない', () => {
    const profile = ownerProfile();
    // Owner 自身の Local Profile とは無関係に、実際の Use Case 関数列でフル行程の
    // Active Lounge・Bridge・Owner Question・Peer 相当のデータを動かす。
    startActiveLounge();

    const json = exportJsonFor(profile);

    expectNoForbiddenVocabulary(json);
    expect(json).toMatchSnapshot();
  });

  it('Bridge が確定した retired の直後（Lounge 終了直前）に Export しても、Lounge 由来の語彙は 1 つも含まれない', () => {
    const profile = ownerProfile();
    const { retired } = runFullLoungeLifecycleWithBridge();
    expect(retired.status).toBe('retired');

    const json = exportJsonFor(profile);

    expectNoForbiddenVocabulary(json);
    expect(json).toMatchSnapshot();
  });

  it('Owner Question の clarifying を経由した Bridge 確定・完全破棄の直後（Lounge 終了直後）に Export しても、Lounge 由来の語彙は 1 つも含まれない', () => {
    const profile = ownerProfile();
    const { destroyed } = runFullLoungeLifecycleWithClarifyingQuestion();
    expect(destroyed.status).toBe('destroyed');

    const json = exportJsonFor(profile);

    expectNoForbiddenVocabulary(json);
    expect(json).toMatchSnapshot();
  });

  it('完全破棄（completeLounge）の直後に Export しても、Lounge 由来の語彙は 1 つも含まれない', () => {
    const profile = ownerProfile();
    const { destroyed } = runFullLoungeLifecycleWithBridge();
    expect(destroyed.status).toBe('destroyed');

    const json = exportJsonFor(profile);

    expectNoForbiddenVocabulary(json);
    expect(JSON.parse(json)).toEqual({
      backupSchemaVersion: 2,
      exportedAt: '2026-07-17T00:10:00.000Z',
      localPrivateProfile: {
        schemaVersion: 2,
        catalogVersion: profile.catalogVersion,
        petName: 'こむぎ',
        petEmoji: '🐾',
        ownerAlias: 'つちのこ',
        candidateClues: profile.candidateClues,
        excludedTopics: [],
        languages: ['ja'],
      },
      deviceSettings: createDefaultDeviceSettings(),
      modelVerification: null,
    });
  });
});
