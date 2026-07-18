import { describe, expect, it } from 'bun:test';
import {
  Sha256ReadError,
  type Sha256Source,
  sha256HexFromSource,
} from './sha256';

function byteSource(bytes: Uint8Array, maximumReturnedBytes?: number) {
  let largestRequest = 0;
  let reads = 0;
  const source: Sha256Source = {
    sizeBytes: bytes.byteLength,
    async read(offset, length) {
      largestRequest = Math.max(largestRequest, length);
      reads += 1;
      const returnedLength = Math.min(
        length,
        maximumReturnedBytes ?? length,
        bytes.byteLength - offset
      );
      return bytes.slice(offset, offset + Math.max(0, returnedLength));
    },
  };
  return {
    source,
    observation: () => ({ largestRequest, reads }),
  };
}

async function errorCode(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    throw new Error('Sha256ReadError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Sha256ReadError);
    return error instanceof Sha256ReadError ? error.code : 'unexpected';
  }
}

describe('GGUF File の incremental SHA-256', () => {
  it('空 File と abc の既知 Vector を正しい小文字 hexadecimal にする', async () => {
    const empty = byteSource(new Uint8Array());
    const abc = byteSource(new TextEncoder().encode('abc'));

    expect(await sha256HexFromSource(empty.source)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(await sha256HexFromSource(abc.source)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('padding が 2 block になる 56 byte 境界を正しく処理する', async () => {
    const bytes = Uint8Array.from({ length: 56 }, (_, index) => index);

    expect(await sha256HexFromSource(byteSource(bytes).source)).toBe(
      'da2ae4d6b36748f2a318f23e7ab1dfdf45acdc9d049bd80e59de82a60895f562'
    );
  });

  it('1 MiB を超える File も指定 chunk 以下で逐次読み込み、短い read を継続する', async () => {
    const bytes = new Uint8Array(1_500_123);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 251;
    }
    const chunkSize = 64 * 1024;
    const source = byteSource(bytes, 4_097);

    expect(await sha256HexFromSource(source.source, { chunkSize })).toBe(
      'a9c000d3c94fcac6a9edb70e96fe6a0107bd8b183e8b38a8cd110c305c88ec58'
    );
    expect(source.observation().largestRequest).toBeLessThanOrEqual(chunkSize);
    expect(source.observation().reads).toBeGreaterThan(300);
  });

  it('宣言 Size より前に空 read になれば READ_FAILED にする', async () => {
    const source: Sha256Source = {
      sizeBytes: 10,
      async read() {
        return new Uint8Array();
      },
    };

    expect(await errorCode(() => sha256HexFromSource(source))).toBe(
      'READ_FAILED'
    );
  });

  it('Native read の例外と要求 Size 超過を READ_FAILED に正規化する', async () => {
    const failed: Sha256Source = {
      sizeBytes: 1,
      async read() {
        throw new Error('native read failed');
      },
    };
    const oversized: Sha256Source = {
      sizeBytes: 1,
      async read() {
        return new Uint8Array([1, 2]);
      },
    };

    expect(await errorCode(() => sha256HexFromSource(failed))).toBe(
      'READ_FAILED'
    );
    expect(await errorCode(() => sha256HexFromSource(oversized))).toBe(
      'READ_FAILED'
    );

    const invalidType = byteSource(new Uint8Array([1])).source;
    Object.defineProperty(invalidType, 'read', {
      value: async () => 'not-bytes',
    });
    expect(await errorCode(() => sha256HexFromSource(invalidType))).toBe(
      'READ_FAILED'
    );
  });

  it('Native read 中に Abort された場合は read 結果を採用しない', async () => {
    const controller = new AbortController();
    const source: Sha256Source = {
      sizeBytes: 1,
      async read() {
        controller.abort();
        return new Uint8Array([1]);
      },
    };

    expect(
      await errorCode(() =>
        sha256HexFromSource(source, { signal: controller.signal })
      )
    ).toBe('CANCELLED');

    const throwingController = new AbortController();
    const throwing: Sha256Source = {
      sizeBytes: 1,
      async read() {
        throwingController.abort();
        throw new Error('permission revoked');
      },
    };
    expect(
      await errorCode(() =>
        sha256HexFromSource(throwing, {
          signal: throwingController.signal,
        })
      )
    ).toBe('CANCELLED');
  });

  it('Abort 済みなら追加 read を行わず CANCELLED にする', async () => {
    const controller = new AbortController();
    controller.abort();
    let reads = 0;
    const source: Sha256Source = {
      sizeBytes: 3,
      async read() {
        reads += 1;
        return new Uint8Array([1, 2, 3]);
      },
    };

    expect(
      await errorCode(() =>
        sha256HexFromSource(source, { signal: controller.signal })
      )
    ).toBe('CANCELLED');
    expect(reads).toBe(0);
  });

  it('不正な Size と chunk Size を Native read 前に拒否する', async () => {
    const invalidSize: Sha256Source = {
      sizeBytes: Number.POSITIVE_INFINITY,
      async read() {
        return new Uint8Array();
      },
    };
    const valid = byteSource(new Uint8Array([1]));

    expect(await errorCode(() => sha256HexFromSource(invalidSize))).toBe(
      'INVALID_SOURCE'
    );
    expect(
      await errorCode(() => sha256HexFromSource(valid.source, { chunkSize: 0 }))
    ).toBe('INVALID_SOURCE');
    expect(
      await errorCode(() =>
        sha256HexFromSource(valid.source, { chunkSize: 1024 * 1024 + 1 })
      )
    ).toBe('INVALID_SOURCE');
  });
});
