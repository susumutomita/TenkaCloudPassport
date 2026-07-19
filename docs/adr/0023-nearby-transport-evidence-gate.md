# ADR-0023: Nearby Transport 選定を物理証拠 Gate で停止する

- **Status**: Accepted
- **Date**: 2026-07-19
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

Issue 20 は、中央 Relay を使わない iOS / Android の Nearby Transport を実機証拠で選ぶ。
Issue 22 で Platform 非依存の `NearbyTransport` Port と Loopback Contract は完成したが、
Loopback、Web Export、Simulator、静的な API 資料は、異なる OS 間の接続、Local Network Permission、
Personal Hotspot、暗号化された Wire、Background、Reconnect を証明しない。

候補には mDNS と Local Secure Channel、WebRTC DataChannel、Platform Nearby Adapter、BLE 独自 Protocol が
ある。Package の人気や資料上の機能だけで先に選ぶと、実機で成立しない Adapter を Production Path に
固定する危険がある。Packet Capture を証拠として無期限に保存すると、通信層 Metadata と Lounge Data の
保持契約にも反する。

## Decision

Transport 選定そのものではなく、[実機 Spike Protocol](../design/nearby-transport-spike-protocol.md) の
Evidence Gate を採用する。現時点の Selection Status は `Undecided` であり、Preferred Baseline は
`Not selected` です。Phase A で 4 候補を同じ Static Gate にかけ、通過候補から exact route と理由を記録して
選んだ 1 候補だけを Phase B の物理試験へ進める。静的な source review と物理 Evidence を混ぜない。

Phase A は公式 Source と Version、Cross-platform route、Expo / New Architecture、標準 Secure Channel、
License / Maintenance、Application-controlled Telemetry、Topology / Discovery を確認する。Phase B は、
同一 Wi-Fi と Personal Hotspot で各 100 回の Join、iOS Host と Android Host の両方向、3 台以上の Star Relay、
Discovery 無効時の QR Recovery、Internet 遮断、Packet Capture、Permission、Lifecycle、Development Build、
Native Supply Chain を 1 つの Evidence Bundle で確認する。閾値と実施手順は Protocol を正本とする。
Phase A は 4 候補の全 Gate を判定済みにし、各 Candidate を `Pass` または `Fail` とする。1 Gate でも
`Fail` の Candidate は棄却するが、別 Candidate の Phase B を妨げない。1 Candidate 以上が Phase A を
`Pass` した場合だけ 1 候補を Phase B へ進め、その Candidate の物理 Gate に `Not run`、不明、または
失敗が 1 項目でもあれば Transport を選ばない。

raw Packet Capture は `L5`、公開 Evidence Record は `L5P` とする。両者の許可 Field、保存先、共有先、
削除契機は [Privacy データ台帳](../privacy/data-inventory.md) と
[保持ポリシー](../privacy/retention-policy.md) を正本とし、本 ADR では複製しない。

Evidence Gate を満たした後、選んだ Transport、棄却理由、Platform 制約、再検討条件を別の Accepted ADR に
記録する。その ADR と採用 Adapter の Design Issue がない限り、Production Composition は
`NearbyTransport` の Native 実装を持たない。ADR-0023 の Accepted は Issue 20 の Transport 選定完了を
意味しない。

## Consequences

- **Good**: Repository Test と物理端末証拠を混同せず、全候補を同じ Static Gate で比較できる。
- **Good**: Packet Capture を Privacy の例外領域として無期限保存せず、公開 Evidence を最小化できる。
- **Good**: Issue 22 の Port Contract を維持し、Candidate 固有 API を Domain、Agent、UI へ漏らさない。
- **Bad**: iPhone、Android、隔離 Wi-Fi、Personal Hotspot、Packet Capture Reviewer がそろうまで
  Production Adapter を選べない。
- **Tradeoff**: 4 候補すべてを高コストな物理条件で試験せず、同一 Static Gate で通過した候補から 1 つを選び、
  その exact route を深く検証する。公式 API、OS Permission、SDK Telemetry、Expo Native 境界が変わった場合は
  source review を更新し、必要なら新しい Evidence Bundle で物理試験を再実施する。

## References

- 関連設計: [Nearby Transport 実機 Spike Protocol](../design/nearby-transport-spike-protocol.md)
- Port Contract: [Nearby Transport Port と Loopback Reference Adapter](../design/nearby-transport-contract.md)
- Native Evidence: [ADR-0010](./0010-native-delivery-quality-gates.md)
- Handshake: [ADR-0017](./0017-ephemeral-lounge-handshake.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/20
- Transport 実装 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/22
