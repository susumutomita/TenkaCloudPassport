import { describe, expect, it } from 'bun:test';

async function source(fileName: string): Promise<string> {
  return Bun.file(new URL(fileName, import.meta.url)).text();
}

function expectInOrder(text: string, labels: readonly string[]): void {
  let previous = -1;
  for (const label of labels) {
    const position = text.indexOf(label);
    expect(position).toBeGreaterThan(previous);
    previous = position;
  }
}

describe('Passport Onboarding の Accessibility 契約', () => {
  it('初回設定の全入力に label と Native 入力 semantics を付け、説明から保存の順に配置する', async () => {
    const text = await source('PassportCreationScreen.tsx');

    expect(text.match(/accessibilityLabel=/g)?.length).toBeGreaterThanOrEqual(
      2
    );
    expect(text.match(/<TextInput/g)).toHaveLength(2);
    expect(text).not.toContain('accessibilityRole="text"');
    expectInOrder(text, [
      'Pet Name（必須）',
      'Pet Emoji（6 種類から 1 件）',
      'Owner Alias（任意、本名不要）',
      '会話の材料',
      'Languages（3 件まで）',
      'Local Profile を端末内に明示保存',
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

    expectInOrder(encounter, [
      '相手の Pet Name',
      '相手の Pet Emoji',
      '相手の公開項目',
      '相手が現在の Lounge で公開した内容',
      'Validation Error',
      '今回の共有 Preview へ',
    ]);
    expectInOrder(preview, [
      '機密情報を共有しないでください。',
      '今回の共有 ON / OFF',
      'Validation Error',
      'QR / Peer Payload Preview',
      'この Public Passport で Lounge に参加',
    ]);
  });

  it('空、Validation、保存失敗、Storage 利用不可を固有 UI 文言で表示する', async () => {
    const text = await source('PassportCreationScreen.tsx');

    for (const message of [
      '保存済み Profile はありません。',
      '入力を確認してください。',
      '保存に失敗しました。',
      '端末内 Storage を利用できません。',
      '端末内の保存データが不正です。',
    ]) {
      expect(text).toContain(message);
    }
  });
});
