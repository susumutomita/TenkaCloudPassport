import { describe, expect, it } from 'bun:test';
import {
  CAPABILITY_MAX_REQUIRED,
  CAPABILITY_TOKEN_MAX_LENGTH,
} from '../domain/capability';
import { LOUNGE_TTL_MS } from '../domain/lounge';
import {
  createLoungeInvite,
  LOUNGE_DISCOVERY_HINT_MAX_LENGTH,
  LOUNGE_INVITE_MAX_CAPACITY,
  type LoungeInvite,
} from '../domain/lounge-invite';
import { encodeQrPayload, QR_PAYLOAD_MAX_BYTES } from './qr-payload';

// Version 17・誤り訂正 M の QR データ容量（byte）。1,024 byte という「壊れない上限」
// (QR_PAYLOAD_MAX_BYTES) とは別に、「実カメラで快適に読める上限」として Issue 73 が
// 定めた設計目標。Version 26 まで許容する現行仕様のままだと最大 121 module の高密度
// QR になり得るため、Lounge Invite はこの予算内を目指す。
const QR_VERSION_17_BYTE_BUDGET = 504;

function byteLength(raw: string): number {
  return new TextEncoder().encode(raw).byteLength;
}

function maxLengthCapabilityToken(distinguisher: string): string {
  const suffix = '-v9';
  const paddingLength =
    CAPABILITY_TOKEN_MAX_LENGTH - distinguisher.length - suffix.length;
  return `${distinguisher}${'a'.repeat(paddingLength)}${suffix}`;
}

function typicalLoungeInvite(): LoungeInvite {
  return createLoungeInvite({
    loungeId: `lng_${'a1'.repeat(16)}`,
    joinSecret: `jsc_${'b2'.repeat(32)}`,
    hostDiscoveryHint: 'local-v1:host-a',
    transportFingerprint: `sha256_${'c3'.repeat(32)}`,
    issuedAtEpochMs: 1_000_000,
    expiresAtEpochMs: 1_000_000 + 10 * 60 * 1000,
    capacity: 2,
    requiredCapabilities: ['rules-provider-v1'],
  });
}

function maxFieldLoungeInvite(): LoungeInvite {
  const requiredCapabilities = Array.from(
    { length: CAPABILITY_MAX_REQUIRED },
    (_unused, index) =>
      maxLengthCapabilityToken(String.fromCharCode('a'.charCodeAt(0) + index))
  );
  return createLoungeInvite({
    loungeId: `lng_${'a1'.repeat(16)}`,
    joinSecret: `jsc_${'b2'.repeat(32)}`,
    hostDiscoveryHint: 'a'.repeat(LOUNGE_DISCOVERY_HINT_MAX_LENGTH),
    transportFingerprint: `sha256_${'c3'.repeat(32)}`,
    issuedAtEpochMs: 1_800_000_000_000,
    expiresAtEpochMs: 1_800_000_000_000 + LOUNGE_TTL_MS - 1,
    capacity: LOUNGE_INVITE_MAX_CAPACITY,
    requiredCapabilities,
  });
}

describe('Invite payload の encode 後サイズ予算', () => {
  it('典型的な Lounge Invite を encode すると Version 17 の 504 byte 予算内に収まる', () => {
    const raw = encodeQrPayload({
      kind: 'lounge-invite',
      value: typicalLoungeInvite(),
    });

    expect(byteLength(raw)).toBeLessThanOrEqual(QR_VERSION_17_BYTE_BUDGET);
  });

  it('schema v2 の Lounge Invite を各 field 最大長で組み立てて encode すると 504 byte 予算を超過する', () => {
    // hostDiscoveryHint（128 文字）と requiredCapabilities（4 件 × 32 文字）を
    // src/domain/lounge-invite.ts の制約どおり最大まで満たすと、固定長 ID / hash /
    // 時刻 / capacity を含む envelope 全体は 725 byte（QR Version 22 相当）になり、
    // Issue 73 が定めた 504 byte 予算を 221 byte 超過する。内訳: 固定長 ID / hash /
    // 時刻 2 つ / capacity / hostDiscoveryHint 1 文字 / requiredCapabilities 1 件の
    // ベースが 493 byte、hostDiscoveryHint を 1→128 文字にすると +127 byte、
    // requiredCapabilities を 1→4 件（各 32 文字）にすると +105 byte で 725 byte になる。
    // この超過は現実に起きるものであり、テストの閾値を 725 byte 側へ緩めるのではなく、
    // 実測を回帰の基準として固定する。hostDiscoveryHint / requiredCapabilities の
    // 上限設計の見直しは owner 判断に委ねる（docs/design/qr-invite-and-ready-flow.md の
    // 「M3 受け入れ基準」節、follow-up 参照）。
    const raw = encodeQrPayload({
      kind: 'lounge-invite',
      value: maxFieldLoungeInvite(),
    });
    const encodedBytes = byteLength(raw);

    expect(encodedBytes).toBeGreaterThan(QR_VERSION_17_BYTE_BUDGET);
    expect(encodedBytes).toBe(725);
    // 「壊れない上限」(QR_PAYLOAD_MAX_BYTES = 1,024 byte) 自体は超過しないことは
    // 別途固定する。
    expect(encodedBytes).toBeLessThanOrEqual(QR_PAYLOAD_MAX_BYTES);
  });
});
