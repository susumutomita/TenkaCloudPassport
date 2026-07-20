import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'ScreenCard.tsx');
}

/**
 * Issue 72 D: `ScreenCard` は旧トークン（surface + border）のままだったため、
 * `Card` プリミティブ経由で Ink / Summit トークン（white + borderSubtle）へ移行する。
 */
describe('ScreenCard は Card プリミティブへ移行している', () => {
  it('Card を import して使う', async () => {
    const text = await source();

    expect(text).toContain("from './Card'");
    expect(text).toContain('<Card');
  });

  it('surface / border の旧トークンを直接使わない', async () => {
    const text = await source();

    expect(text).not.toContain('colors.surface');
    expect(text).not.toMatch(/borderColor:\s*colors\.border[,\s]/);
  });
});
