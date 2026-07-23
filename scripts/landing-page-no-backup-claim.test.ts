import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

/**
 * Issue 118 の Codex レビュー指摘: JSON Backup 機能は削除済みだが、公開中の LP
 * （`site/index.html` / `site/en/index.html`）が「持ち出しは JSON Backup のみ」と
 * 説明したまま残っており、実挙動と矛盾していた。アクティブな LP に Backup 参照が
 * 復活したら検知できるよう、ソーステキスト検査で固定する
 * （`scripts/intro-card-viewer.test.ts` の慣行に倣う）。
 */
const activeLandingPagePaths = [
  join(import.meta.dir, '..', 'site/index.html'),
  join(import.meta.dir, '..', 'site/en/index.html'),
] as const;

describe('アクティブな LP（site/index.html・site/en/index.html）の Backup 記述回帰', () => {
  it.each(
    activeLandingPagePaths
  )('%s が JSON Backup を謳う記述を含まない', async (path) => {
    const text = await Bun.file(path).text();

    expect(text).not.toMatch(/JSON\s*Backup/i);
  });

  it.each(
    activeLandingPagePaths
  )('%s が端末内保存のみで書き出し・バックアップ機能が無いことを説明する', async (path) => {
    const text = await Bun.file(path).text();

    expect(text).toMatch(
      /no export or backup feature|書き出しや自動バックアップの機能は持ちません/i
    );
  });

  it.each(
    activeLandingPagePaths
  )('%s が #125 の連絡先追加の注意書き（プラットフォーム差異）を維持する', async (path) => {
    const text = await Bun.file(path).text();

    expect(text).toMatch(
      /Adding to contacts has been verified only on iPhone\/Safari|連絡先への追加を確認済みなのは iPhone \/ Safari のみです/
    );
  });
});
