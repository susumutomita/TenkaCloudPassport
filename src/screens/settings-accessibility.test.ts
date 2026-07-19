import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'SettingsScreen.tsx');
}

/**
 * Issue 15 の受け入れ条件「Settings（言語切り替え）」を Screen のソーステキストで固定する。
 * この repo はレンダリング用の統合テスト基盤を持たないため、他の Screen の
 * Accessibility 契約と同じくソーステキスト検査で担保する。
 */
describe('Settings 画面（言語切り替え）の Accessibility 契約', () => {
  it('説明、現在の配布能力、言語セクション、選択肢、戻るボタンの順に配置する', async () => {
    const text = await source();

    expectInOrder(text, [
      't.description',
      't.distributionSectionTitle',
      'capabilityNotice.runtime',
      'capabilityNotice.tier',
      'capabilityNotice.rulesProvider',
      'capabilityNotice.localModel',
      'capabilityNotice.nearbyTransport',
      't.languageSectionTitle',
      'LOCALES.map(',
      't.backButton',
    ]);
  });

  it('各言語の選択肢は ActionButton で表示され、選択中かどうかを variant と文言の両方で示す', async () => {
    const text = await source();

    expect(text).toContain('variant={selected ? ');
    expect(text).toContain('t.languageOptionAccessibilityLabel(');
    expect(text).toContain('accessibilityHint={t.languageOptionHint}');
  });

  it('言語切替は onChangeLocale だけを呼び、Lounge / Room / Profile の state に触れない', async () => {
    const text = await source();

    expect(text).toContain('onPress={() => onChangeLocale(option)}');
    for (const forbidden of [
      'setLounge',
      'setLoungeRoom',
      'setInteraction',
      'setPrivateProfile',
      'discardInviteFlow',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('LOCALES の全 Locale 分の選択肢を用意する（JA/EN の両方）', async () => {
    const text = await source();

    expect(text).toContain("from '../app/i18n/locale'");
    expect(text).toContain('LOCALES');
  });

  it('配布能力は Platform Composition から受け取り、Screen 内で Runtime を推測しない', async () => {
    const text = await source();

    expect(text).toContain('distributionCapability: DistributionCapability');
    expect(text).toMatch(
      /distributionCapabilityNotice\(\s*distributionCapability,\s*locale\s*\)/
    );
    expect(text).not.toContain('isRunningInExpoGo');
    expect(text).not.toContain('Platform.OS');
  });
});
