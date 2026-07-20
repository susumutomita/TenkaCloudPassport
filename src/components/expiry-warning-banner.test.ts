import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ExpiryWarningBanner.tsx');
}

/**
 * Issue 72 B: `expiryWarning` + `expiryWarningText` のスタイルと JSX が
 * ActiveLounge / HostInvite / Outcome の 3 画面でバイト単位一致していたため共有原子へ
 * 抽出する。`BackupNoticeBanner.tsx` と同種の抽出。表示条件（`notice.level ===
 * 'warning'`）は screen 側に残し、`qr-invite-accessibility.test.ts` のソース文字列順
 * 契約を壊さない。
 */
describe('ExpiryWarningBanner（満了間近バナー共有原子）のソース契約', () => {
  it('props は message だけを受ける', async () => {
    const text = await source();

    expect(text).toContain('readonly message: string');
    expect(text.match(/readonly/g)).toHaveLength(1);
  });

  it('alert ロールの View に StatusDot（warning）と Text を配置する', async () => {
    const text = await source();

    expect(text).toContain('accessibilityRole="alert"');
    expect(text).toContain("from './StatusDot'");
    expect(text).toContain('<StatusDot tone="warning"');
    expect(text).toContain('<Text');
    expect(text).toContain('{message}');
  });

  it('文言は message prop 以外に持たない（表示条件は screen 側に残す）', async () => {
    const text = await source();

    expect(text).not.toContain('notice.level');
    expect(text).not.toContain('expiryNotice');
  });

  it('色の 16 進値を直書きせず theme のトークンだけを使う', async () => {
    const text = await source();

    expect(text).toContain("from '../ui/theme'");
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
