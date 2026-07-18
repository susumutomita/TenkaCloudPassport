import { createWriteStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function parseIdentity(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Invalid output directory identity.');
  }
  return parsed;
}

export async function writeExclusiveOutput(
  arguments_: readonly string[],
  standardInput: ReadableStream<Uint8Array>,
  workingDirectory: string
): Promise<void> {
  const [fileName, deviceSource, inodeSource, separator, ...command] =
    arguments_;
  if (
    fileName === undefined ||
    fileName.length === 0 ||
    path.basename(fileName) !== fileName ||
    separator !== '--'
  ) {
    throw new Error('Invalid exclusive output writer arguments.');
  }
  const expectedDevice = parseIdentity(deviceSource);
  const expectedInode = parseIdentity(inodeSource);
  const cwdStatus = await lstat(workingDirectory);
  if (
    !cwdStatus.isDirectory() ||
    cwdStatus.isSymbolicLink() ||
    cwdStatus.dev !== expectedDevice ||
    cwdStatus.ino !== expectedInode
  ) {
    throw new Error('Output directory identity changed before writing.');
  }
  const source =
    command.length === 0
      ? standardInput
      : Bun.spawn(command, {
          cwd: workingDirectory,
          stdout: 'pipe',
          stderr: 'pipe',
        });
  const output = createWriteStream(path.join(workingDirectory, fileName), {
    flags: 'wx',
  });
  if (source instanceof ReadableStream) {
    await pipeline(Readable.from(source), output);
    return;
  }
  const [exitCode, stderr] = await Promise.all([
    source.exited,
    new Response(source.stderr).text(),
    pipeline(Readable.from(source.stdout), output),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Output source command failed: ${stderr.trim()}`);
  }
}
