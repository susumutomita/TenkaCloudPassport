/**
 * `Bun.spawn` / `Bun.spawnSync` の `stdout: 'pipe'` / `stderr: 'pipe'` は、`bun test`
 * 自身がリポジトリ直下を再帰的に走査している間（test-file 探索。`expo prebuild` /
 * `expo run:ios` が生成するネイティブ `ios/` 配下、特に CocoaPods の
 * `Pods/Headers/Public/**` symlink 群、8000 件超）、子プロセスの標準出力・標準エラーが
 * 空文字列で返る、または読み取りが完了せず無期限に stall するという Bun 1.3.11 の
 * 既知でない実行時挙動を踏む（子プロセス自体は exit code どおり正しく完了しており、
 * git / bun 側の欠陥ではない）。`ios/` は .gitignore 済みで CI には存在しないため
 * CI は常に緑だが、ローカルでネイティブ側を 1 度でもビルドした環境では
 * `bun test scripts/` が再現性なく壊れる。
 *
 * ここでは子プロセスの標準出力・標準エラーを OS パイプではなく一時ファイルへ
 * リダイレクトし、プロセス終了後に読み戻す。`Bun.spawn` 自身が `Bun.file(path)` を
 * 開いて子の fd へ直接 dup するため、この読み取り経路は上記の欠陥を踏まない
 * （実測で確認済み。`node:child_process` 経由や、既に開いた fd を渡す方式は
 * 同じ環境下でも空文字列を返すことがあり、`Bun.spawn` + `Bun.file(path)` の組が
 * 唯一安定して機能した）。標準入力も同様で、`Uint8Array` をそのまま `stdin` へ
 * 渡すと同じ条件下で子プロセスに届かないことがあるため、一時ファイルに書き出して
 * `Bun.file(path)` として渡す。詳細と再現手順は
 * docs/adr/0028-process-capture-avoids-bun-test-pipe-defect.md を参照。
 *
 * ここで export する低レベルヘルパー（`withCaptureDirectory` / `baseSpawnOptions` /
 * `resolveStdinOption`）は `./process-capture-bounded.ts` からも再利用する。同期版
 * (`Bun.spawnSync`) は `./process-capture-sync.ts` に分けている。`release_test_coverage`
 * (`bun test --coverage scripts/source-release.test.ts`) はこのファイル単体の
 * カバレッジ 100% を要求するため、`source-release.test.ts` が実際に経由しない
 * コードパス（bounded の polling / sync 版）を同じファイルに置くとカバレッジ
 * ゲートを壊す。
 */

import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

export interface CapturedProcessResult {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: string;
}

export interface RunCapturedProcessOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdin?: Uint8Array;
}

export interface CaptureFilePaths {
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdinPath: string;
}

const CAPTURE_DIRECTORY_PREFIX = 'tenka-process-capture-';

function captureFilePaths(directory: string): CaptureFilePaths {
  return {
    stderrPath: join(directory, 'stderr.bin'),
    stdinPath: join(directory, 'stdin.bin'),
    stdoutPath: join(directory, 'stdout.bin'),
  };
}

export async function withCaptureDirectory<T>(
  run: (paths: CaptureFilePaths) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), CAPTURE_DIRECTORY_PREFIX));
  try {
    return await run(captureFilePaths(directory));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

/**
 * 呼び出し先の低レベル spawn 呼び出しに渡す共通オプションへ組み立てる。
 * `exactOptionalPropertyTypes` の下で `undefined` を明示代入しないよう、
 * 定義済みの key だけを条件付きで足す。
 */
function baseSpawnOptions(
  options: Pick<RunCapturedProcessOptions, 'cwd' | 'env'>
): { cwd?: string; env?: Record<string, string | undefined> } {
  return {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: { ...options.env } }),
  };
}

/**
 * `stdin` が指定されていれば一時ファイルへ書き出し、`Bun.file(path)` を spawn
 * オプションへ足す（doc comment のとおり、生の `Uint8Array` を直接渡す経路は
 * 同じ欠陥を踏むため使わない）。
 */
async function resolveStdinOption(
  stdin: Uint8Array | undefined,
  stdinPath: string
): Promise<{ stdin?: ReturnType<typeof Bun.file> }> {
  if (stdin === undefined) return {};
  await writeFile(stdinPath, stdin);
  return { stdin: Bun.file(stdinPath) };
}

/**
 * `command` を、標準出力・標準エラーを一時ファイルへリダイレクトした状態で
 * spawn する。`runCapturedProcess` / `runProcessStdoutIntoSink` /
 * `./process-capture-bounded.ts` の `runBoundedProcess` が共有する、この
 * モジュールで唯一の実際の `Bun.spawn` 呼び出し箇所。
 */
export async function spawnWithCapturedStdio(
  command: readonly string[],
  options: RunCapturedProcessOptions,
  paths: CaptureFilePaths
): Promise<ReturnType<typeof Bun.spawn>> {
  return Bun.spawn([...command], {
    ...baseSpawnOptions(options),
    ...(await resolveStdinOption(options.stdin, paths.stdinPath)),
    stderr: Bun.file(paths.stderrPath),
    stdout: Bun.file(paths.stdoutPath),
  });
}

/**
 * 子プロセスを起動し、標準出力・標準エラーを一時ファイル経由で読み戻す。
 * `command[0]` はテスト・本番双方で `bun` / `git` / `tar` / `xcrun` など
 * 呼び出し元が信頼した実行ファイルであることを前提とする。
 */
export async function runCapturedProcess(
  command: readonly string[],
  options: RunCapturedProcessOptions = {}
): Promise<CapturedProcessResult> {
  return withCaptureDirectory(async (paths) => {
    const child = await spawnWithCapturedStdio(command, options, paths);
    const exitCode = await child.exited;
    const [stdout, stderr] = await Promise.all([
      readFile(paths.stdoutPath),
      readFile(paths.stderrPath, 'utf8'),
    ]);
    return { exitCode, stderr, stdout: new Uint8Array(stdout) };
  });
}

/**
 * 子プロセスの標準出力を、完了後に一時ファイルから読み出す `Readable` として
 * `sink` へ渡す。ストリーミング hash など、標準出力を消費しながら別の宛先へ
 * 書き込む用途向け（`exclusive-output-writer.ts` 参照）。
 */
export async function runProcessStdoutIntoSink(
  command: readonly string[],
  sink: (stdout: Readable) => Promise<void>,
  options: RunCapturedProcessOptions = {}
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  return withCaptureDirectory(async (paths) => {
    const child = await spawnWithCapturedStdio(command, options, paths);
    const exitCode = await child.exited;
    const stderr = await readFile(paths.stderrPath, 'utf8');
    if (exitCode === 0) {
      await sink(createReadStream(paths.stdoutPath));
    }
    return { exitCode, stderr };
  });
}
