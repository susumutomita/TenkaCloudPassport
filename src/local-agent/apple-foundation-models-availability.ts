/**
 * ADR-0057: Apple Intelligence（FoundationModels）の Native `availability()` 境界。
 * Native から届く生値は `unknown` として扱い、Swift 側の
 * `AppleFoundationModelsAvailability`（`modules/apple-foundation-models/ios/
 * AppleFoundationModelsEngine.swift`）の rawValue と一致する既知の文字列だけを
 * 受理する。未知の値・型・Native 呼び出し自体の失敗は、すべて
 * `{ status: 'unavailable', reason: 'unknown' }` へ fail-closed に丸める
 * （Android / Web / Expo Go で Native Module が存在しない場合も同じ形に正規化する）。
 */

export type AppleFoundationModelsUnavailableReason =
  | 'device-not-eligible'
  | 'apple-intelligence-not-enabled'
  | 'model-not-ready'
  | 'unsupported-os'
  | 'unknown';

export type AppleFoundationModelsAvailability =
  | { readonly status: 'available' }
  | {
      readonly status: 'unavailable';
      readonly reason: AppleFoundationModelsUnavailableReason;
    };

const UNKNOWN_UNAVAILABLE: AppleFoundationModelsAvailability = {
  status: 'unavailable',
  reason: 'unknown',
};

/**
 * `/simplify` 指摘: 接頭辞の切り出し + Set 判定という 2 段階の解釈をやめ、
 * Native の rawValue（`AppleFoundationModelsEngine.swift` の `AppleFoundationModelsAvailability`
 * enum）と 1 対 1 の table にする。TS↔Swift の文字列契約がこの 1 箇所で
 * 直接 grep できるようになり、どちらかの文字列だけを変えて他方を直し忘れる
 * drift（実際に発生した：Swift 側は `unavailable-unknown` だが、この
 * table 化以前は TS 側テストが存在しない `unavailable-unknown-reason` を
 * 検査しており、fail-closed の既定値に偶然一致して見逃されていた）を
 * 構造的に防ぐ。
 */
const KNOWN_AVAILABILITY = new Map<string, AppleFoundationModelsAvailability>([
  ['available', { status: 'available' }],
  [
    'unavailable-device-not-eligible',
    { status: 'unavailable', reason: 'device-not-eligible' },
  ],
  [
    'unavailable-apple-intelligence-not-enabled',
    { status: 'unavailable', reason: 'apple-intelligence-not-enabled' },
  ],
  [
    'unavailable-model-not-ready',
    { status: 'unavailable', reason: 'model-not-ready' },
  ],
  [
    'unavailable-unsupported-os',
    { status: 'unavailable', reason: 'unsupported-os' },
  ],
  ['unavailable-unknown', UNKNOWN_UNAVAILABLE],
]);

/** Native `availability()` の raw 値を bounded な判定結果へ解析する純関数。 */
export function parseAppleFoundationModelsAvailability(
  value: unknown
): AppleFoundationModelsAvailability {
  if (typeof value !== 'string') return UNKNOWN_UNAVAILABLE;
  return KNOWN_AVAILABILITY.get(value) ?? UNKNOWN_UNAVAILABLE;
}

/**
 * Native 読み取り（Expo Module 不在で `null` を返す・呼び出し自体が reject する
 * 両方を含む）を検証済みの判定結果へ変換する。UI（Settings / 会話画面）が
 * 「この端末は非対応」の案内を出すために使う読み取り専用境界で、
 * 会話エージェントの実行経路（`apple-foundation-models-provider.ts`）とは
 * 独立している。
 */
export async function checkAppleFoundationModelsAvailability(
  read: () => Promise<unknown>
): Promise<AppleFoundationModelsAvailability> {
  try {
    return parseAppleFoundationModelsAvailability(await read());
  } catch {
    return UNKNOWN_UNAVAILABLE;
  }
}
