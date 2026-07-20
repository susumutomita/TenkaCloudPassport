import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

/**
 * Issue 72 の受け入れ基準「ドット寸法 7px・tone 写像が 1 箇所、expiryWarning
 * スタイルの重複 0、monoLabel 書式の再組立て 0」を、共有原子が実際に import・使用
 * されていることまで含めて固定する（型だけでなく利用側の退行を防ぐ）。
 */
describe('Issue 72: 共有原子（StatusDot / ExpiryWarningBanner / monoLabel）の採用箇所', () => {
  const statusDotScreens = [
    'ActiveLoungeScreen.tsx',
    'HostInviteScreen.tsx',
    'OutcomeScreen.tsx',
    'OwnerQuestionScreen.tsx',
  ];

  for (const fileName of statusDotScreens) {
    it(`${fileName} は StatusDot を import して使う（ローカル statusDot スタイルを再定義しない）`, async () => {
      const text = await source(fileName);

      expect(text).toContain("from '../components/StatusDot'");
      expect(text).toContain('<StatusDot');
      expect(text).not.toContain('statusDot:');
    });
  }

  const expiryWarningScreens = [
    'ActiveLoungeScreen.tsx',
    'HostInviteScreen.tsx',
    'OutcomeScreen.tsx',
  ];

  for (const fileName of expiryWarningScreens) {
    it(`${fileName} は ExpiryWarningBanner を import して使う（expiryWarning スタイルを再定義しない）`, async () => {
      const text = await source(fileName);

      expect(text).toContain("from '../components/ExpiryWarningBanner'");
      expect(text).toContain(
        '<ExpiryWarningBanner message={notice.message} />'
      );
      expect(text).not.toContain('expiryWarning:');
      expect(text).not.toContain('expiryWarningText:');
    });
  }

  /**
   * code-reviewer 指摘（should-fix）: monoLabel は letterSpacing 0.8 +
   * textTransform: uppercase を伴う「大文字キャプション」書式であり、9 箇所のうち
   * 元々キャプションだった 4 箇所（ClueSelector.category /
   * ActiveLounge.passportTitle / Outcome.resultKind / Outcome.sourceLabelsCaption）
   * にだけ適用する。ActiveLounge.interactionStatus・HostInvite.noticeTitle・
   * OwnerQuestion.countdown・PassportCreation.counter は元々 letterSpacing も
   * uppercase も持たない本文・警告文・カウンタであり、monoLabel 化すると英語ロケールで
   * 大文字化しフォントサイズ・太さが下がる視覚回帰になるため、リデザイン前の
   * スタイル値へ戻す（monoFontFamily を直接使う）。
   */
  const monoLabelFiles = [
    ['ActiveLoungeScreen.tsx', 1],
    ['OutcomeScreen.tsx', 2],
    ['../components/ClueSelector.tsx', 1],
  ] as const;

  for (const [fileName, expectedCount] of monoLabelFiles) {
    it(`${fileName} は monoLabel（真のキャプション）を ${expectedCount} 箇所で使う`, async () => {
      const text = await source(fileName);

      expect(text).toContain("from '../ui/typography'");
      expect(text.match(/\.\.\.monoLabel/g)).toHaveLength(expectedCount);
    });
  }

  const revertedMonoFontFamilyFiles = [
    'ActiveLoungeScreen.tsx',
    'HostInviteScreen.tsx',
    'OwnerQuestionScreen.tsx',
    'PassportCreationScreen.tsx',
  ];

  for (const fileName of revertedMonoFontFamilyFiles) {
    it(`${fileName} は本文・警告文・カウンタの mono 部を monoLabel 化しない`, async () => {
      const text = await source(fileName);

      expect(text).toContain('fontFamily: monoFontFamily');
    });
  }

  for (const fileName of [
    'HostInviteScreen.tsx',
    'OwnerQuestionScreen.tsx',
    'PassportCreationScreen.tsx',
  ]) {
    it(`${fileName} は monoLabel を import しない（キャプションを持たない）`, async () => {
      const text = await source(fileName);

      expect(text).not.toContain('monoLabel');
    });
  }

  it('AppScreen.eyebrow は monoLabel へ移行せず現状維持する（Issue 72 C の明記事項）', async () => {
    const text = await source('../components/AppScreen.tsx');

    expect(text).toContain('fontFamily: monoFontFamily');
    expect(text).not.toContain('monoLabel');
  });
});
