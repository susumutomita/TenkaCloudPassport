import { expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('recovers a committed original answer in a genuinely new process using file SQLite and a controlled key port', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'passport-cold-restart-'));
  const root = resolve(import.meta.dir, '../../..');
  async function run(phase: string) {
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        'tests/offline/restart-worker.ts',
        directory,
        phase,
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe' }
    );
    const [stdout, _stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit).toBe(0);
    return JSON.parse(stdout);
  }
  try {
    expect(await run('create')).toEqual({
      score: 20,
      revision: 1,
      solved: true,
    });
    expect(await run('recover')).toEqual({
      score: 20,
      revision: 1,
      solved: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
