/**
 * `./process-capture.ts`（`runCapturedProcess`）の同期版。`Bun.spawnSync` +
 * `Bun.file` の組で同じ一時ファイル経由の読み戻しを行う（欠陥の詳細は
 * `./process-capture.ts` 冒頭の doc comment を参照）。
 *
 * `./process-capture.ts` から分けているのは、`release_test_coverage`
 * (`bun test --coverage scripts/source-release.test.ts`) がそのファイル単体で
 * カバレッジ 100% を要求するため。同期版は `architecture-harness.test.ts` の
 * CLI 統合テストだけが使い、`source-release.ts` の依存グラフには含まれない。
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  CapturedProcessResult,
  RunCapturedProcessOptions,
} from './process-capture';

const CAPTURE_DIRECTORY_PREFIX = 'tenka-process-capture-sync-';

export function runCapturedProcessSync(
  command: readonly string[],
  options: Pick<RunCapturedProcessOptions, 'cwd' | 'env'> = {}
): CapturedProcessResult {
  const directory = mkdtempSync(join(tmpdir(), CAPTURE_DIRECTORY_PREFIX));
  const stdoutPath = join(directory, 'stdout.bin');
  const stderrPath = join(directory, 'stderr.bin');
  try {
    const result = Bun.spawnSync([...command], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      stderr: Bun.file(stderrPath),
      stdout: Bun.file(stdoutPath),
    });
    const stdout = readFileSync(stdoutPath);
    const stderr = readFileSync(stderrPath, 'utf8');
    return {
      exitCode: result.exitCode,
      stderr,
      stdout: new Uint8Array(stdout),
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}
