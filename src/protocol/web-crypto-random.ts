export function webCryptoRandomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 1 || length > 65_536) {
    throw new RangeError(
      'Web Crypto の乱数長は 1 以上 65536 以下にしてください。'
    );
  }
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
