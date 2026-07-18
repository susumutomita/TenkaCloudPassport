import type { Sha256Source } from './sha256-source';

export type { Sha256Source } from './sha256-source';

export type Sha256ReadErrorCode =
  | 'INVALID_SOURCE'
  | 'READ_FAILED'
  | 'CANCELLED';

export class Sha256ReadError extends Error {
  readonly code: Sha256ReadErrorCode;

  constructor(code: Sha256ReadErrorCode, message: string) {
    super(message);
    this.name = 'Sha256ReadError';
    this.code = code;
  }
}

export interface Sha256ReadOptions {
  readonly chunkSize?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const SHA256_BLOCK_SIZE = 64;

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function messageSchedule(block: Uint8Array): Uint32Array {
  const schedule = new Uint32Array(64);
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  for (let index = 0; index < 16; index += 1) {
    schedule[index] = view.getUint32(index * 4, false);
  }
  for (let index = 16; index < 64; index += 1) {
    const previous15 = schedule[index - 15] ?? 0;
    const previous2 = schedule[index - 2] ?? 0;
    const sigma0 =
      rotateRight(previous15, 7) ^
      rotateRight(previous15, 18) ^
      (previous15 >>> 3);
    const sigma1 =
      rotateRight(previous2, 17) ^
      rotateRight(previous2, 19) ^
      (previous2 >>> 10);
    schedule[index] =
      ((schedule[index - 16] ?? 0) +
        sigma0 +
        (schedule[index - 7] ?? 0) +
        sigma1) >>>
      0;
  }
  return schedule;
}

function compressedWorkingState(
  state: Uint32Array,
  schedule: Uint32Array
): Uint32Array {
  let a = state[0] ?? 0;
  let b = state[1] ?? 0;
  let c = state[2] ?? 0;
  let d = state[3] ?? 0;
  let e = state[4] ?? 0;
  let f = state[5] ?? 0;
  let g = state[6] ?? 0;
  let h = state[7] ?? 0;

  for (let index = 0; index < 64; index += 1) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choose = (e & f) ^ (~e & g);
    const temporary1 =
      (h +
        sum1 +
        choose +
        (ROUND_CONSTANTS[index] ?? 0) +
        (schedule[index] ?? 0)) >>>
      0;
    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temporary2 = (sum0 + majority) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + temporary1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temporary1 + temporary2) >>> 0;
  }
  return new Uint32Array([a, b, c, d, e, f, g, h]);
}

class Sha256Accumulator {
  private readonly state: Uint32Array;

  private readonly buffer: Uint8Array;

  private bufferLength = 0;

  private byteLength = 0;

  constructor() {
    this.state = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ]);
    this.buffer = new Uint8Array(SHA256_BLOCK_SIZE);
  }

  update(bytes: Uint8Array): void {
    this.byteLength += bytes.byteLength;

    let offset = 0;
    while (offset < bytes.byteLength) {
      const copied = Math.min(
        SHA256_BLOCK_SIZE - this.bufferLength,
        bytes.byteLength - offset
      );
      this.buffer.set(
        bytes.subarray(offset, offset + copied),
        this.bufferLength
      );
      this.bufferLength += copied;
      offset += copied;
      if (this.bufferLength === SHA256_BLOCK_SIZE) {
        this.compress(this.buffer);
        this.bufferLength = 0;
      }
    }
  }

  digestHex(): string {
    const finalBlocks = new Uint8Array(
      this.bufferLength < 56 ? SHA256_BLOCK_SIZE : SHA256_BLOCK_SIZE * 2
    );
    finalBlocks.set(this.buffer.subarray(0, this.bufferLength));
    finalBlocks[this.bufferLength] = 0x80;

    const bitLengthHigh = Math.floor(this.byteLength / 0x2000_0000) >>> 0;
    const bitLengthLow = (this.byteLength * 8) >>> 0;
    const lengthView = new DataView(finalBlocks.buffer);
    lengthView.setUint32(finalBlocks.byteLength - 8, bitLengthHigh, false);
    lengthView.setUint32(finalBlocks.byteLength - 4, bitLengthLow, false);

    for (let offset = 0; offset < finalBlocks.byteLength; offset += 64) {
      this.compress(finalBlocks.subarray(offset, offset + 64));
    }

    let hexadecimal = '';
    for (const word of this.state) {
      hexadecimal += word.toString(16).padStart(8, '0');
    }
    return hexadecimal;
  }

  private compress(block: Uint8Array): void {
    const working = compressedWorkingState(this.state, messageSchedule(block));
    for (let index = 0; index < this.state.length; index += 1) {
      this.state[index] =
        ((this.state[index] ?? 0) + (working[index] ?? 0)) >>> 0;
    }
  }
}

function validateReadInput(source: Sha256Source, chunkSize: number): void {
  if (
    !Number.isSafeInteger(source.sizeBytes) ||
    source.sizeBytes < 0 ||
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > DEFAULT_CHUNK_SIZE
  ) {
    throw new Sha256ReadError(
      'INVALID_SOURCE',
      'SHA-256 の File Size または chunk Size が不正です。'
    );
  }
}

function cancelled(): Sha256ReadError {
  return new Sha256ReadError('CANCELLED', 'SHA-256 の計算は取り消されました。');
}

async function readChunk(
  source: Sha256Source,
  offset: number,
  length: number,
  signal: AbortSignal | undefined
): Promise<Uint8Array> {
  if (signal?.aborted) throw cancelled();
  try {
    const bytes = await source.read(offset, length);
    if (signal?.aborted) throw cancelled();
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < 1 ||
      bytes.length > length
    ) {
      throw new Sha256ReadError(
        'READ_FAILED',
        'SHA-256 の File read が完了しませんでした。'
      );
    }
    return bytes;
  } catch (error: unknown) {
    if (error instanceof Sha256ReadError) throw error;
    if (signal?.aborted) throw cancelled();
    throw new Sha256ReadError(
      'READ_FAILED',
      'SHA-256 の File read が失敗しました。'
    );
  }
}

/** Model 全体を展開せず、最大 1 MiB の chunk だけを保持して SHA-256 を計算する。 */
export async function sha256HexFromSource(
  source: Sha256Source,
  options: Sha256ReadOptions = {}
): Promise<string> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  validateReadInput(source, chunkSize);
  if (options.signal?.aborted) throw cancelled();

  const accumulator = new Sha256Accumulator();
  let offset = 0;
  while (offset < source.sizeBytes) {
    const bytes = await readChunk(
      source,
      offset,
      Math.min(chunkSize, source.sizeBytes - offset),
      options.signal
    );
    accumulator.update(bytes);
    offset += bytes.byteLength;
  }
  return accumulator.digestHex();
}
