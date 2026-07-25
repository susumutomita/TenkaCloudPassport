import { assertValidRandomByteLength } from './random-byte-length-guard';

/**
 * Bun Test / Web Build は Web Crypto (`globalThis.crypto`) をそのまま使う。
 * Native Build（Expo Go・Development Build・本番ビルドすべて）は Hermes に
 * Web Crypto が実装されていないため `web-crypto-random.native.ts` へ差し替える。
 */
export function webCryptoRandomBytes(length: number): Uint8Array {
  assertValidRandomByteLength(length);
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
