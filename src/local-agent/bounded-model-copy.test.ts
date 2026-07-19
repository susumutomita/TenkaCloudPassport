import { describe, expect, it } from 'bun:test';
import { copyModelBytesBounded } from './bounded-model-copy';
import {
  LocalModelCopyError,
  type LocalModelCopyErrorCode,
} from './model-lifecycle';

function byteReader(bytes: Uint8Array): {
  readonly readBytes: (length: number) => Uint8Array;
} {
  let offset = 0;
  return {
    readBytes(length) {
      const chunk = bytes.slice(offset, offset + length);
      offset += chunk.byteLength;
      return chunk;
    },
  };
}

async function expectCopyError(
  operation: () => Promise<unknown>,
  code: LocalModelCopyErrorCode
): Promise<void> {
  try {
    await operation();
    throw new Error('LocalModelCopyError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalModelCopyError);
    if (!(error instanceof LocalModelCopyError)) throw error;
    expect(error.code).toBe(code);
  }
}

describe('GGUF の上限付き chunk copy', () => {
  it('chunk Size 未指定時も既定上限で空 Source を完了する', async () => {
    expect(
      await copyModelBytesBounded(
        {
          source: byteReader(new Uint8Array()),
          destination: { writeBytes: () => undefined },
          availableDiskSpaceBytes: () => 1_000,
        },
        { maximumBytes: 1, minimumFreeBytes: 100 }
      )
    ).toBe(0);
  });

  it('申告 Size と同じ byte 列だけを chunk ごとに書き込む', async () => {
    const written: number[] = [];
    const copied = await copyModelBytesBounded(
      {
        source: byteReader(new Uint8Array([1, 2, 3, 4])),
        destination: {
          writeBytes(bytes) {
            written.push(...bytes);
          },
        },
        availableDiskSpaceBytes: () => 1_000,
        chunkBytes: 2,
        yieldToEventLoop: async () => undefined,
      },
      { maximumBytes: 4, minimumFreeBytes: 100 }
    );

    expect(copied).toBe(4);
    expect(written).toEqual([1, 2, 3, 4]);
  });

  it('Source が申告 Size を 1 byte でも超えた時点で拒否する', async () => {
    const written: number[] = [];
    await expectCopyError(
      () =>
        copyModelBytesBounded(
          {
            source: byteReader(new Uint8Array([1, 2, 3, 4])),
            destination: {
              writeBytes(bytes) {
                written.push(...bytes);
              },
            },
            availableDiskSpaceBytes: () => 1_000,
            chunkBytes: 2,
            yieldToEventLoop: async () => undefined,
          },
          { maximumBytes: 3, minimumFreeBytes: 100 }
        ),
      'LIMIT_EXCEEDED'
    );
    expect(written).toEqual([1, 2]);
  });

  it('Copy 中に空き容量が reserve を割る場合は次の chunk を書かない', async () => {
    const written: number[] = [];
    let availableBytes = 104;
    await expectCopyError(
      () =>
        copyModelBytesBounded(
          {
            source: byteReader(new Uint8Array([1, 2, 3, 4])),
            destination: {
              writeBytes(bytes) {
                written.push(...bytes);
                availableBytes = 101;
              },
            },
            availableDiskSpaceBytes: () => availableBytes,
            chunkBytes: 2,
            yieldToEventLoop: async () => undefined,
          },
          { maximumBytes: 4, minimumFreeBytes: 100 }
        ),
      'INSUFFICIENT_STORAGE'
    );
    expect(written).toEqual([1, 2]);
  });

  it('別 macrotask の Abort を chunk 境界で検出し、以後の byte を書かない', async () => {
    const controller = new AbortController();
    const written: number[] = [];
    setTimeout(() => controller.abort(), 0);
    await expectCopyError(
      () =>
        copyModelBytesBounded(
          {
            source: byteReader(new Uint8Array([1, 2, 3, 4])),
            destination: {
              writeBytes(bytes) {
                written.push(...bytes);
              },
            },
            availableDiskSpaceBytes: () => 1_000,
            chunkBytes: 2,
          },
          {
            maximumBytes: 4,
            minimumFreeBytes: 100,
            signal: controller.signal,
          }
        ),
      'ABORTED'
    );
    expect(written).toEqual([1, 2]);
  });

  it('不正な chunk Size を fail-closed に拒否する', async () => {
    await expectCopyError(
      () =>
        copyModelBytesBounded(
          {
            source: byteReader(new Uint8Array()),
            destination: { writeBytes: () => undefined },
            availableDiskSpaceBytes: () => 1_000,
            chunkBytes: 0,
          },
          { maximumBytes: 0, minimumFreeBytes: 100 }
        ),
      'LIMIT_EXCEEDED'
    );
  });
});
