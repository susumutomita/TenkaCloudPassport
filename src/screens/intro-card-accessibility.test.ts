import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

describe('自己紹介カード（Issue 79）の Accessibility 契約', () => {
  it('編集画面は名前必須・自己紹介・連絡先・保存の順に配置し、全入力に label を付ける', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text.match(/<TextInput/g)).toHaveLength(7);
    expectInOrder(text, [
      't.nameLabel',
      't.titleLabel',
      't.organizationLabel',
      't.selfIntroLabel',
      't.emailLabel',
      't.phoneLabel',
      't.linksLabel',
      't.byteUsageLabel',
      't.saveButton(saving)',
    ]);
  });

  it('編集画面の必須入力（名前）は accessibilityLabel と accessibilityHint を持つ', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('accessibilityLabel={t.nameAccessibilityLabel}');
    expect(text).toContain('accessibilityHint={t.nameHint(');
  });

  it('編集画面の Notice は入力エラーと成功を Message Catalog の kind 別 title で区別する', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('.introCard.noticeTitles[notice.kind]');
    expect(text).toContain("accessibilityRole={isError ? 'alert' : 'summary'}");
  });

  it('表示画面は実 QR・説明・名前・編集・削除の順に配置する', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('<RealQrView matrix={encodedQr.matrix} />');
    expectInOrder(text, [
      '<RealQrView matrix={encodedQr.matrix} />',
      't.qrExplanation',
      'card.name',
      't.editButton',
      't.deleteButton',
    ]);
  });

  it('表示画面は QR を Accessibility Label 付きの View で包む', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('accessibilityLabel={t.qrAccessibilityLabel}');
  });

  it('表示画面は削除失敗（deleteError）を alert role で明示表示する（stage を変えずに留まるため）', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('deleteError ?');
    expect(text).toContain('accessibilityRole="alert"');
    expect(text).toContain("t.noticeTitles['delete-error']");
  });

  it('表示画面・編集画面のどちらも Settings と Backup への導線を維持する', async () => {
    for (const fileName of ['IntroCardScreen.tsx', 'IntroCardEditScreen.tsx']) {
      const text = await source(fileName);

      expect(text).toContain('onPress={onOpenSettings}');
      expect(text).toContain('onPress={onOpenBackup}');
    }
  });

  it('編集画面は encodeVCard・RealQrView に依存しない（QR 生成は表示画面の責務）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).not.toContain('encodeVCard');
    expect(text).not.toContain('RealQrView');
  });

  it('domain の文字数上限を直書きせず intro-card.ts の定数を import する', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain("from '../domain/intro-card'");
    expect(text).toContain('INTRO_CARD_NAME_MAX_LENGTH');
    expect(text).toContain('INTRO_CARD_MAX_LINKS');
  });
});
