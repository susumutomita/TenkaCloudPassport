import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { QR_ENCODER_MAX_BYTES } from '../src/qr/encoder';

/**
 * Issue 130（Codex 指摘 major）: `docs/privacy/data-inventory.md` の自己紹介カード QR
 * 行が「URL 全体で 1,024 byte 以内」と書かれたままだったが、Issue 123（ADR-0032、
 * 誤り訂正水準を M から L へ変更）で実際の上限は `QR_ENCODER_MAX_BYTES`（1,367 byte）に
 * 変わっていた。ドキュメントの数値をハードコードで検査すると将来また drift しうるため、
 * `QR_ENCODER_MAX_BYTES` から動的に導出した文字列で照合し、定数が変わればこのテストが
 * 追従を強制する（`scripts/landing-page-no-backup-claim.test.ts` の慣行に倣う）。
 */
const dataInventoryPath = join(
  import.meta.dir,
  '..',
  'docs/privacy/data-inventory.md'
);

describe('data-inventory.md の自己紹介カード QR URL 上限が QR_ENCODER_MAX_BYTES と一致する契約', () => {
  it('QR 行が現在の QR_ENCODER_MAX_BYTES 由来の byte 数を明示する', async () => {
    const text = await Bun.file(dataInventoryPath).text();
    const expectedByteText = `${QR_ENCODER_MAX_BYTES.toLocaleString('en-US')} byte`;

    expect(text).toContain(expectedByteText);
    expect(text).toContain('QR_ENCODER_MAX_BYTES');
  });

  it('古い上限（1,024 byte）の記述が残っていない（Issue 123 / ADR-0032 で L 化した後の値に更新済み）', async () => {
    const text = await Bun.file(dataInventoryPath).text();

    expect(text).not.toContain('1,024 byte');
  });
});
