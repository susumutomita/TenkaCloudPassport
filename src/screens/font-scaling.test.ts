import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readSourceFile } from './accessibility-test-kit';

const SCREEN_FILE_NAMES = readdirSync(path.join(import.meta.dir))
  .filter((name) => name.endsWith('Screen.tsx'))
  .sort();

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

/**
 * Issue 15 の受け入れ条件「200％ Text で切れ、重なり、横 Scroll が主要画面にない」を、
 * レンダリング基盤を持たないこの repo で機械検証できる範囲まで落とす。
 * `allowFontScaling` は React Native の既定 `true` のままにし、無効化しない。
 * `numberOfLines={1}` は Privacy / Consent に関わる本文を切り詰めるため使わない
 * （カウンタ表示等、意図的に 1 行を許容してよい将来のケースが出た場合は個別に判断する）。
 */
describe('200％ Text（allowFontScaling を無効化せず、本文を 1 行へ切り詰めない）', () => {
  it('少なくとも 10 個の Screen ファイルを検査対象にしている（走査漏れの回帰防止）', () => {
    expect(SCREEN_FILE_NAMES.length).toBeGreaterThanOrEqual(10);
  });

  it('どの Screen も allowFontScaling={false} を指定しない', async () => {
    for (const fileName of SCREEN_FILE_NAMES) {
      const text = await source(fileName);
      expect(text).not.toContain('allowFontScaling={false}');
      expect(text).not.toContain('allowFontScaling: false');
    }
  });

  it('どの Screen も numberOfLines={1} で本文を切り詰めない', async () => {
    for (const fileName of SCREEN_FILE_NAMES) {
      const text = await source(fileName);
      expect(text).not.toContain('numberOfLines={1}');
      expect(text).not.toContain('numberOfLines: 1');
    }
  });

  it('Privacy / Consent 文言を持つ主要画面は固定 height の Text 用コンテナを使わない（minHeight のみ許可）', async () => {
    for (const fileName of [
      'PassportCreationScreen.tsx',
      'EncounterSetupScreen.tsx',
      'PassportSharePreviewScreen.tsx',
      'OwnerQuestionScreen.tsx',
    ]) {
      const text = await source(fileName);
      // TextInput の入力欄自体は複数行編集領域として `height` を固定してよいため対象外
      // にし、Text を包む View（disclosure・confirm・notice 等の Card 系コンテナ）だけを
      // 対象にする。`minHeight` は許可し、装飾用の固定正方形（24 等、checkbox）も
      // Text 本文コンテナではないため誤検知しない値域（100 未満）だけを見逃す。
      const fixedHeightMatches =
        text.match(/(?<!min)[Hh]eight:\s*(\d+)/g) ?? [];
      for (const match of fixedHeightMatches) {
        const value = Number(match.replace(/\D/g, ''));
        expect(value).toBeLessThan(100);
      }
    }
  });
});
