import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'NoticeCard.tsx');
}

/**
 * Issue 72 D: `NoticeCard` は primarySoft（surface と同値化した旧トークン）のままだった
 * ため surface 地へ移行する。
 */
describe('NoticeCard は surface 地へ移行している', () => {
  it('primarySoft を使わず surface 地にする', async () => {
    const text = await source();

    expect(text).not.toContain('colors.primarySoft');
    expect(text).toContain('colors.surface');
  });
});
