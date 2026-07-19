import {
  LocalModelCopyError,
  type LocalModelCopyOptions,
} from './model-lifecycle';

export interface BoundedModelCopySource {
  readonly readBytes: (length: number) => Uint8Array;
}

export interface BoundedModelCopyDestination {
  readonly writeBytes: (bytes: Uint8Array) => void;
}

export interface BoundedModelCopyDependencies {
  readonly source: BoundedModelCopySource;
  readonly destination: BoundedModelCopyDestination;
  readonly availableDiskSpaceBytes: () => number;
  readonly chunkBytes?: number;
  /** UI Event を処理できる macrotask 境界。Test では決定的な scheduler を注入できる。 */
  readonly yieldToEventLoop?: () => Promise<void>;
}

const DEFAULT_COPY_CHUNK_BYTES = 1024 * 1024;

function yieldToNextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 申告 Size と保全 reserve の両方を chunk ごとに強制する内容非解釈 Copy。 */
export async function copyModelBytesBounded(
  dependencies: BoundedModelCopyDependencies,
  options: LocalModelCopyOptions
): Promise<number> {
  const chunkBytes = dependencies.chunkBytes ?? DEFAULT_COPY_CHUNK_BYTES;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new LocalModelCopyError('LIMIT_EXCEEDED');
  }
  let copiedBytes = 0;
  while (true) {
    if (options.signal?.aborted) throw new LocalModelCopyError('ABORTED');
    const remainingBytes = options.maximumBytes - copiedBytes;
    const requestedBytes = Math.min(
      chunkBytes,
      Math.max(1, remainingBytes + 1)
    );
    const bytes = dependencies.source.readBytes(requestedBytes);
    if (bytes.byteLength === 0) break;
    if (bytes.byteLength > remainingBytes) {
      throw new LocalModelCopyError('LIMIT_EXCEEDED');
    }
    const availableBytes = dependencies.availableDiskSpaceBytes();
    if (
      !Number.isSafeInteger(availableBytes) ||
      availableBytes < options.minimumFreeBytes + bytes.byteLength
    ) {
      throw new LocalModelCopyError('INSUFFICIENT_STORAGE');
    }
    dependencies.destination.writeBytes(bytes);
    copiedBytes += bytes.byteLength;
    await (dependencies.yieldToEventLoop ?? yieldToNextMacrotask)();
  }
  return copiedBytes;
}
