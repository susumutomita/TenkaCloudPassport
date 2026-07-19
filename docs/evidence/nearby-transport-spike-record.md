# Nearby Transport 実機 Spike Evidence Record

- Record Version: `NEARBY-TRANSPORT-SPIKE-2`

本 Record は [Nearby Transport 実機 Spike Protocol](../design/nearby-transport-spike-protocol.md) の公開結果だけを
保持する。

`Evidence bundle binding record` を Candidate、Build、Capture、Analyzer、実行月、Review の唯一の Metadata 正本、
`Decision record` を選定状態の唯一の正本とする。以下の Physical 詳細表は Binding record の 1 Bundle を暗黙に
継承し、行ごとに Bundle ID を手入力しない。別 Bundle の結果を使う場合は Record 全体を分ける。

Static Candidate Status と Physical Rubric Status は手入力の独立判断ではない。Candidate Status は 7 Static Gate、
Physical Rubric Status は各行の `Source record` にある全 Atomic Status と数値閾値から導出する。参照先が 1 件でも
`Not run` または `Fail` なら Rubric は `Pass` にしない。

Static Gate の各 Cell は `Pass — 公開根拠` または `Fail — 棄却理由` とし、根拠のない `Pass` を書かない。
Physical 詳細表の Atomic Status は Protocol の該当 Pass threshold を満たす値があれば `Pass`、Failure condition が
1 件でもあれば `Fail`、値または検証が欠ければ `Not run` とする。

## Static screening record

| Candidate | Candidate route and version | Official source | Cross-platform route | Expo and New Architecture | Standard secure channel | License, maintenance, provenance | Application-controlled telemetry | Topology and discovery | Static status | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mDNS + Local WebSocket / Secure Channel | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | Static screening incomplete |
| WebRTC DataChannel + QR Signaling | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | Static screening incomplete |
| Platform Adapter (Multipeer / Nearby) | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | Exact platform route not selected |
| BLE Custom Protocol (comparison only) | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | Static screening incomplete |

Primary source の API premise を読んだことは Static Status の `Pass` ではない。全列と Rationale を Candidate ごとに
埋めるまで Physical Spike Candidate を選ばない。

## Evidence bundle binding record

| Binding field | Value |
| --- | --- |
| Evidence Bundle ID | `Not run` |
| Candidate and exact route | `Not run` |
| Candidate version or OS API version | `Not run` |
| Candidate source locator | `Not run` |
| Repository Git commit | `Not run` |
| iOS public Build ID | `Not run` |
| iOS artifact SHA-256 | `Not run` |
| iOS OS major | `Not run` |
| Android public Build ID | `Not run` |
| Android artifact SHA-256 | `Not run` |
| Android OS major | `Not run` |
| Analysis script version | `Not run` |
| Analysis script SHA-256 | `Not run` |
| Sensitive Field Manifest SHA-256 | `Not run` |
| Positive-control Fixture SHA-256 | `Not run` |
| Capture Tool version | `Not run` |
| Execution Month | `Not run` |
| Public Review PR | `Not run` |
| Security and Privacy attestation | `Not run` |

この表が以下の全 Physical Record を 1 つの Evidence Bundle ID へ結び付ける。異なる Bundle の数値、Build、
Capture、Review を合算しない。

Binding の iOS は `physical-iphone`、Android は `physical-android` の実機だけを表す。製品 model、UDID、
Android ID、Serial、IP、MAC、SSID、BSSID、Owner 名、正確な実行日時は記録しない。

## Join measurement record

| Network fixture | Direction | Planned joins | Attempts | Successes | Permission failures | Status |
| --- | --- | ---: | --- | --- | --- | --- |
| Same Wi-Fi | iPhone Host → Android Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |
| Same Wi-Fi | Android Host → iPhone Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | iPhone Host → Android Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | Android Host → iPhone Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |

## Network fixture summary record

| Network fixture | Planned attempts | Attempts | Successes | Success rate | Median ms | p95 ms | Disconnects | Disconnect rate | Permission failures | Status |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Same Wi-Fi | 100 | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | 100 | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |

## Network isolation record

| Network fixture | Platform class | Reachability before | Reachability after | Public DNS queries | External endpoints | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Same Wi-Fi | `physical-iphone` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Same Wi-Fi | `physical-android` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | `physical-iphone` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | `physical-android` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |

Attempt ごとの Log は作らない。方向ごと 50 件以下の monotonic duration 配列と固定 Failure Counter だけを
検証端末の Process Memory で扱い、方向別事実と Network fixture 集計へ転記した直後に破棄する。

## Physical rubric record

