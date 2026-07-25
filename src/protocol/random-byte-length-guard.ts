const MIN_RANDOM_BYTE_LENGTH = 1;
const MAX_RANDOM_BYTE_LENGTH = 65_536;

/**
 * `web-crypto-random.ts`（Web / Bun Test）と `web-crypto-random.native.ts`
 * （Native Build）は同じ `webCryptoRandomBytes(length)` 契約を Platform ごとに
 * 独立実装するが、乱数長の境界検証だけはここへ集約する。2 ファイルにそれぞれ
 * 境界値・エラーメッセージを書くと、片方だけ変更したときに契約が drift しても
 * 気づけない（code review 指摘、ADR-0040）。
 */
export function assertValidRandomByteLength(length: number): void {
  if (
    !Number.isSafeInteger(length) ||
    length < MIN_RANDOM_BYTE_LENGTH ||
    length > MAX_RANDOM_BYTE_LENGTH
  ) {
    throw new RangeError(
      `Web Crypto の乱数長は ${MIN_RANDOM_BYTE_LENGTH} 以上 ${MAX_RANDOM_BYTE_LENGTH} 以下にしてください。`
    );
  }
}
