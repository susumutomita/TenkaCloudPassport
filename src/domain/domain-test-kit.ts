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
 * 同じ集約方針）。Language は Issue 12（`bridge-selection.test.ts`）の共通 Language
 * Evidence 判定で使うため、任意の第 2 引数として渡せる。Owner Alias も同じ Issue 12 の
 * 「Alias は Evidence に混入しない」テストで使うため、任意の第 3 引数として渡せる
 * （既定はどちらも Rules / Discovery Provider / Bridge Selection の判定に影響しない値
 * （空配列・空文字列）のままで、既存の呼び出し側は変更なしで動く）。
 */
export function publicPassportWithClues(
  clueIds: readonly string[],
  languageCodes: readonly string[] = [],
  ownerAlias = ''
): PublicPassport {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias,
    candidateClueIds: clueIds,
    selectedForPassportClueIds: clueIds,
    languageCodes,
  });
  return projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: ownerAlias.length > 0,
    clueIds,
    languageCodes,
    ownerConfirmed: true,
  });
}
