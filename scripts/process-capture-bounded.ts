/**
 * 出力サイズと実行時間に上限を課しながら子プロセスを実行する。ライブの
 * ReadableStream を都度 `await reader.read()` する代わりに、`./process-capture.ts`
 * が一時ファイルへリダイレクトした出力のサイズを定期的に polling して上限超過を
 * 検出する（`./process-capture.ts` 冒頭の doc comment にある Bun 1.3.11 の欠陥を
 * 参照）。暴走／敵対的な外部コマンド（無限に出力し続ける等）に対する防御である点は
 * 変えず、検出の仕組みだけを差し替える。
 *
 * `./process-capture.ts` から分けているのは、`release_test_coverage`
 * (`bun test --coverage scripts/source-release.test.ts`) がそのファイル単体で
 * カバレッジ 100% を要求するため。この polling ロジックは
 * `android-release-identity.ts` だけが使い、`source-release.ts` の依存グラフには
 * 含まれない。
 */

import { readFile, stat } from 'node:fs/promises';
import {
  type RunCapturedProcessOptions,
  spawnWithCapturedStdio,
  withCaptureDirectory,
} from './process-capture';

export type ProcessOverflowStream = 'stdout' | 'stderr' | false;

export interface RunBoundedProcessOptions extends RunCapturedProcessOptions {
  /** この bytes 数を stdout または stderr のいずれかが超えたら kill する。 */
  readonly maxOutputBytes: number;
  /** プロセス開始からこの経過時間で kill する。 */
  readonly timeoutMilliseconds: number;
  /** ファイルサイズの polling 間隔 (既定 20ms)。 */
  readonly pollIntervalMilliseconds?: number;
}

export interface BoundedProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** overflow を検出して kill した場合、どちらの stream が超えたか。 */
  readonly overflowed: ProcessOverflowStream;
  readonly timedOut: boolean;
}

/**
 * polling 中に一時ファイルがまだ作られていない極小の window（spawn 直後の
 * 1 回目の poll 等）を 0 バイトとして扱う。exported なのはこの分岐を直接
 * テストするため。
 */
export async function fileSizeOrZero(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

interface PollOutcome {
  readonly overflowed: ProcessOverflowStream;
  readonly timedOut: boolean;
}

const NO_OVERFLOW_OR_TIMEOUT: PollOutcome = {
  overflowed: false,
  timedOut: false,
};

/**
 * 1 回分の polling で overflow / timeout を検出したか判定する純関数。
 * 分岐をここへ切り出すことで `watchForOverflowOrTimeout` の複雑度を下げる。
 */
function detectPollOutcome(
  stdoutSize: number,
  stderrSize: number,
  maxOutputBytes: number,
  deadline: number
): PollOutcome | null {
  if (stdoutSize > maxOutputBytes)
    return { overflowed: 'stdout', timedOut: false };
  if (stderrSize > maxOutputBytes)
    return { overflowed: 'stderr', timedOut: false };
  if (Date.now() >= deadline) return { overflowed: false, timedOut: true };
  return null;
}

function killIgnoringErrors(child: { kill: (signal: number) => void }): void {
  try {
    child.kill(9);
  } catch {
    // プロセスが先に終了していても、検出した状態を優先する。
  }
}

async function watchForOverflowOrTimeout(
  child: { kill: (signal: number) => void },
  stdoutPath: string,
  stderrPath: string,
  maxOutputBytes: number,
  deadline: number,
  pollIntervalMilliseconds: number,
  isSettled: () => boolean
): Promise<PollOutcome> {
  while (!isSettled()) {
    const [stdoutSize, stderrSize] = await Promise.all([
      fileSizeOrZero(stdoutPath),
      fileSizeOrZero(stderrPath),
    ]);
    const outcome = detectPollOutcome(
      stdoutSize,
      stderrSize,
      maxOutputBytes,
      deadline
    );
    if (outcome === null) {
      await Bun.sleep(pollIntervalMilliseconds);
      continue;
    }
    killIgnoringErrors(child);
    return outcome;
  }
  return NO_OVERFLOW_OR_TIMEOUT;
}

export async function runBoundedProcess(
  command: readonly string[],
  options: RunBoundedProcessOptions
): Promise<BoundedProcessResult> {
  return withCaptureDirectory(async (paths) => {
    const { stdoutPath, stderrPath } = paths;
    const child = await spawnWithCapturedStdio(command, options, paths);
    const pollIntervalMilliseconds = options.pollIntervalMilliseconds ?? 20;
    const deadline = Date.now() + options.timeoutMilliseconds;
    let settled = false;
    const watcher = watchForOverflowOrTimeout(
      child,
      stdoutPath,
      stderrPath,
      options.maxOutputBytes,
      deadline,
      pollIntervalMilliseconds,
      () => settled
    );
    const exitCode = await child.exited;
    settled = true;
    const { overflowed, timedOut } = await watcher;
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ]);
    return { exitCode, overflowed, stderr, stdout, timedOut };
  });
}
