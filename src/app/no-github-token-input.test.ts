import { describe, expect, it } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Issue 14 の受け入れ条件「GitHub Token 入力欄を作らない」を、`src/` 配下の全ソースを
 * 走査するソーステキスト検査として固定する。`docs/guides/backup.md` が案内する手動配置は
 * GitHub の Web UI 経由のファイルアップロードか `git push` であり、アプリ自身は GitHub API・
 * GitHub CLI 認証・Personal Access Token・OAuth のいずれも要求しない。
 *
 * 「Token を扱いません」という UI 上の説明文はこの契約を守っている証拠であり、
 * 語彙の近接（"github" と "token"）だけを禁止すると、その正しい説明文まで
 * 誤検知してしまう。そのため、この Test は「実際に Token を入力させる仕組み」
 * （`TextInput` の label・placeholder、変数・interface field 名）だけを対象にする。
 */
const TOKEN_IDENTIFIER_PATTERN =
  /\b(?:github[_-]?(?:personal[_-]?access[_-]?)?token|gh[_-]?token|personal[_-]?access[_-]?token|githubpat|ghpat)\b/i;

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(fullPath);
  }
  return files;
}

/** `<TextInput ... />` の開始タグ 1 つ分（属性を含む）を切り出す。 */
function textInputTags(text: string): string[] {
  const tags: string[] = [];
  const pattern = /<TextInput\b[\s\S]*?\/?>/g;
  for (const match of text.matchAll(pattern)) {
    tags.push(match[0]);
  }
  return tags;
}

describe('GitHub Token 入力欄が存在しないことの契約（Issue 14）', () => {
  it('src 配下のどの TextInput にも token を要求する label・placeholder が無い', async () => {
    const srcRoot = path.join(import.meta.dir, '..');
    const files = collectSourceFiles(srcRoot).filter((filePath) =>
      filePath.endsWith('.tsx')
    );
    expect(files.length).toBeGreaterThan(5);

    let totalTextInputCount = 0;
    for (const filePath of files) {
      const text = await Bun.file(filePath).text();
      for (const tag of textInputTags(text)) {
        totalTextInputCount += 1;
        expect(tag.toLowerCase()).not.toContain('token');
      }
    }
    // TextInput を 1 つも検査していなければ、この Test は何も保証していないのと
    // 同じであるため、実際に走査対象があったことを固定する。
    expect(totalTextInputCount).toBeGreaterThan(0);
  });

  it('src 配下のどのファイルにも GitHub Token 用の変数・interface field 名が無い', async () => {
    const srcRoot = path.join(import.meta.dir, '..');
    const selfFile = path.join(
      import.meta.dir,
      'no-github-token-input.test.ts'
    );
    // このファイル自身は禁止パターンの定義をソースコードとして持つため、
    // 自己参照的な誤検知を避けるために走査対象から除く。
    const files = collectSourceFiles(srcRoot).filter(
      (filePath) => filePath !== selfFile
    );
    expect(files.length).toBeGreaterThan(50);

    for (const filePath of files) {
      const text = await Bun.file(filePath).text();
      expect(TOKEN_IDENTIFIER_PATTERN.test(text)).toBe(false);
    }
  });

  it('BackupExportScreen・BackupImportScreen が GitHub Token を要求しないことを明示する', async () => {
    for (const fileName of [
      '../screens/BackupExportScreen.tsx',
      '../screens/BackupImportScreen.tsx',
    ]) {
      const text = await Bun.file(new URL(fileName, import.meta.url)).text();
      expect(TOKEN_IDENTIFIER_PATTERN.test(text)).toBe(false);
    }
    const exportText = await Bun.file(
      new URL('../screens/BackupExportScreen.tsx', import.meta.url)
    ).text();
    expect(exportText).toContain('GitHub API と接続せず、Token を扱いません');
  });
});
