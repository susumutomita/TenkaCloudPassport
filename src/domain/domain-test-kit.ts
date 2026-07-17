import {
  createLocalPrivateProfile,
  type PublicPassport,
  projectPublicPassport,
} from './passport';

/**
 * Issue 10 で追加した複数のテストファイル（`shared-clue-match.test.ts` /
 * `interaction-discovery-provider.test.ts` / `pet-interaction.test.ts`）が同じ
 * 「カタログ ID の配列から確認済み Public Passport を組み立てる」手順を重複させないための
 * 共有 Test Kit（`src/app/storage-test-kit.ts` / `src/screens/accessibility-test-kit.ts` と
 * 同じ集約方針）。Owner Alias や Language は Rules / Discovery Provider の判定に関与しない
 * ため固定値のまま省略する。
 */
export function publicPassportWithClues(
  clueIds: readonly string[]
): PublicPassport {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
    languageCodes: [],
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });
}
