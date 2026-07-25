import { getRandomValues } from 'expo-crypto';
import { assertValidRandomByteLength } from './random-byte-length-guard';

/**
 * Native Build（Expo Go・Development Build・本番ビルドすべて）向けの実装。
 *
 * Hermes には Web Crypto (`globalThis.crypto`) が実装されておらず、
 * `web-crypto-random.ts` の元の実装をそのまま Native で呼ぶと
 * `Cannot read property 'getRandomValues' of undefined` でクラッシュする
 * （実機スタックトレースで確認済み。会話 Agent の `open()` →
 * `createParticipantId` → `validatedRandomBytes` 経由）。
 *
 * `expo-crypto` の `getRandomValues(typedArray)` は Web Crypto の
 * `crypto.getRandomValues` と同じ「渡した TypedArray を in-place で
 * 暗号学的乱数で埋めて返す」契約で、`byteCount` 上限を持たない
 * （`getRandomBytes` / `getRandomBytesAsync` は 0〜1024 byte 上限があるため
 * 採用しなかった。SESSION_RANDOM_BYTES は 16 byte だが、この関数は
 * 65536 byte まで許容する既存契約を持つため上限のない API が必要）。
 * Web では `expo-crypto` の内部実装が `globalThis.crypto.getRandomValues`
 * にそのまま委譲するため、乱数品質はどちらの実装でも Web Crypto / OS の
 * secure random のままで劣化しない。
 */
export function webCryptoRandomBytes(length: number): Uint8Array {
  assertValidRandomByteLength(length);
  const bytes = new Uint8Array(length);
  getRandomValues(bytes);
  return bytes;
}
