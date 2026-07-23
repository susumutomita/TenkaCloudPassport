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
 * Issue 118 の Codex レビュー指摘: 200% Text 契約が `src/screens/*Screen.tsx` だけを
 * 走査し、共通ヘッダー（BrandMark ロックアップ + JA/EN トグル）を持つ
 * `src/components/AppScreen.tsx` が対象外になっていた。全 Screen がこのヘッダーを
 * 経由するため、`SCREEN_FILE_NAMES` の走査に加えてこのファイルも同じ 2 契約
 * （`allowFontScaling={false}` 不使用・`numberOfLines={1}` 不使用）で検査する。
 */
const APP_SCREEN_RELATIVE_PATH = '../components/AppScreen.tsx';
const FONT_SCALING_TARGETS: readonly string[] = [
  ...SCREEN_FILE_NAMES,
  APP_SCREEN_RELATIVE_PATH,
];

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

  it('どの Screen も AppScreen も allowFontScaling={false} を指定しない', async () => {
    for (const fileName of FONT_SCALING_TARGETS) {
      const text = await source(fileName);
      expect(text).not.toContain('allowFontScaling={false}');
      expect(text).not.toContain('allowFontScaling: false');
    }
  });

  it('どの Screen も AppScreen も numberOfLines={1} で本文を切り詰めない', async () => {
    for (const fileName of FONT_SCALING_TARGETS) {
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

/**
 * Issue 118 の Codex レビュー指摘: `AppScreen.tsx` のヘッダー（BrandMark ロックアップと
 * JA/EN トグルを 1 行に横並びさせる `brandRow`）に、200% Text・狭幅端末でも
 * クリップ・重なりにならない根拠がなかった。`brandRow` に `flexWrap: 'wrap'` を
 * 与え収まらない場合だけトグルを次行へ折り返し、`brandLockup` と `brand` Text に
 * `flexShrink: 1`（`brandLockup` はさらに `minWidth: 0`）を与えて、ロックアップ側が
 * 固定幅のまま `localeToggle` を押し出さないようにした。これらのスタイルの存在を
 * ソーステキスト検査で固定し、再び横並び固定幅へ戻る回帰を防ぐ。
 */
describe('AppScreen ヘッダー（BrandMark + JA/EN トグル）の 200% / 狭幅レイアウト契約', () => {
  it('brandRow が収まらない場合にトグルを折り返す（flexWrap: wrap）', async () => {
    const text = await source(APP_SCREEN_RELATIVE_PATH);
    const styleStart = text.indexOf('brandRow: {');
    const styleEnd = text.indexOf('},', styleStart);
    const brandRowStyle = text.slice(styleStart, styleEnd);

    expect(brandRowStyle).toContain("flexWrap: 'wrap'");
  });

  it('brandLockup が幅を固定せず縮小できる（flexShrink・minWidth: 0）', async () => {
    const text = await source(APP_SCREEN_RELATIVE_PATH);
    const styleStart = text.indexOf('brandLockup: {');
    const styleEnd = text.indexOf('},', styleStart);
    const brandLockupStyle = text.slice(styleStart, styleEnd);

    expect(brandLockupStyle).toContain('flexShrink: 1');
    expect(brandLockupStyle).toContain('minWidth: 0');
  });

  it('brand（"TenkaCloud Passport"）テキストも縮小できる（flexShrink）', async () => {
    const text = await source(APP_SCREEN_RELATIVE_PATH);
    const styleStart = text.indexOf('brand: {');
    const styleEnd = text.indexOf('},', styleStart);
    const brandStyle = text.slice(styleStart, styleEnd);

    expect(brandStyle).toContain('flexShrink: 1');
  });
});