| Gate | Source record | Derived status |
| --- | --- | --- |
| iOS and Android interoperability | Evidence bundle binding、Join measurement である。 | `Not run` |
| Offline network | Network isolation、Packet capture である。 | `Not run` |
| Encryption and peer authentication | Security binding、Packet capture である。 | `Not run` |
| Join experience | Join measurement、Network fixture summary、Lifecycle and permission である。 | `Not run` |
| Group lifecycle | Star relay、Lifecycle and permission である。 | `Not run` |
| Discovery recovery | Discovery-disabled recovery である。 | `Not run` |
| Background and reconnect | Lifecycle and permission である。 | `Not run` |
| Expo and New Architecture | Evidence bundle binding、Expo and supply-chain である。 | `Not run` |
| Supply chain | Evidence bundle binding、Expo and supply-chain である。 | `Not run` |
| Privacy and telemetry | Static screening、Packet capture、Privacy 正本である。 | `Not run` |

## Lifecycle and permission record

| Scenario | Result | Status |
| --- | --- | --- |
| QR to Ready operations | `Not run` | `Not run` |
| Permission explanation | `Not run` | `Not run` |
| Permission denied | `Not run` | `Not run` |
| Permission restored | `Not run` | `Not run` |
| Background then foreground | `Not run` | `Not run` |
| Network switch | `Not run` | `Not run` |
| Hotspot disconnect | `Not run` | `Not run` |
| Target routing | `Not run` | `Not run` |
| Guest leave | `Not run` | `Not run` |
| Dispose | `Not run` | `Not run` |

## Star relay record

| Host platform | Participants | Broadcast | Target | Guest leave | Host end ≤ 5 seconds | Status |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Android | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |

## Discovery-disabled recovery record

| Host platform | Planned attempts | Attempts | Successes | Status |
| --- | ---: | --- | --- | --- |
| iPhone | 5 | `Not run` | `Not run` | `Not run` |
| Android | 5 | `Not run` | `Not run` | `Not run` |

## Security binding record

| Security check | Value | Status |
| --- | --- | --- |
| Negotiated protocol and cipher | `Not run` | `Not run` |
| QR fingerprint equals peer key | `Not run` | `Not run` |
| Fingerprint mismatch rejected | `Not run` | `Not run` |
| Untrusted peer key rejected | `Not run` | `Not run` |
| Expired and replayed QR rejected | `Not run` | `Not run` |
| Plaintext fallback rejected | `Not run` | `Not run` |

## Packet capture record

| Field | Value |
| --- | --- |
| Capture status | `Not run` |
| Capture SHA-256 | `Not run` |
| Canary set SHA-256 | `Not run` |
| Serialized Envelope set SHA-256 | `Not run` |
| Analyzer positive-control status | `Not run` |
| Candidate flow packets | `Not run` |
| Candidate flow bytes | `Not run` |
| Canary Envelopes sent and received | `Not run` |
| Capture coverage status | `Not run` |
| Sensitive Field Manifest coverage | `Not run` |
| Full Canary matches | `Not run` |
| Canary fragment matches | `Not run` |
| Encoded representation matches | `Not run` |
| External endpoints | `Not run` |
| Raw L5 retention attestation | `Not run` |
| Ephemeral volume and sync disabled | `Not run` |
| Encryption key destroyed | `Not run` |
| Reviewer verdict | `Not run` |

raw Capture、Canary cleartext、通信層 Address、Packet Timing は記録しない。raw `L5` の保存と削除は
[保持ポリシー](../privacy/retention-policy.md)、この公開 `L5P` Record の Field は
[Privacy データ台帳](../privacy/data-inventory.md) に従う。

## Expo and supply-chain record

| Gate | Value | Status |
| --- | --- | --- |
| Expo Go boundary | `Not run` | `Not run` |
| iOS Development Build | `Not run` | `Not run` |
| Android Development Build | `Not run` | `Not run` |
| React Native New Architecture | `Not run` | `Not run` |
| Candidate source matches Phase A | `Not run` | `Not run` |
| License and maintainer status | `Not run` | `Not run` |
| Native Artifact provenance | `Not run` | `Not run` |
| Application-controlled SDK analytics | `Not run` | `Not run` |
| Spike code absent from Production Path | `Not run` | `Not run` |

## Decision record

- Final decision: `Not made`
- Static Screening Status: `Not run`
- Physical Spike Candidate: `Not selected`
- Physical Execution Status: `Not run`
- Selection Status: `Undecided`
- Preferred Baseline: `Not selected`
- Rejected candidates: `None`
- Platform constraints: `Not run`
- Reconsideration triggers: `Not run`
- Follow-on Accepted ADR: `Not created`
- Issue 20 close gate: `Blocked by physical evidence`

4 Candidate の Static 判定、Phase A を `Pass` した 1 Candidate の整合した Evidence Bundle、
全 Physical gate、独立 Review が完了するまで、`Selected`、`Accepted transport`、`Production ready`、
Issue 完了を主張しない。
