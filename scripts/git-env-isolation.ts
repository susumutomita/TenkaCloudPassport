/**
 * `git` は `cwd` より `GIT_DIR` / `GIT_WORK_TREE` 系の環境変数を優先してリポジトリを
 * 解決する。git 自身がフック（`pre-commit` 等）を起動するとき、フックが呼び出し元
 * リポジトリを `--git-dir` なしで扱えるよう、これらの環境変数をフックの子プロセスへ
 * 自動的に設定する。そのため `git commit` → `.husky/pre-commit` → `make before-commit`
 * → `bun test scripts/` という経路で起動された `bun` プロセス（および、そこからさらに
 * spawn する `git` / `bun -e` 子プロセス）は、明示的に env を上書きしない限りこれらを
 * 継承する。
 *
 * `scripts/source-release.ts`（release candidate 生成が読む対象コミットの git tree /
 * blob）、`scripts/exclusive-output-writer.ts`（そこから spawn する出力ストリーム
 * source コマンド）、`scripts/source-release.test.ts`（fixture repo 生成用の
 * `git init` / `git add` / `git commit`）はいずれも「呼び出し側が指定した `cwd` の
 * リポジトリだけを見る」契約が必要であり、継承した `GIT_DIR` 等に引きずられると
 * `cwd` を無視して呼び出し元リポジトリを参照してしまう（Issue 79 実装中に
 * `bun test scripts/` 経由の `git commit` で実際に踏んだ回帰。呼び出し元リポジトリの
 * working tree 自体は変わらないが、git index が fixture 内容で汚染される、または
 * release candidate の対象コミットではなく呼び出し元の作業ツリーを読んでしまう）。
 *
 * この 3 箇所が同じ isolation を必要とするため、循環 import を避けてここへ一本化する。
 */
export const GIT_WORKTREE_ISOLATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
] as const;

export function isolatedGitEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  for (const key of GIT_WORKTREE_ISOLATION_ENV_KEYS) delete env[key];
  return env;
}
