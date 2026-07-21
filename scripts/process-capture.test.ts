import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runCapturedProcess,
  runProcessStdoutIntoSink,
} from './process-capture';

async function temporaryDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'tenka-process-capture-test-'));
}

describe('runCapturedProcess', () => {
  it('標準出力と標準エラーを一時ファイル経由で読み戻し、終了コードとともに返す', async () => {
    const result = await runCapturedProcess([
      'bun',
      '-e',
      "console.log('stdout-line'); console.error('stderr-line');",
    ]);
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toContain('stdout-line');
    expect(result.stderr).toContain('stderr-line');
  });

  it('0 以外の終了コードもそのまま返す', async () => {
    const result = await runCapturedProcess(['bun', '-e', 'process.exit(3);']);
    expect(result.exitCode).toBe(3);
  });

  it('cwd を指定すると子プロセスの作業ディレクトリに反映される', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'marker.txt'), 'present');
    const result = await runCapturedProcess(
      [
        'bun',
        '-e',
        "console.log(require('node:fs').existsSync('marker.txt'));",
      ],
      { cwd: directory }
    );
    expect(new TextDecoder().decode(result.stdout).trim()).toBe('true');
  });

  it('env を指定すると子プロセスの環境変数に反映される', async () => {
    const result = await runCapturedProcess(
      ['bun', '-e', 'console.log(process.env.TENKA_CAPTURE_TEST_VAR);'],
      { env: { ...process.env, TENKA_CAPTURE_TEST_VAR: 'expected-value' } }
    );
    expect(new TextDecoder().decode(result.stdout).trim()).toBe(
      'expected-value'
    );
  });

  it('stdin を指定すると子プロセスの標準入力に渡る', async () => {
    const result = await runCapturedProcess(
      [
        'bun',
        '-e',
        'process.stdout.write(await new Response(Bun.stdin.stream()).text());',
      ],
      { stdin: new TextEncoder().encode('piped-input') }
    );
    expect(new TextDecoder().decode(result.stdout)).toBe('piped-input');
  });
});

describe('runProcessStdoutIntoSink', () => {
  it('終了コードが 0 のとき、標準出力を Readable として sink に渡す', async () => {
    const directory = await temporaryDirectory();
    const destinationPath = join(directory, 'sink-output.txt');
    const chunks: Buffer[] = [];
    const result = await runProcessStdoutIntoSink(
      ['bun', '-e', "process.stdout.write('sink-content');"],
      async (stdout) => {
        for await (const chunk of stdout) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        await writeFile(destinationPath, Buffer.concat(chunks));
      }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const written = await readFile(destinationPath, 'utf8');
    expect(written).toBe('sink-content');
  });

  it('終了コードが 0 以外のとき sink を呼ばず stderr を返す', async () => {
    let sinkCalled = false;
    const result = await runProcessStdoutIntoSink(
      ['bun', '-e', "console.error('sink-failure'); process.exit(1);"],
      async () => {
        sinkCalled = true;
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('sink-failure');
    expect(sinkCalled).toBe(false);
  });

  it('大きな入力でも hash を計算しながら宛先へ書き込める（実 I/O）', async () => {
    const directory = await temporaryDirectory();
    const destinationPath = join(directory, 'large-sink-output.bin');
    const expectedContents = Buffer.alloc(256 * 1024, 0x5a);
    const expectedHash = createHash('sha256')
      .update(expectedContents)
      .digest('hex');
    const sourcePath = join(directory, 'source.bin');
    await writeFile(sourcePath, expectedContents);

    let computedHash = '';
    const result = await runProcessStdoutIntoSink(
      [
        'bun',
        '-e',
        `process.stdout.write(await Bun.file(${JSON.stringify(sourcePath)}).bytes());`,
      ],
      async (stdout) => {
        const hash = createHash('sha256');
        const output = await import('node:fs').then((fs) =>
          fs.createWriteStream(destinationPath)
        );
        for await (const chunk of stdout) {
          hash.update(chunk as Buffer);
          output.write(chunk);
        }
        await new Promise<void>((resolve) => output.end(resolve));
        computedHash = hash.digest('hex');
      }
    );
    expect(result.exitCode).toBe(0);
    expect(computedHash).toBe(expectedHash);
    const written = await readFile(destinationPath);
    expect(written.equals(expectedContents)).toBe(true);
  });
});
