import { describe, expect, it } from 'bun:test';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import {
  createLoungeId,
  createParticipantId,
  createSessionIdentifiers,
  SessionIdentifierError,
} from './session-identifiers';

function sequentialRandomBytes(): (length: number) => Uint8Array {
  let seed = 1;
  return (length) => {
    const bytes = new Uint8Array(length);
    bytes.fill(seed);
    seed += 1;
    return bytes;
  };
}

function expectIdentifierError(
  action: () => void,
  code: SessionIdentifierError['code']
): void {
  try {
    action();
    throw new Error('SessionIdentifierError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(SessionIdentifierError);
    if (error instanceof SessionIdentifierError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('使い捨て Session ID', () => {
  it('Lounge ID と Participant ID を個別の 128 bit 乱数から生成する', () => {
    const randomBytes = sequentialRandomBytes();

    expect(createLoungeId(randomBytes)).toBe(`lng_${'01'.repeat(16)}`);
    expect(createParticipantId(randomBytes)).toBe(`ptc_${'02'.repeat(16)}`);
  });

  it('注入した独立 128 bit 乱数から Lounge ID と Participant ID を生成する', () => {
    const identifiers = createSessionIdentifiers(sequentialRandomBytes());

    expect(identifiers.loungeId).toBe(`lng_${'01'.repeat(16)}`);
    expect(identifiers.participantId).toBe(`ptc_${'02'.repeat(16)}`);
  });

  it('新しい Session ごとに以前と異なる ID を生成する', () => {
    const randomBytes = sequentialRandomBytes();

    const first = createSessionIdentifiers(randomBytes);
    const second = createSessionIdentifiers(randomBytes);

    expect(second.loungeId).not.toBe(first.loungeId);
    expect(second.participantId).not.toBe(first.participantId);
  });

  it('乱数生成器が 128 bit 以外を返した場合は発行しない', () => {
    expectIdentifierError(
      () => createSessionIdentifiers(() => new Uint8Array(15)),
      'INVALID_RANDOM_LENGTH'
    );
  });

  it('同じ byte 列が衝突した場合は発行しない', () => {
    expectIdentifierError(
      () => createSessionIdentifiers(() => new Uint8Array(16).fill(1)),
      'RANDOM_COLLISION'
    );
  });

  it('すべて 0 の byte 列を受け取った場合は発行しない', () => {
    expectIdentifierError(
      () =>
        createSessionIdentifiers((length) => {
          const bytes = new Uint8Array(length);
          bytes[length - 1] = 0;
          return bytes;
        }),
      'INVALID_RANDOM_VALUE'
    );
  });

  it('Web Crypto 境界は要求した長さの独立した乱数を返す', () => {
    const first = webCryptoRandomBytes(16);
    const second = webCryptoRandomBytes(16);

    expect(first).toHaveLength(16);
    expect(second).toHaveLength(16);
    expect(second).not.toEqual(first);
  });

  it('Web Crypto 境界は範囲外の乱数長を拒否する', () => {
    expect(() => webCryptoRandomBytes(0)).toThrow(RangeError);
  });
});
