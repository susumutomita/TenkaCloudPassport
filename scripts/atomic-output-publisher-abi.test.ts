import { expect, it, mock } from 'bun:test';
import path from 'node:path';

// This file requires Bun's supported file isolation: module mocks are intentionally
// confined to its fresh global and module registry, not restored with mock.restore.
let resolvedModule: unknown = null;
let thenCalls = 0;
let nativeCalls = 0;
const modulePath = path.join(
  import.meta.dir,
  `atomic-output-publisher-${process.platform}.ts`
);
mock.module(modulePath, () => {
  const exports = {
    openEntryNoFollowNative() {
      nativeCalls += 1;
      throw new Error('native open must not execute');
    },
    renameEntryNoReplaceNative() {
      nativeCalls += 1;
      throw new Error('native rename must not execute');
    },
  };
  // Deliberately install a callable export to exercise import assimilation.
  return Object.defineProperty(exports, 'then', {
    enumerable: true,
    value(resolve: (value: unknown) => void) {
      thenCalls += 1;
      resolve(resolvedModule);
    },
  });
});

for (const [label, value] of [
  ['null', null],
  ['primitive', 42],
  ['missing exports', {}],
  ['missing rename', { openEntryNoFollowNative: () => -1 }],
] as const) {
  it(`rejects a thenable native module resolving to ${label} before any native operation`, async () => {
    resolvedModule = value;
    const before = thenCalls;
    const publisher = await import('./atomic-output-publisher');
    let captured: unknown;
    try {
      await publisher.atomicRenameDirectoryNoReplace(
        0,
        'staging',
        'candidate',
        { device: 0, inode: 0 }
      );
    } catch (error: unknown) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(publisher.AtomicOutputPublicationError);
    expect(captured).toMatchObject({
      code: 'UNSUPPORTED_PLATFORM',
      message: 'Descriptor-relative release operations could not be loaded.',
    });
    expect(thenCalls).toBeGreaterThan(before);
    expect(nativeCalls).toBe(0);
  });
}
