import { describe, expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileSizeOrZero, runBoundedProcess } from './process-capture-bounded';

async function temporaryDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'tenka-process-capture-bounded-test-'));
}

describe('fileSizeOrZero', () => {
  it('存在しないパスに対しては 0 を返す（例外を外へ伝播させない）', async () => {
    const directory = await temporaryDirectory();
    const missingPath = join(directory, 'does-not-exist.bin');
    expect(await fileSizeOrZero(missingPath)).toBe(0);
  });
});

describe('runBoundedProcess', () => {
  it('上限内で完了した場合は overflow も timeout も発生しない', async () => {
    const result = await runBoundedProcess(
      ['bun', '-e', "console.log('bounded-ok');"],
      { maxOutputBytes: 1024, timeoutMilliseconds: 5000 }
    );
    expect(result.exitCode).toBe(0);
    expect(result.overflowed).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('bounded-ok');
  });

  it('stdout が上限を超えたら kill して overflowed: "stdout" を返す', async () => {
    const result = await runBoundedProcess(
      [
        'bun',
        '-e',
        "while (true) { process.stdout.write('0123456789'.repeat(1024)); }",
      ],
      {
        maxOutputBytes: 4096,
        pollIntervalMilliseconds: 5,
        timeoutMilliseconds: 5000,
      }
    );
    expect(result.overflowed).toBe('stdout');
    expect(result.timedOut).toBe(false);
  });

  it('stderr が上限を超えたら kill して overflowed: "stderr" を返す', async () => {
    const result = await runBoundedProcess(
      [
        'bun',
        '-e',
        "while (true) { console.error('0123456789'.repeat(1024)); }",
      ],
      {
        maxOutputBytes: 4096,
        pollIntervalMilliseconds: 5,
        timeoutMilliseconds: 5000,
      }
    );
    expect(result.overflowed).toBe('stderr');
    expect(result.timedOut).toBe(false);
  });

  it('制限時間を超えたら kill して timedOut: true を返す', async () => {
    const result = await runBoundedProcess(
      ['bun', '-e', 'await new Promise(() => {});'],
      {
        maxOutputBytes: 1024 * 1024,
        pollIntervalMilliseconds: 5,
        timeoutMilliseconds: 50,
      }
    );
    expect(result.timedOut).toBe(true);
    expect(result.overflowed).toBe(false);
  });
});
