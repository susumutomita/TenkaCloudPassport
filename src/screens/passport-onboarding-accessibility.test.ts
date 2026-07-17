import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

describe('Passport Onboarding の Accessibility 契約', () => {
  it('初回設定の全入力に label と Native 入力 semantics を付け、説明から保存の順に配置する', async () => {
    const text = await source('PassportCreationScreen.tsx');

    expect(text.match(/accessibilityLabel=/g)?.length).toBeGreaterThanOrEqual(
      2
    );
    expect(text.match(/<TextInput/g)).toHaveLength(2);
    expect(text).not.toContain('accessibilityRole="text"');
    // Issue 15: 文言そのものは `src/app/i18n/messages.ts` へ集約したため、正確な JA/EN
    // 文言のピン留めは `messages.test.ts` が担う。ここでは画面の配置順序を Message
    // Catalog の Key 参照で固定する。
    expectInOrder(text, [
      't.petNameLabel',
      't.petEmojiLabel',
      't.ownerAliasLabel',
      't.cluesSectionTitle',
      't.languagesSectionTitle',
      't.saveButton(saving)',
    ]);
  });

  it('選択部品の全操作に明示 label、role、state を付ける', async () => {
    for (const fileName of [
      '../components/ClueSelector.tsx',
      '../components/PetEmojiSelector.tsx',
      '../components/LanguageSelector.tsx',
      'PassportSharePreviewScreen.tsx',
    ]) {
      const text = await source(fileName);
      expect(text).toContain('accessibilityLabel=');
      expect(text).toContain('accessibilityRole=');
      expect(text).toContain('accessibilityState=');
    }
  });

  it('Encounter と共有 Preview は入力、確認、Validation、主操作の順に配置する', async () => {
    const encounter = await source('EncounterSetupScreen.tsx');
    const preview = await source('PassportSharePreviewScreen.tsx');

    // Issue 15: 正確な JA/EN 文言のピン留めは messages.test.ts が担う。ここでは Message
    // Catalog の Key 参照の配置順序を固定する。
    expectInOrder(encounter, [
      't.peerPetNameSectionTitle',
      't.peerPetEmojiSectionTitle',
      't.peerCluesSectionTitle',
      't.confirmationText',
      't.validationErrorTitle',
      't.continueButton',
    ]);
    expectInOrder(preview, [
      't.warningTitle',
      't.toggleSectionTitle',
      't.validationErrorTitle',
      't.previewTitle',
      't.startButton',
    ]);
  });

  it('空、Validation、保存失敗、Storage 利用不可の 5 種類すべてが Message Catalog の noticeTitles を参照する', async () => {
    const text = await source('PassportCreationScreen.tsx');

    expect(text).toContain(
      'MESSAGES[locale].passportCreation.noticeTitles[notice.kind]'
    );
    // 正確な JA/EN 文言のピン留めは messages.test.ts の
    // 「Profile Notice の 8 種類すべてに JA/EN 双方の title を持つ」が担う。
  });
});
