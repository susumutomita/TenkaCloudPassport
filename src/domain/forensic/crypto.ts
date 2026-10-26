import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Only the upstream SHA-256/HMAC UTF-8→hex contract; no Node runtime shim. */
function digestBuilder(key?: string) {
  const hash =
    key === undefined ? sha256.create() : hmac.create(sha256, utf8ToBytes(key));
  return {
    update(value: string, _encoding?: 'utf8') {
      hash.update(utf8ToBytes(value));
      return this;
    },
    digest(_encoding: 'hex') {
      return bytesToHex(hash.digest());
    },
  };
}
export function createHash(_algorithm: 'sha256') {
  return digestBuilder();
}
export function createHmac(_algorithm: 'sha256', key: string) {
  return digestBuilder(key);
}
