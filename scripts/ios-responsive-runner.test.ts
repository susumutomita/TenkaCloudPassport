import { afterAll, expect, it } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCapturedProcess } from './process-capture';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function runHarness(missingDuoRuntime = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'passport-native-runner-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'calls.jsonl');
  mkdirSync(bin);
  const shim = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PASSPORT_TEST_LOG, JSON.stringify({tool, args}) + '\\n');
if (tool === 'xcrun' && args[0] === 'simctl' && args[1] === 'list') {
  console.log(JSON.stringify({runtimes: [
    {isAvailable: true, version: '27.0', identifier: 'runtime-27.0'},
    {isAvailable: process.env.PASSPORT_TEST_MISSING_DUO !== '1', version: '27.1', identifier: 'runtime-27.1'}
  ]}));
} else if (tool === 'xcrun' && args[1] === 'create') {
  console.log('synthetic-device-' + args[3].replaceAll(' ', '-'));
} else if (tool === 'git') {
  console.log('5040fd217f231a24d961e014a0489b9f5caa17b4');
} else if (tool === 'xcodebuild' && args[0] === '-version') {
  console.log('Xcode 27.1');
}
`;
  for (const tool of ['xcrun', 'xcodebuild', 'ruby', 'git']) {
    const file = path.join(bin, tool);
    writeFileSync(file, shim);
    chmodSync(file, 0o700);
  }
  const result = await runCapturedProcess(
    ['bash', path.join(import.meta.dir, '../tests/ios-responsive/run.sh')],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env['PATH'] ?? ''}`,
        PASSPORT_TEST_LOG: log,
        PASSPORT_TEST_MISSING_DUO: missingDuoRuntime ? '1' : '0',
      },
    }
  );
  const calls = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { tool: string; args: string[] });
  return { ...result, calls };
}

it('selects model-compatible runtimes and runs both text sizes without signing', async () => {
  const { exitCode, calls } = await runHarness();
  expect(exitCode).toBe(0);
  const creates = calls.filter(
    ({ tool, args }) => tool === 'xcrun' && args[1] === 'create'
  );
  expect(creates.map(({ args }) => args.slice(3))).toEqual([
    ['iPhone SE (3rd generation)', 'runtime-27.0'],
    ['iPhone 17 Pro', 'runtime-27.0'],
    ['iPhone Duo', 'runtime-27.1'],
    ['iPad Pro 13-inch (M5)', 'runtime-27.0'],
  ]);
  const sizes = calls.filter(
    ({ tool, args }) => tool === 'xcrun' && args[1] === 'ui'
  );
  expect(sizes.map(({ args }) => args[4])).toEqual(
    Array.from({ length: 4 }, () => [
      'large',
      'accessibility-extra-extra-extra-large',
    ]).flat()
  );
  const tests = calls.filter(
    ({ tool, args }) => tool === 'xcodebuild' && args[0] === 'test'
  );
  expect(tests).toHaveLength(8);
  for (const { args } of tests)
    expect(args).toContain('CODE_SIGNING_ALLOWED=NO');
  expect(
    calls.filter(({ tool, args }) => tool === 'xcrun' && args[1] === 'shutdown')
  ).toHaveLength(4);
});

it('fails closed when the Duo runtime is unavailable rather than substituting 27.0', async () => {
  const { exitCode, stderr, calls } = await runHarness(true);
  expect(exitCode).not.toBe(0);
  expect(stderr).toContain('Install the iOS 27.1 simulator runtime');
  expect(
    calls
      .filter(({ tool, args }) => tool === 'xcrun' && args[1] === 'create')
      .map(({ args }) => args[3])
  ).toEqual(['iPhone SE (3rd generation)', 'iPhone 17 Pro']);
});
