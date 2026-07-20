import { describe, expect, it } from 'bun:test';
import { readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

function styleBlock(text: string, styleName: string): string {
  const pattern = new RegExp(`${styleName}:\\s*\\{([^}]*)\\}`);
  const match = pattern.exec(text);
  if (!match?.[1]) {
    throw new Error(`Style ${styleName} が見つかりません。`);
  }
  return match[1];
}

/**
 * Issue 72 E（F-QGJCNV）: primarySoft が surface と同値（`#f5f5f7`）になり、
 * tint 単独の選択・強調表現が基面に埋没した。強調したい View は必ず
 * `primaryEmphasisBorder`（`src/ui/theme.ts`、`borderColor: colors.primary` +
 * `borderWidth: 1`）を併用する（ClueSelector の selectedOption が既にこの形）。
 * 4 画面で個別に再組立てしていた同じ 2 行は `primaryEmphasisBorder` の spread へ
 * 集約し、対応表は theme.ts の 1 箇所に閉じる（`theme.test.ts` が値を固定する）。
 */
describe('primarySoft を使う強調 View は primaryEmphasisBorder を併用する', () => {
  const targets: ReadonlyArray<readonly [string, string]> = [
    ['EncounterSetupScreen.tsx', 'summary'],
    ['QrScanScreen.tsx', 'notice'],
    ['LocalDiagnosticsScreen.tsx', 'notice'],
    ['PilotMeasurementScreen.tsx', 'noticeText'],
  ];

  for (const [fileName, styleName] of targets) {
    it(`${fileName} の ${styleName} は primarySoft と primaryEmphasisBorder を併用する`, async () => {
      const text = await source(fileName);
      const block = styleBlock(text, styleName);

      expect(text).toContain("from '../ui/theme'");
      expect(text).toContain('primaryEmphasisBorder');
      expect(block).toContain('colors.primarySoft');
      expect(block).toContain('...primaryEmphasisBorder');
      // 枠線を個別に再組立てしない（primaryEmphasisBorder の spread 1 箇所に閉じる）。
      expect(block).not.toContain('borderColor: colors.primary');
      expect(block).not.toContain('borderWidth: 1');
    });
  }
});
