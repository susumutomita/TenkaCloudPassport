import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Issue 14 の受け入れ条件「GitHub Token 入力欄を作らない」を、`src/` 配下の全ソースを
 * 走査するソーステキスト検査として固定する。JSON Backup 機能自体（`docs/guides/backup.md`
 * が案内していた手動配置を含む）は Issue 118 / ADR-0033 で削除したが、アプリ本体は元々
 * GitHub API・GitHub CLI 認証・Personal Access Token・OAuth のいずれも要求しておらず、
 * この受け入れ条件は Backup の有無によらず引き続き成り立つ。
 *
 * 「Token を扱いません」という UI 上の説明文（Backup 削除に伴い今は存在しない）は
 * この契約を守っている証拠だった。語彙の近接（"github" と "token"）だけを禁止すると、
 * そのような正しい説明文まで誤検知してしまう。そのため、この Test は「実際に Token を
 * 入力させる仕組み」（`TextInput` の label・placeholder、変数・interface field 名）
 * だけを対象にする。
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

  it('Issue 118: JSON Backup 機能自体（BackupExportScreen・BackupImportScreen・Message Catalog の backupExport/backupImport 文言）を削除済みであり、GitHub Token 関連の説明文自体が存在しない', async () => {
    // Issue 14 時点では、Backup Export/Import 画面が「GitHub Token を扱わない」旨を
    // 明示していた。Issue 118 / ADR-0033 で JSON Backup 機能自体を削除したため、
    // その画面・説明文はもう存在しない。この Test は「削除されたことの確認」であり、
    // 「GitHub Token 入力欄を作らない」という受け入れ条件自体は上の 2 Test（走査ベース）
    // が引き続き機械検証する。
    const srcRoot = path.join(import.meta.dir, '..');
    for (const fileName of [
      'screens/BackupExportScreen.tsx',
      'screens/BackupImportScreen.tsx',
    ]) {
      expect(existsSync(path.join(srcRoot, fileName))).toBe(false);
    }
    const messagesText = await Bun.file(
      new URL('./i18n/messages.ts', import.meta.url)
    ).text();
    expect(messagesText).not.toContain('backupExport:');
    expect(messagesText).not.toContain('backupImport:');
  });
});
